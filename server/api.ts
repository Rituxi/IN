import { Router } from 'express';
import { Redis as UpstashRedis } from '@upstash/redis';
import Redis from 'ioredis';
import { GoogleGenAI, Type } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

export const apiRouter = Router();

interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  lpush(key: string, value: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  ltrim(key: string, start: number, stop: number): Promise<void>;
  lrem(key: string, count: number, value: string): Promise<number>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  scan(cursor: string, options?: { match?: string; count?: number }): Promise<[string, string[]]>;
  eval(script: string, keys: string[], args: (string | number)[]): Promise<number>;
}

class IORedisAdapter implements RedisClient {
  private client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      tls: url.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
    });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    await this.client.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    const result = await this.client.incr(key);
    return result;
  }

  async lpush(key: string, value: string): Promise<number> {
    return this.client.lpush(key, value);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lrange(key, start, stop);
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    await this.client.ltrim(key, start, stop);
  }

  async lrem(key: string, count: number, value: string): Promise<number> {
    const result = await this.client.lrem(key, count, value);
    return typeof result === 'number' ? result : parseInt(result as string, 10);
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return this.client.mget(...keys);
  }

  async scan(cursor: string, options?: { match?: string; count?: number }): Promise<[string, string[]]> {
    const result = await this.client.scan(parseInt(cursor), 'MATCH', options?.match || '*', 'COUNT', options?.count || 100);
    return result;
  }

  async eval(script: string, keys: string[], args: (string | number)[]): Promise<number> {
    const result = await this.client.eval(script, keys.length, ...keys, ...args);
    return typeof result === 'number' ? result : parseInt(result as string, 10);
  }
}

class UpstashRedisAdapter implements RedisClient {
  private client: UpstashRedis;

  constructor(url: string, token: string) {
    this.client = new UpstashRedis({ url, token });
  }

  async get(key: string): Promise<string | null> {
    const result = await this.client.get(key);
    if (result === null) return null;
    return typeof result === 'string' ? result : JSON.stringify(result);
  }

  async set(key: string, value: string): Promise<void> {
    await this.client.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    const result = await this.client.incr(key);
    return typeof result === 'number' ? result : parseInt(result as string, 10);
  }

  async lpush(key: string, value: string): Promise<number> {
    const result = await this.client.lpush(key, value);
    return typeof result === 'number' ? result : parseInt(result as string, 10);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const result = await this.client.lrange(key, start, stop);
    return result.map(r => typeof r === 'string' ? r : JSON.stringify(r));
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    await this.client.ltrim(key, start, stop);
  }

  async lrem(key: string, count: number, value: string): Promise<number> {
    const result = await this.client.lrem(key, count, value);
    return typeof result === 'number' ? result : parseInt(result as string, 10);
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    const result = await this.client.mget(...keys);
    return result.map(r => {
      if (r === null) return null;
      return typeof r === 'string' ? r : JSON.stringify(r);
    });
  }

  async scan(cursor: string, options?: { match?: string; count?: number }): Promise<[string, string[]]> {
    const result = await this.client.scan(cursor, options);
    return [result[0], result[1]];
  }

  async eval(script: string, keys: string[], args: (string | number)[]): Promise<number> {
    const result = await this.client.eval(script, keys, args.map(String));
    return typeof result === 'number' ? result : parseInt(result as string, 10);
  }
}

let redisClient: RedisClient | null = null;

function getRedisClient(): RedisClient {
  if (redisClient) return redisClient;
  
  const redisUrl = process.env.REDIS_URL;
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl) {
    console.log('Using Redis TCP connection (REDIS_URL)');
    redisClient = new IORedisAdapter(redisUrl);
    return redisClient;
  }

  if (upstashUrl && upstashToken) {
    console.log('Using Upstash Redis REST API (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)');
    redisClient = new UpstashRedisAdapter(upstashUrl, upstashToken);
    return redisClient;
  }

  console.warn('Redis configuration missing. Please set either REDIS_URL or (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)');
  throw new Error('Redis configuration missing. Please set either REDIS_URL or (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)');
}

export async function checkRedisConnection(): Promise<boolean> {
  try {
    const client = getRedisClient();
    await client.get('health:check');
    console.log('Redis connection: OK');
    return true;
  } catch (error) {
    console.error('Redis connection: FAILED', error);
    return false;
  }
}

