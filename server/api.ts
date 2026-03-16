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
  mget(...keys: string[]): Promise<(string | null)[]>;
  scan(cursor: string, options?: { match?: string; count?: number }): Promise<[string, string[]]>;
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

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return this.client.mget(...keys);
  }

  async scan(cursor: string, options?: { match?: string; count?: number }): Promise<[string, string[]]> {
    const result = await this.client.scan(parseInt(cursor), 'MATCH', options?.match || '*', 'COUNT', options?.count || 100);
    return result;
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
}

function createRedisClient(): RedisClient {
  const redisUrl = process.env.REDIS_URL;
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl) {
    console.log('Using Redis TCP connection (REDIS_URL)');
    return new IORedisAdapter(redisUrl);
  }

  if (upstashUrl && upstashToken) {
    console.log('Using Upstash Redis REST API (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)');
    return new UpstashRedisAdapter(upstashUrl, upstashToken);
  }

  throw new Error('Redis configuration missing. Please set either REDIS_URL or (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)');
}

const redis = createRedisClient();

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// Constants
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

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
  
  // Create new user if not exists
  const newUser = {
    userId,
    level: 'care',
    ocrUsed: 0,
    ocrLimit: 25,
    summaryUsed: 0,
    summaryLimit: 25,
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
  
  // Update limits based on level
  if (data.level) {
    if (data.level === 'king') {
      updated.isUnlimited = true;
      updated.isPro = true;
      updated.ocrLimit = 9999;
      updated.summaryLimit = 9999;
    } else if (data.level === 'care_plus') {
      updated.isUnlimited = false;
      updated.isPro = true;
      updated.ocrLimit = 50;
      updated.summaryLimit = 50;
    } else {
      updated.isUnlimited = false;
      updated.isPro = false;
      updated.ocrLimit = 25;
      updated.summaryLimit = 25;
    }
  }
  
  await redis.set(`user:${userId}`, JSON.stringify(updated));
  return updated;
}

async function logUsage(userId: string, ip: string, feature: string, monthlyUsedCount: number, totalUsedCount: number) {
  const log = {
    id: `log_${uuidv4()}`,
    userId,
    ip,
    ipLocation: 'Unknown', // In a real app, use an IP geolocation service
    feature,
    monthlyUsedCount,
    totalUsedCount,
    usedAt: new Date().toISOString(),
    status: 'success',
  };
  await redis.lpush('usage_logs', JSON.stringify(log));
  // Keep only last 1000 logs for simplicity
  await redis.ltrim('usage_logs', 0, 999);
  
  // Update global stats
  await redis.incr('stats:totalCalls');
  const today = new Date().toISOString().split('T')[0];
  await redis.incr(`stats:dailyCalls:${today}`);
  const month = today.substring(0, 7);
  await redis.incr(`stats:monthlyCalls:${month}`);
}

// --- API Routes ---

// 1. OCR API
apiRouter.post('/analyze/image-base64', async (req, res) => {
  try {
    const { base64, mimeType, userId, nickname } = req.body;
    
    if (!base64 || !userId) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Missing base64 or userId' });
    }

    const user = await getUser(userId);
    const totalOcrLimit = user.ocrLimit + user.extraQuota;
    
    if (!user.isUnlimited && user.ocrUsed >= totalOcrLimit) {
      return res.status(403).json({ error: 'QUOTA_EXCEEDED', message: '本月免费额度已用完' });
    }

    // Call Gemini
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64.replace(/^data:image\/\w+;base64,/, ''),
              mimeType: mimeType || 'image/jpeg',
            },
          },
          {
            text: `Extract the medical report data into a structured JSON format.
            Required fields: title (string), date (YYYY-MM-DD), hospital (string), doctor (string), notes (string), items (array of objects).
            Each item object must have: name (string), value (string), unit (string), range (string).
            Do not include markdown formatting, just pure JSON.`,
          },
        ],
      },
      config: {
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

    // Update user quota
    user.ocrUsed += 1;
    user.totalUsedCount += 1;
    await redis.set(`user:${userId}`, JSON.stringify(user));
    
    // Log usage
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await logUsage(userId, ip as string, 'ocr', user.ocrUsed, user.totalUsedCount);

    res.json(resultJson);
  } catch (error: any) {
    console.error('OCR Error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// 2. Summary API
apiRouter.post('/summary/text', async (req, res) => {
  try {
    const { userId, examData, promptSlot, nickname, userLevel, model } = req.body;
    
    if (!userId || !examData) {
      return res.status(400).json({ success: false, error: 'INVALID_REQUEST', message: 'Missing userId or examData' });
    }

    const user = await getUser(userId);
    const totalSummaryLimit = user.summaryLimit + user.extraQuota;
    
    if (!user.isUnlimited && user.summaryUsed >= totalSummaryLimit) {
      return res.status(403).json({ success: false, error: 'QUOTA_EXCEEDED', message: '本月次数已用完' });
    }

    // Call Gemini
    const prompt = `Please provide a smart summary for the following medical exam data.
    Data: ${JSON.stringify(examData)}
    Provide a concise, professional, and easy-to-understand summary of the indicators. Highlight any abnormalities.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const summary = response.text || 'No summary generated.';

    // Update user quota
    user.summaryUsed += 1;
    user.totalUsedCount += 1;
    await redis.set(`user:${userId}`, JSON.stringify(user));
    
    // Log usage
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await logUsage(userId, ip as string, 'summary', user.summaryUsed, user.totalUsedCount);

    res.json({
      success: true,
      summary,
      quota: {
        remaining: user.isUnlimited ? 9999 : (totalSummaryLimit - user.summaryUsed),
        used: user.summaryUsed,
        limit: totalSummaryLimit,
        resetAt: '2026-04-01 00:00:00' // Simplified
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
    if (!userId) {
      return res.status(400).json({ success: false, error: 'INVALID_REQUEST', message: 'Missing userId' });
    }

    const user = await getUser(userId);
    
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
    const { code, userId } = req.body;
    if (!code || !userId) {
      return res.status(400).json({ success: false, message: 'Missing code or userId' });
    }

    const redeemStr = await redis.get(`redeem:${code}`);
    if (!redeemStr) {
      return res.status(404).json({ success: false, message: '兑换码无效或已被使用' });
    }

    const redeem = typeof redeemStr === 'string' ? JSON.parse(redeemStr) : redeemStr;
    if (redeem.status !== 'unused') {
      return res.status(400).json({ success: false, message: '兑换码已失效' });
    }

    // Update user
    const updatedUser = await updateUser(userId, { level: redeem.type });

    // Mark code as used
    redeem.status = 'used';
    redeem.usedBy = userId;
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
    
    // Count users (scan keys starting with user:)
    let cursor = '0';
    let totalUsers = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: 'user:*', count: 100 });
      cursor = nextCursor;
      totalUsers += keys.length;
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

apiRouter.get('/admin/users', checkAdmin, async (req, res) => {
  try {
    let cursor = '0';
    let users = [];
    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: 'user:*', count: 100 });
      cursor = nextCursor;
      if (keys.length > 0) {
        const userStrs = await redis.mget(...keys);
        users.push(...userStrs.filter(Boolean).map(u => typeof u === 'string' ? JSON.parse(u) : u));
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