// Lazily initialized Redis client wrapper
const redis: RedisClient = {
  get: (key: string) => getRedisClient().get(key),
  set: (key: string, value: string) => getRedisClient().set(key, value),
  del: (key: string) => getRedisClient().del(key),
  incr: (key: string) => getRedisClient().incr(key),
  lpush: (key: string, value: string) => getRedisClient().lpush(key, value),
  lrange: (key: string, start: number, stop: number) => getRedisClient().lrange(key, start, stop),
  ltrim: (key: string, start: number, stop: number) => getRedisClient().ltrim(key, start, stop),
  lrem: (key: string, count: number, value: string) => getRedisClient().lrem(key, count, value),
  mget: (...keys: string[]) => getRedisClient().mget(...keys),
  scan: (cursor: string, options?: { match?: string; count?: number }) => getRedisClient().scan(cursor, options),
  eval: (script: string, keys: string[], args: (string | number)[]) => getRedisClient().eval(script, keys, args),
};

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// Constants
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const IP_API_CONFIG = {
  providers: [
    {
      name: 'ip-api',
      url: (ip: string) => `https://ip-api.com/json/${ip}?lang=zh-CN`,
      parse: (data: any) => {
        if (data.status === 'success' && data.country === '中国') {
          const province = data.regionName || '';
          const city = data.city || '';
          if (province && city) return `${province} ${city}`;
          if (province) return province;
        }
        return null;
      }
    },
    {
      name: 'ipapi',
      url: (ip: string) => `https://ipapi.co/${ip}/json/`,
      parse: (data: any) => {
        if (data.country === 'CN' && !data.error) {
          const province = data.region || '';
          const city = data.city || '';
          if (province && city) return `${province} ${city}`;
          if (province) return province;
        }
        return null;
      }
    }
  ].filter(p => {
    const enabledProviders = (process.env.IP_API_PROVIDERS || 'ip-api,ipapi').split(',').map(s => s.trim());
    return enabledProviders.includes(p.name);
  }),
  timeoutMs: parseInt(process.env.IP_API_TIMEOUT_MS || '3000', 10),
  maxRetries: parseInt(process.env.IP_API_MAX_RETRIES || '2', 10),
  rateLimitPerMinute: parseInt(process.env.IP_API_RATE_LIMIT || '40', 10)
};

async function checkIpApiRateLimit(): Promise<boolean> {
  const key = 'rate_limit:ip_api';
  const limit = IP_API_CONFIG.rateLimitPerMinute;
  const luaScript = `
    local current = redis.call('GET', KEYS[1])
    if current and tonumber(current) >= tonumber(ARGV[1]) then
      return 0
    else
      local newCount = redis.call('INCR', KEYS[1])
      if newCount == 1 then
        redis.call('EXPIRE', KEYS[1], 60)
      end
      return 1
    end
  `;
  const result = await redis.eval(luaScript, [key], [limit]);
  return result === 1;
}

// Level Configuration
interface LevelConfig {
  ocrLimit: number;
  summaryLimit: number;
  ocrModel: string;
  summaryModel: string;
}

const SUPPORTED_MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview'
];

const DEFAULT_LEVEL_CONFIGS: Record<string, LevelConfig> = {
  care: {
    ocrLimit: 25,
    summaryLimit: 25,
    ocrModel: 'gemini-3.1-flash-lite-preview',
    summaryModel: 'gemini-3.1-flash-lite-preview'
  },
  care_plus: {
    ocrLimit: 50,
    summaryLimit: 50,
    ocrModel: 'gemini-3.1-flash-lite-preview',
    summaryModel: 'gemini-3.1-flash-lite-preview'
  },
  king: {
    ocrLimit: 9999,
    summaryLimit: 9999,
    ocrModel: 'gemini-3-flash-preview',
    summaryModel: 'gemini-3-flash-preview'
  }
};

async function getLevelConfigs(): Promise<Record<string, LevelConfig>> {
  try {
    const configStr = await redis.get('level_configs');
    if (configStr) {
      const parsed = typeof configStr === 'string' ? JSON.parse(configStr) : configStr;
      return parsed;
    }
    await redis.set('level_configs', JSON.stringify(DEFAULT_LEVEL_CONFIGS));
    return { ...DEFAULT_LEVEL_CONFIGS };
  } catch (error) {
    console.error('Failed to parse level configs from Redis, using defaults:', error);
    await redis.set('level_configs', JSON.stringify(DEFAULT_LEVEL_CONFIGS));
    return { ...DEFAULT_LEVEL_CONFIGS };
  }
}

async function updateLevelConfigs(configs: Record<string, LevelConfig>): Promise<void> {
  await redis.set('level_configs', JSON.stringify(configs));
}

// Helper: Check Admin Auth
const checkAdmin = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${ADMIN_PASSWORD}`) {
    next();
  } else {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid admin password' });
  }
};

// --- User Management ---
async function getUser(userId: string) {
  const userStr = await redis.get(`user:${userId}`);
  if (userStr) {
    return typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
  }
  
  const configs = await getLevelConfigs();
  const defaultConfig = configs.care;
  
  const newUser = {
    userId,
    level: 'care',
    ocrUsed: 0,
    ocrLimit: defaultConfig.ocrLimit,
    summaryUsed: 0,
    summaryLimit: defaultConfig.summaryLimit,
    extraQuota: 0,
    totalUsedCount: 0,
    isUnlimited: false,
    isPro: false,
    firstUsedAt: new Date().toISOString(),
    note: '',
    status: 'active',
  };
  await redis.set(`user:${userId}`, JSON.stringify(newUser));
  return newUser;
}

async function updateUser(userId: string, data: any) {
  const user = await getUser(userId);
  const updated = { ...user, ...data };
  
  if (data.level) {
    const configs = await getLevelConfigs();
    const config = configs[data.level];
    if (!config) {
      throw new Error(`Invalid level: ${data.level}`);
    }
    updated.ocrLimit = config.ocrLimit;
    updated.summaryLimit = config.summaryLimit;
    updated.isUnlimited = data.level === 'king';
    updated.isPro = data.level === 'king' || data.level === 'care_plus';
  }
  
  await redis.set(`user:${userId}`, JSON.stringify(updated));
  return updated;
}

function isPrivateIp(ip: string): boolean {
  if (!ip || ip === 'unknown') return true;
  
  const privateIpRegex = /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.|::1$|localhost$)/i;
  if (privateIpRegex.test(ip)) return true;
  
  if (ip.startsWith('::ffff:')) {
    const ipv4 = ip.substring(7);
    return privateIpRegex.test(ipv4);
  }
  
  return false;
}

async function getIpLocation(ip: string): Promise<string> {
  if (isPrivateIp(ip)) {
    return '本地网络';
  }
  
  if (!(await checkIpApiRateLimit())) {
    console.warn('IP API rate limit exceeded, skipping location lookup');
    return '未知';
  }
  
  const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };

  for (const provider of IP_API_CONFIG.providers) {
    for (let attempt = 0; attempt < IP_API_CONFIG.maxRetries; attempt++) {
      try {
        const response = await fetchWithTimeout(provider.url(ip), IP_API_CONFIG.timeoutMs);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const location = provider.parse(data);
        if (location) {
          return location;
        }
        break;
      } catch (error: any) {
        console.error(`IP location lookup failed (${provider.name}, attempt ${attempt + 1}/${IP_API_CONFIG.maxRetries}):`, error.message);
        if (attempt < IP_API_CONFIG.maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
  }
  
  return '未知';
}

async function logUsage(userId: string, ip: string, feature: string, monthlyUsedCount: number, totalUsedCount: number) {
  const ipLocation = await getIpLocation(ip);
  const log = {
    id: `log_${uuidv4()}`,
    userId,
    ip,
    ipLocation,
    feature,
    monthlyUsedCount,
    totalUsedCount,
    usedAt: new Date().toISOString(),
    status: 'success',
  };
  const logStr = JSON.stringify(log);
  await redis.lpush('usage_logs', logStr);
  await redis.set(`log_index:${log.id}`, logStr);
  await redis.ltrim('usage_logs', 0, 999);
  
  // Update global stats
  await redis.incr('stats:totalCalls');
  const today = new Date().toISOString().split('T')[0];
  await redis.incr(`stats:dailyCalls:${today}`);
  const month = today.substring(0, 7);
  await redis.incr(`stats:monthlyCalls:${month}`);
}

// --- API Routes ---

// 0. WeChat OpenID API
apiRouter.post('/wx/openid', async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) {
      return res.status(400).json({ error: 'CODE_REQUIRED', message: '缺少微信登录code' });
    }

    const appid = process.env.WX_APPID;
    const secret = process.env.WX_APPSECRET;

    if (!appid || !secret) {
      console.error('WX_APPID or WX_APPSECRET not configured');
      return res.status(500).json({ error: 'WX_CONFIG_MISSING', message: '服务器微信配置缺失' });
    }

    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
    const response = await fetch(url);
    const data = await response.json() as any;

    if (data.errcode) {
      console.error('WeChat API error:', data);
      return res.status(400).json({ error: 'WECHAT_API_ERROR', detail: data });
    }

    if (!data.openid) {
      return res.status(400).json({ error: 'OPENID_FETCH_FAILED', detail: data });
    }

    return res.json({ openid: data.openid, session_key: data.session_key });
  } catch (e: any) {
    console.error('OpenID fetch error:', e);
    return res.status(500).json({ error: 'SERVER_ERROR', message: e.message });
  }
});

// Helper: Validate openid and get user (supports both mini-program openid and web userId)
async function validateAndGetUser(openid: string | undefined, userId: string | undefined) {
  const effectiveUserId = openid || userId;
  
  if (!effectiveUserId) {
    return { valid: false, error: { status: 401, response: { error: 'AUTH_REQUIRED', message: '缺少用户身份，请先登录' } } };
  }
  
  const user = await getUser(effectiveUserId);
  
  return { valid: true, user, effectiveUserId };
}

// 1. OCR API
apiRouter.post('/analyze/image-base64', async (req, res) => {
  try {
    const { base64, mimeType, userId, nickname, openid } = req.body;
    
    if (!base64) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Missing base64' });
    }

    const validation = await validateAndGetUser(openid, userId);
    if (!validation.valid) {
      return res.status(validation.error!.status).json(validation.error!.response);
    }
    
    const user = validation.user!;
    const effectiveUserId = validation.effectiveUserId!;
    const totalOcrLimit = user.ocrLimit + user.extraQuota;
    
    if (!user.isUnlimited && user.ocrUsed >= totalOcrLimit) {
      return res.status(403).json({ error: 'QUOTA_EXCEEDED', message: '本月免费额度已用完' });
    }

    const configs = await getLevelConfigs();
    const levelConfig = configs[user.level] || configs.care;
    const modelToUse = levelConfig.ocrModel;

    const SYSTEM_INSTRUCTION = `You are a medical data assistant for kidney disease patients.
Your task is to extract medical examination data from images and convert it into a structured JSON object.

Output Rules:
1. Return ONLY a valid JSON object, no extra text.
2. The JSON must match this structure EXACTLY:
{
  "title": "检查报告标题",
  "date": "YYYY-MM-DD格式的日期字符串",
  "hospital": "医院名称",
  "doctor": "医生姓名（如无则留空字符串）",
  "notes": "备注信息（如无则留空字符串）",
  "items": [
    {
      "name": "检查项名称",
      "value": "检测值（字符串）",
      "unit": "单位",
      "range": "参考范围"
    }
  ]
}

CRITICAL INSTRUCTIONS FOR ITEMS EXTRACTION:
- You MUST extract ALL test items/indicators from the image
- Each row in a medical report table represents ONE item
- Look for columns like: 检查项目/项目名称, 结果/检测值, 单位, 参考范围/正常值
- Common medical indicators include: 尿蛋白, 肌酐, 尿素氮, 白蛋白, 血红蛋白, etc.
- If you see a table with multiple test items, extract EACH ONE as a separate item
- Do NOT leave the items array empty if there is data in the image

IMPORTANT:
- date MUST be a STRING in format "YYYY-MM-DD" (e.g. "2025-12-15"), NOT a timestamp number
- items array should only contain: name, value, unit, range
- Do NOT add fields like "id", "categoryName", "configName"
- If the image is unclear or no medical data is found, still return the structure with empty items array`;

    const response = await ai.models.generateContent({
      model: modelToUse,
      contents: [
        {
          parts: [
            {
              inlineData: {
                data: base64.replace(/^data:image\/\w+;base64,/, ''),
                mimeType: mimeType || 'image/jpeg',
              },
            },
            {
              text: 'Carefully examine this medical report image. Extract ALL test items/indicators from any tables or lists. Each test item should have: name (检查项目名称), value (检测结果数值), unit (单位), range (参考范围). Return as JSON.',
            },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            date: { type: Type.STRING },
            hospital: { type: Type.STRING },
            doctor: { type: Type.STRING },
            notes: { type: Type.STRING },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  value: { type: Type.STRING },
                  unit: { type: Type.STRING },
                  range: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    const resultText = response.text || '{}';
    const resultJson = JSON.parse(resultText);

    user.ocrUsed += 1;
    user.totalUsedCount += 1;
    await redis.set(`user:${effectiveUserId}`, JSON.stringify(user));
    
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await logUsage(effectiveUserId, ip as string, 'ocr', user.ocrUsed, user.totalUsedCount);

    res.json(resultJson);
  } catch (error: any) {
    console.error('OCR Error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// 2. Summary API
apiRouter.post('/summary/text', async (req, res) => {
  try {
    const { userId, examData, promptSlot, nickname, userLevel, model, openid } = req.body;
    
    if (!examData) {
      return res.status(400).json({ success: false, error: 'INVALID_REQUEST', message: 'Missing examData' });
    }

    const validation = await validateAndGetUser(openid, userId);
    if (!validation.valid) {
      return res.status(validation.error!.status).json(validation.error!.response);
    }
    
    const user = validation.user!;
    const effectiveUserId = validation.effectiveUserId!;
    const totalSummaryLimit = user.summaryLimit + user.extraQuota;
    
    if (!user.isUnlimited && user.summaryUsed >= totalSummaryLimit) {
      return res.status(403).json({ success: false, error: 'QUOTA_EXCEEDED', message: '本月次数已用完' });
    }

    const configs = await getLevelConfigs();
    const levelConfig = configs[user.level] || configs.care;
    const modelToUse = levelConfig.summaryModel;

    const prompt = `Please provide a smart summary for the following medical exam data.
    Data: ${JSON.stringify(examData)}
    Provide a concise, professional, and easy-to-understand summary of the indicators. Highlight any abnormalities.`;

    const response = await ai.models.generateContent({
      model: modelToUse,
      contents: prompt,
    });

    const summary = response.text || 'No summary generated.';

    user.summaryUsed += 1;
    user.totalUsedCount += 1;
    await redis.set(`user:${effectiveUserId}`, JSON.stringify(user));
    
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await logUsage(effectiveUserId, ip as string, 'summary', user.summaryUsed, user.totalUsedCount);

    res.json({
      success: true,
      summary,
      quota: {
        remaining: user.isUnlimited ? 9999 : (totalSummaryLimit - user.summaryUsed),
        used: user.summaryUsed,
        limit: totalSummaryLimit,
        resetAt: '2026-04-01 00:00:00'
      }
    });
  } catch (error: any) {
    console.error('Summary Error:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: error.message });
  }
});

// 3. User Quota API
apiRouter.get('/user/quota', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const openid = req.query.openid as string;
    
    const effectiveUserId = openid || userId;
    if (!effectiveUserId) {
      return res.status(400).json({ success: false, error: 'INVALID_REQUEST', message: 'Missing openid or userId' });
    }

    const user = await getUser(effectiveUserId);
    
    res.json({
      success: true,
      data: {
        userId: user.userId,
        isPro: user.isPro,
        isUnlimited: user.isUnlimited,
        extraQuota: user.extraQuota,
        ocrUsed: user.ocrUsed,
        ocrLimit: user.ocrLimit,
        summaryUsed: user.summaryUsed,
        summaryLimit: user.summaryLimit,
        resetAt: '2026-04-01 00:00:00'
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: error.message });
  }
});

// 4. Redeem API
apiRouter.post('/user/redeem', async (req, res) => {
  try {
    const { code, userId, openid } = req.body;
    const effectiveUserId = openid || userId;
    if (!code || !effectiveUserId) {
      return res.status(400).json({ success: false, message: 'Missing code or openid' });
    }

    const redeemStr = await redis.get(`redeem:${code}`);
    if (!redeemStr) {
      return res.status(404).json({ success: false, message: '兑换码无效或已被使用' });
    }

    const redeem = typeof redeemStr === 'string' ? JSON.parse(redeemStr) : redeemStr;
    if (redeem.status !== 'unused') {
      return res.status(400).json({ success: false, message: '兑换码已失效' });
    }

    const updatedUser = await updateUser(effectiveUserId, { level: redeem.type });

    redeem.status = 'used';
    redeem.usedBy = effectiveUserId;
    redeem.usedAt = new Date().toISOString();
    await redis.set(`redeem:${code}`, JSON.stringify(redeem));

    res.json({
      success: true,
      level: updatedUser.level,
      isUnlimited: updatedUser.isUnlimited,
      message: '兑换成功'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- Admin APIs ---

apiRouter.get('/admin/stats', checkAdmin, async (req, res) => {
  try {
    const totalCalls = await redis.get('stats:totalCalls') || 0;
    const today = new Date().toISOString().split('T')[0];
    const todayCalls = await redis.get(`stats:dailyCalls:${today}`) || 0;
    const month = today.substring(0, 7);
    const monthCalls = await redis.get(`stats:monthlyCalls:${month}`) || 0;
    
    let cursor = '0';
    let totalUsers = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: 'user:*', count: 100 });
      cursor = nextCursor;
      if (keys.length > 0) {
        const userStrs = await redis.mget(...keys);
        const users = userStrs.filter(Boolean).map(u => typeof u === 'string' ? JSON.parse(u) : u);
        totalUsers += users.filter((u: any) => u?.userId && !u.userId.startsWith('web_')).length;
      }
    } while (cursor !== '0');

    res.json({
      totalCalls: Number(totalCalls),
      todayCalls: Number(todayCalls),
      monthCalls: Number(monthCalls),
      totalUsers
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/admin/logs', checkAdmin, async (req, res) => {
  try {
    const logsStr = await redis.lrange('usage_logs', 0, 99);
    const logs = logsStr.map(l => typeof l === 'string' ? JSON.parse(l) : l);
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete('/admin/logs/:logId', checkAdmin, async (req, res) => {
  try {
    const { logId } = req.params;
    
    const logStr = await redis.get(`log_index:${logId}`);
    if (logStr) {
      await redis.lrem('usage_logs', 1, logStr);
      await redis.del(`log_index:${logId}`);
      res.json({ success: true, deleted: true });
    } else {
      res.json({ success: true, deleted: false });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/admin/users', checkAdmin, async (req, res) => {
  try {
    let cursor = '0';
    let users = [];
    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: 'user:*', count: 100 });
      cursor = nextCursor;
      if (keys.length > 0) {
        const userStrs = await redis.mget(...keys);
        const allUsers = userStrs.filter(Boolean).map(u => typeof u === 'string' ? JSON.parse(u) : u);
        users.push(...allUsers.filter((u: any) => u?.userId && !u.userId.startsWith('web_')));
      }
    } while (cursor !== '0');
    
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/admin/users/:userId', checkAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const data = req.body;
    const updated = await updateUser(userId, data);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/admin/redeem', checkAdmin, async (req, res) => {
  try {
    let cursor = '0';
    let codes = [];
    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: 'redeem:*', count: 100 });
      cursor = nextCursor;
      if (keys.length > 0) {
        const codeStrs = await redis.mget(...keys);
        codes.push(...codeStrs.filter(Boolean).map(c => typeof c === 'string' ? JSON.parse(c) : c));
      }
    } while (cursor !== '0');
    
    res.json(codes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/admin/redeem', checkAdmin, async (req, res) => {
  try {
    const { type, count = 1 } = req.body;
    const newCodes = [];
    for (let i = 0; i < count; i++) {
      const code = `${type.toUpperCase()}-${uuidv4().substring(0, 8).toUpperCase()}`;
      const redeem = {
        id: `redeem_${uuidv4()}`,
        code,
        type,
        status: 'unused',
        createdAt: new Date().toISOString(),
        expiredAt: '2026-12-31T23:59:59Z',
        usedBy: '',
        usedAt: ''
      };
      await redis.set(`redeem:${code}`, JSON.stringify(redeem));
      newCodes.push(redeem);
    }
    res.json(newCodes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete('/admin/redeem/:code', checkAdmin, async (req, res) => {
  try {
    const { code } = req.params;
    await redis.del(`redeem:${code}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/admin/level-configs', checkAdmin, async (req, res) => {
  try {
    const configs = await getLevelConfigs();
    res.json({
      configs,
      supportedModels: SUPPORTED_MODELS
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/admin/level-configs', checkAdmin, async (req, res) => {
  try {
    const { configs } = req.body;
    if (!configs) {
      return res.status(400).json({ error: 'Missing configs' });
    }
    await updateLevelConfigs(configs);
    res.json({ success: true, configs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.use((err: any, req: any, res: any, next: any) => {
  console.error('API Error:', err);
  res.status(500).json({ 
    error: 'INTERNAL_ERROR', 
    message: err.message || 'An unexpected error occurred' 
  });
});
