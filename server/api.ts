import { Router } from 'express';
import { Redis as UpstashRedis } from '@upstash/redis';
import Redis from 'ioredis';
import { GoogleGenAI } from '@google/genai';
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

type UserLevel = 'care' | 'care_plus' | 'king';

interface UserRecord {
  userId: string;
  level: UserLevel;
  ocrUsed: number;
  ocrLimit: number;
  summaryUsed: number;
  summaryLimit: number;
  extraOcrQuota: number;
  extraSummaryQuota: number;
  totalOcrUsedCount: number;
  totalSummaryUsedCount: number;
  totalUsedCount: number;
  isUnlimited: boolean;
  isPro: boolean;
  firstUsedAt: string;
  note: string;
  status: string;
  group: string;
  quotaMonthKey?: string;
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

function formatProvinceCity(province: string, city: string, fallback: string | null = null): string | null {
  const normalizedProvince = String(province || '').trim();
  const normalizedCity = String(city || '').trim();
  const location = [normalizedProvince, normalizedCity].filter(Boolean).join(' ');
  return location || fallback;
}

const IP_API_CONFIG = {
  providers: [
    {
      name: 'ip-api',
      url: (ip: string) => `http://ip-api.com/json/${ip}?lang=zh-CN&fields=status,country,regionName,city,message`,
      parse: (data: any) => {
        if (data.status === 'success') {
          const province = data.regionName || '';
          const city = data.city || '';
          return formatProvinceCity(province, city, null);
        }
        return null;
      }
    },
    {
      name: 'freeipapi',
      url: (ip: string) => `https://freeipapi.com/api/json/${ip}`,
      parse: (data: any) => {
        if (!data) {
          return null;
        }
        const province = data.regionName || '';
        const city = data.cityName || '';
        return formatProvinceCity(province, city, null);
      }
    }
  ].filter(p => {
    const enabledProviders = (process.env.IP_API_PROVIDERS || 'ip-api,freeipapi').split(',').map(s => s.trim());
    return enabledProviders.includes(p.name);
  }),
  timeoutMs: parseInt(process.env.IP_API_TIMEOUT_MS || '3000', 10),
  maxRetries: parseInt(process.env.IP_API_MAX_RETRIES || '2', 10),
  rateLimitPerMinute: parseInt(process.env.IP_API_RATE_LIMIT || '40', 10)
};

const USER_GROUPS_KEY = 'admin:user-groups';
const DEFAULT_USER_GROUP = '\u672a\u5206\u7ec4';
const ipLocationCache = new Map<string, string>();
const QUOTA_TIMEZONE = process.env.QUOTA_TIMEZONE || 'Asia/Shanghai';

function getDatePartsInTimezone(date: Date = new Date(), timeZone: string = QUOTA_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '00';
  return {
    year: Number(getPart('year')),
    month: Number(getPart('month')),
    day: Number(getPart('day')),
  };
}

function getDateKeyInTimezone(date: Date = new Date(), timeZone: string = QUOTA_TIMEZONE): string {
  const { year, month, day } = getDatePartsInTimezone(date, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getMonthKeyInTimezone(date: Date = new Date(), timeZone: string = QUOTA_TIMEZONE): string {
  const { year, month } = getDatePartsInTimezone(date, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function getMonthKeyFromIso(value: string | undefined, timeZone: string = QUOTA_TIMEZONE): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return getMonthKeyInTimezone(date, timeZone);
}

function getNextMonthlyResetAt(timeZone: string = QUOTA_TIMEZONE): string {
  const { year, month } = getDatePartsInTimezone(new Date(), timeZone);
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01 00:00:00`;
}

function toNonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function normalizeUserLevel(value: unknown): UserLevel {
  if (value === 'care_plus' || value === 'king') {
    return value;
  }
  return 'care';
}

function normalizeUserRecord(raw: any, fallbackUserId: string = ''): UserRecord {
  const level = normalizeUserLevel(raw?.level);
  const legacyExtraQuota = toNonNegativeNumber(raw?.extraQuota);
  const extraOcrQuota =
    raw?.extraOcrQuota === undefined ? legacyExtraQuota : toNonNegativeNumber(raw.extraOcrQuota);
  const extraSummaryQuota =
    raw?.extraSummaryQuota === undefined ? legacyExtraQuota : toNonNegativeNumber(raw.extraSummaryQuota);
  const normalizedUserId = String(raw?.userId || fallbackUserId || '').trim();

  return {
    userId: normalizedUserId,
    level,
    ocrUsed: toNonNegativeNumber(raw?.ocrUsed),
    ocrLimit: toNonNegativeNumber(raw?.ocrLimit),
    summaryUsed: toNonNegativeNumber(raw?.summaryUsed),
    summaryLimit: toNonNegativeNumber(raw?.summaryLimit),
    extraOcrQuota,
    extraSummaryQuota,
    totalOcrUsedCount: toNonNegativeNumber(raw?.totalOcrUsedCount),
    totalSummaryUsedCount: toNonNegativeNumber(raw?.totalSummaryUsedCount),
    totalUsedCount: toNonNegativeNumber(raw?.totalUsedCount),
    isUnlimited: typeof raw?.isUnlimited === 'boolean' ? raw.isUnlimited : level === 'king',
    isPro: typeof raw?.isPro === 'boolean' ? raw.isPro : level === 'king' || level === 'care_plus',
    firstUsedAt:
      typeof raw?.firstUsedAt === 'string' && raw.firstUsedAt.trim() ? raw.firstUsedAt : new Date().toISOString(),
    note: typeof raw?.note === 'string' ? raw.note : '',
    status: typeof raw?.status === 'string' && raw.status.trim() ? raw.status : 'active',
    group: typeof raw?.group === 'string' && raw.group.trim() ? raw.group.trim() : DEFAULT_USER_GROUP,
    quotaMonthKey: typeof raw?.quotaMonthKey === 'string' && raw.quotaMonthKey.trim() ? raw.quotaMonthKey : undefined,
  };
}

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

type SummaryPromptKey = 'slot1';

interface SummaryPromptSlot {
  name: string;
  prompt: string;
  description: string;
}

type SummaryPrompts = Record<SummaryPromptKey, SummaryPromptSlot>;

interface OcrItem {
  name: string;
  value: string;
  unit: string;
  range: string;
}

interface OcrResult {
  title: string;
  date: string;
  hospital: string;
  doctor: string;
  notes: string;
  items: OcrItem[];
}

interface ExcelHeaderItem {
  index: number;
  text: string;
}

interface ExcelHeaderMapping {
  columnIndex: number;
  id: string;
  name: string;
  category: string;
}

interface ExcelHeaderMapResult {
  dateColumnIndex: number;
  mappings: ExcelHeaderMapping[];
}

const SUMMARY_PROMPT_KEYS: SummaryPromptKey[] = ['slot1'];

const DEFAULT_SUMMARY_PROMPTS: SummaryPrompts = {
  slot1: { name: 'Slot 1', prompt: '', description: 'Not configured' },
};

const IMAGE_SYSTEM_PROMPT = `You are a medical data extraction assistant.
Extract structured data from a medical report image.

Return ONLY a valid JSON object with this exact structure:
{
  "title": "short report title",
  "date": "YYYY-MM-DD",
  "hospital": "hospital name or empty string",
  "doctor": "doctor name or empty string",
  "notes": "short note or empty string",
  "items": [
    {
      "name": "test item name",
      "value": "test value as string",
      "unit": "unit or empty string",
      "range": "reference range or empty string"
    }
  ]
}

Rules:
1. Do not output markdown, explanations, or any extra text.
2. title must be short; never put full report content into title.
3. date must be a string in YYYY-MM-DD format.
4. items must only include name/value/unit/range.
5. If no item is readable, return empty items array but keep full object shape.`;

const SUMMARY_FALLBACK_PROMPT = `You are a professional kidney-disease assistant.
Summarize exam data in clear Chinese for patients.
Highlight abnormal indicators first, then give practical advice.
Do not invent values that are not present in the data.`;

const DEFAULT_OCR_RESULT = (): OcrResult => ({
  title: '',
  date: new Date().toISOString().slice(0, 10),
  hospital: '',
  doctor: '',
  notes: '',
  items: [],
});

function isSummaryPromptKey(value: unknown): value is SummaryPromptKey {
  return typeof value === 'string' && SUMMARY_PROMPT_KEYS.includes(value as SummaryPromptKey);
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function formatDate(year: number, month: number, day: number): string {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return new Date().toISOString().slice(0, 10);
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return new Date().toISOString().slice(0, 10);
  }
  const yyyy = String(year).padStart(4, '0');
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeDateValue(value: unknown): string {
  const raw = toText(value).trim();
  if (!raw) return new Date().toISOString().slice(0, 10);

  const dateMatch = raw.match(/(\d{4})[\/.\-?](\d{1,2})[\/.\-?](\d{1,2})/);
  if (dateMatch) {
    return formatDate(Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3]));
  }

  if (/^\d{10,13}$/.test(raw)) {
    const ts = raw.length === 13 ? Number(raw) : Number(raw) * 1000;
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }

  return new Date().toISOString().slice(0, 10);
}

function normalizeItems(items: unknown): OcrItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const name = toText(row.name ?? row.itemName ?? row.item ?? row.testName).trim();
      const value = toText(row.value ?? row.result ?? row.testValue).trim();
      const unit = toText(row.unit).trim();
      const range = toText(row.range ?? row.reference ?? row.referenceRange ?? row.refRange).trim();
      if (!name && !value && !unit && !range) return null;
      return { name, value, unit, range };
    })
    .filter((item): item is OcrItem => item !== null);
}

function normalizeOcrResult(payload: unknown): OcrResult {
  const fallback = DEFAULT_OCR_RESULT();
  if (!payload || typeof payload !== 'object') return fallback;

  const root = payload as Record<string, unknown>;
  const candidate =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root;

  const title = toText(candidate.title).trim().slice(0, 120);
  const hospital = toText(candidate.hospital).trim().slice(0, 120);
  const doctor = toText(candidate.doctor).trim().slice(0, 80);
  const notes = toText(candidate.notes).trim().slice(0, 500);
  const date = normalizeDateValue(candidate.date);
  const items = normalizeItems(candidate.items);

  return {
    title,
    date,
    hospital,
    doctor,
    notes,
    items,
  };
}

function normalizeExcelHeaderMap(payload: unknown): ExcelHeaderMapResult {
  const fallback: ExcelHeaderMapResult = { dateColumnIndex: -1, mappings: [] };
  if (!payload || typeof payload !== 'object') return fallback;
  const root = payload as Record<string, unknown>;
  const dateColumnIndex = Number.isInteger(root.dateColumnIndex) ? Number(root.dateColumnIndex) : -1;
  const mappings = Array.isArray(root.mappings)
    ? root.mappings
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const row = item as Record<string, unknown>;
          const columnIndex = Number(row.columnIndex);
          if (!Number.isInteger(columnIndex) || columnIndex < 0) return null;
          return {
            columnIndex,
            id: toText(row.id).trim(),
            name: toText(row.name).trim(),
            category: toText(row.category).trim(),
          } satisfies ExcelHeaderMapping;
        })
        .filter((item): item is ExcelHeaderMapping => item !== null)
    : [];

  return { dateColumnIndex, mappings };
}

function findJsonEnd(text: string, startIndex: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function cleanJsonString(text: string): string {
  if (!text) return '{}';
  let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const firstBrace = clean.indexOf('{');
  if (firstBrace < 0) return '{}';
  const endBrace = findJsonEnd(clean, firstBrace);
  if (endBrace >= 0) {
    clean = clean.slice(firstBrace, endBrace + 1);
  } else {
    const fallbackEnd = clean.lastIndexOf('}');
    if (fallbackEnd <= firstBrace) return '{}';
    clean = clean.slice(firstBrace, fallbackEnd + 1);
  }
  clean = clean.replace(/^\uFEFF/, '');
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  clean = clean.replace(/,(\s*[}\]])/g, '$1');
  return clean;
}

function safeJsonParse(text: string): unknown {
  const cleaned = cleanJsonString(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    try {
      const aggressive = cleaned
        .replace(/\r/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\t/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return JSON.parse(aggressive);
    } catch {
      return {};
    }
  }
}

function normalizeSummaryPrompts(payload: unknown): SummaryPrompts {
  const normalized: SummaryPrompts = {
    slot1: { ...DEFAULT_SUMMARY_PROMPTS.slot1 },
  };

  if (!payload || typeof payload !== 'object') {
    return normalized;
  }

  const raw = payload as Record<string, unknown>;
  for (const key of SUMMARY_PROMPT_KEYS) {
    const slot = raw[key];
    if (!slot || typeof slot !== 'object') continue;
    const slotObj = slot as Record<string, unknown>;
    normalized[key] = {
      name: toText(slotObj.name).trim() || normalized[key].name,
      prompt: toText(slotObj.prompt),
      description: toText(slotObj.description).trim() || normalized[key].description,
    };
  }

  return normalized;
}

async function getSummaryPrompts(): Promise<SummaryPrompts> {
  try {
    const saved = await redis.get('summary:prompts');
    if (!saved) {
      const defaults = normalizeSummaryPrompts(DEFAULT_SUMMARY_PROMPTS);
      await redis.set('summary:prompts', JSON.stringify(defaults));
      return defaults;
    }
    const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
    return normalizeSummaryPrompts(parsed);
  } catch (error) {
    console.error('Failed to load summary prompts:', error);
    return normalizeSummaryPrompts(DEFAULT_SUMMARY_PROMPTS);
  }
}

async function saveSummaryPrompts(prompts: SummaryPrompts): Promise<void> {
  const normalized = normalizeSummaryPrompts(prompts);
  await redis.set('summary:prompts', JSON.stringify(normalized));
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
    const parsed = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
    const usageFeatureTotals =
      parsed?.totalOcrUsedCount === undefined || parsed?.totalSummaryUsedCount === undefined
        ? await getUsageFeatureTotals()
        : undefined;
    const normalized = fillMissingFeatureTotals(
      parsed,
      normalizeUserRecord(parsed, userId),
      usageFeatureTotals,
    );
    if (
      parsed?.extraOcrQuota === undefined ||
      parsed?.extraSummaryQuota === undefined ||
      parsed?.group !== normalized.group ||
      parsed?.totalOcrUsedCount === undefined ||
      parsed?.totalSummaryUsedCount === undefined
    ) {
      await redis.set(`user:${userId}`, JSON.stringify(normalized));
    }
    return normalized;
  }
  
  const configs = await getLevelConfigs();
  const defaultConfig = configs.care;
  
  const newUser: UserRecord = {
    userId,
    level: 'care',
    ocrUsed: 0,
    ocrLimit: defaultConfig.ocrLimit,
    summaryUsed: 0,
    summaryLimit: defaultConfig.summaryLimit,
    extraOcrQuota: 0,
    extraSummaryQuota: 0,
    totalOcrUsedCount: 0,
    totalSummaryUsedCount: 0,
    totalUsedCount: 0,
    isUnlimited: false,
    isPro: false,
    firstUsedAt: new Date().toISOString(),
    note: '',
    status: 'active',
    group: DEFAULT_USER_GROUP,
    quotaMonthKey: getMonthKeyInTimezone(),
  };
  await redis.set(`user:${userId}`, JSON.stringify(newUser));
  return newUser;
}

async function ensureMonthlyQuotaReset(user: UserRecord): Promise<UserRecord> {
  const currentMonthKey = getMonthKeyInTimezone();
  const savedMonthKey = typeof user.quotaMonthKey === 'string' ? user.quotaMonthKey : '';
  const fallbackMonthKey = getMonthKeyFromIso(user.firstUsedAt) || currentMonthKey;
  const lastMonthKey = savedMonthKey || fallbackMonthKey;

  if (lastMonthKey === currentMonthKey) {
    if (savedMonthKey === currentMonthKey) {
      return user;
    }
    const patchedUser: UserRecord = { ...user, quotaMonthKey: currentMonthKey };
    await redis.set(`user:${user.userId}`, JSON.stringify(patchedUser));
    return patchedUser;
  }

  const resetUser: UserRecord = {
    ...user,
    ocrUsed: 0,
    summaryUsed: 0,
    quotaMonthKey: currentMonthKey,
  };
  await redis.set(`user:${user.userId}`, JSON.stringify(resetUser));
  return resetUser;
}

async function updateUser(userId: string, data: any) {
  const user = await getUser(userId);
  const hasLegacyExtraQuota = data?.extraQuota !== undefined;
  const normalizedLegacyExtraQuota = hasLegacyExtraQuota ? toNonNegativeNumber(data.extraQuota) : null;
  const nextExtraOcrQuota =
    data?.extraOcrQuota !== undefined
      ? toNonNegativeNumber(data.extraOcrQuota)
      : normalizedLegacyExtraQuota ?? user.extraOcrQuota;
  const nextExtraSummaryQuota =
    data?.extraSummaryQuota !== undefined
      ? toNonNegativeNumber(data.extraSummaryQuota)
      : normalizedLegacyExtraQuota ?? user.extraSummaryQuota;
  const updated: UserRecord = normalizeUserRecord({
    ...user,
    ...data,
    extraOcrQuota: nextExtraOcrQuota,
    extraSummaryQuota: nextExtraSummaryQuota,
    group: typeof data.group === 'string' && data.group.trim() ? data.group.trim() : user.group || DEFAULT_USER_GROUP,
  }, userId);
  
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

  if (!updated.group) {
    updated.group = DEFAULT_USER_GROUP;
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

function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function extractClientIp(req: any): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const candidates = [
    ...(Array.isArray(forwardedFor) ? forwardedFor.flatMap((item) => item.split(',')) : typeof forwardedFor === 'string' ? forwardedFor.split(',') : []),
    ...(Array.isArray(realIp) ? realIp : typeof realIp === 'string' ? [realIp] : []),
    req.socket?.remoteAddress,
  ];

  for (const candidate of candidates) {
    const ip = normalizeIp(String(candidate || '').trim());
    if (!ip) continue;
    if (!isPrivateIp(ip)) {
      return ip;
    }
  }

  for (const candidate of candidates) {
    const ip = normalizeIp(String(candidate || '').trim());
    if (ip) return ip;
  }

  return 'unknown';
}

async function getIpLocation(ip: string): Promise<string> {
  if (isPrivateIp(ip)) {
    return '\u672c\u5730\u7f51\u7edc';
  }

  if (ipLocationCache.has(ip)) {
    return ipLocationCache.get(ip)!;
  }

  const fallbackLocation = ip;
  
  if (!(await checkIpApiRateLimit())) {
    console.warn('IP API rate limit exceeded, skipping location lookup');
    return fallbackLocation;
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
          if (ipLocationCache.size >= 100) {
            const firstKey = ipLocationCache.keys().next().value;
            if (firstKey) {
              ipLocationCache.delete(firstKey);
            }
          }
          ipLocationCache.set(ip, location);
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
  
  return fallbackLocation;
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
  const today = getDateKeyInTimezone();
  await redis.incr(`stats:dailyCalls:${today}`);
  const month = today.substring(0, 7);
  await redis.incr(`stats:monthlyCalls:${month}`);
}

function rebuildFeatureTotals<T extends { userId?: string; feature?: string; usedAt?: string; totalUsedCount?: number }>(logs: T[]): T[] {
  const ordered = [...logs].sort((a, b) => {
    const aTime = new Date(a.usedAt || '').getTime();
    const bTime = new Date(b.usedAt || '').getTime();
    return aTime - bTime;
  });

  const counters = new Map<string, number>();
  for (const log of ordered) {
    const userId = String(log.userId || '').trim();
    const feature = String(log.feature || '').trim();
    const counterKey = `${userId}:${feature}`;
    const nextCount = (counters.get(counterKey) || 0) + 1;
    counters.set(counterKey, nextCount);
    log.totalUsedCount = nextCount;
  }

  return logs;
}

async function getUsageFeatureTotals() {
  const totals = new Map<string, { ocr: number; summary: number }>();
  const logsStr = await redis.lrange('usage_logs', 0, 999);
  const logs = logsStr.map((item) => (typeof item === 'string' ? JSON.parse(item) : item));
  rebuildFeatureTotals(logs);

  for (const log of logs) {
    const userId = toText(log?.userId).trim();
    const feature = toText(log?.feature).trim();
    if (!userId || (feature !== 'ocr' && feature !== 'summary')) {
      continue;
    }

    const current = totals.get(userId) || { ocr: 0, summary: 0 };
    const nextCount = toNonNegativeNumber(log?.totalUsedCount);
    if (feature === 'ocr') {
      current.ocr = Math.max(current.ocr, nextCount);
    } else {
      current.summary = Math.max(current.summary, nextCount);
    }
    totals.set(userId, current);
  }

  return totals;
}

function fillMissingFeatureTotals(
  raw: any,
  normalized: UserRecord,
  usageFeatureTotals?: Map<string, { ocr: number; summary: number }>,
): UserRecord {
  const hasStoredOcrTotal = raw?.totalOcrUsedCount !== undefined && raw?.totalOcrUsedCount !== null;
  const hasStoredSummaryTotal = raw?.totalSummaryUsedCount !== undefined && raw?.totalSummaryUsedCount !== null;

  if (hasStoredOcrTotal && hasStoredSummaryTotal) {
    return normalized;
  }

  const logTotals = usageFeatureTotals?.get(normalized.userId);
  if (!logTotals) {
    return normalized;
  }

  return {
    ...normalized,
    totalOcrUsedCount: hasStoredOcrTotal ? normalized.totalOcrUsedCount : logTotals.ocr,
    totalSummaryUsedCount: hasStoredSummaryTotal ? normalized.totalSummaryUsedCount : logTotals.summary,
    totalUsedCount:
      hasStoredOcrTotal && hasStoredSummaryTotal
        ? normalized.totalUsedCount
        : (hasStoredOcrTotal ? normalized.totalOcrUsedCount : logTotals.ocr) +
          (hasStoredSummaryTotal ? normalized.totalSummaryUsedCount : logTotals.summary),
  };
}

function normalizeGroupName(value: unknown): string {
  const group = toText(value).trim().slice(0, 30);
  return group || DEFAULT_USER_GROUP;
}

async function getUserGroups(): Promise<string[]> {
  try {
    const saved = await redis.get(USER_GROUPS_KEY);
    if (!saved) {
      const defaults = [DEFAULT_USER_GROUP];
      await redis.set(USER_GROUPS_KEY, JSON.stringify(defaults));
      return defaults;
    }
    const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
    const groups = Array.isArray(parsed)
      ? parsed.map((item) => normalizeGroupName(item))
      : [DEFAULT_USER_GROUP];
    return Array.from(new Set([DEFAULT_USER_GROUP, ...groups]));
  } catch (error) {
    console.error('Failed to load user groups:', error);
    return [DEFAULT_USER_GROUP];
  }
}

async function saveUserGroups(groups: string[]): Promise<string[]> {
  const normalized = Array.from(new Set(groups.map((item) => normalizeGroupName(item))));
  if (!normalized.includes(DEFAULT_USER_GROUP)) {
    normalized.unshift(DEFAULT_USER_GROUP);
  }
  await redis.set(USER_GROUPS_KEY, JSON.stringify(normalized));
  return normalized;
}

async function ensureUserGroupExists(groupName: string): Promise<string[]> {
  const normalized = normalizeGroupName(groupName);
  const groups = await getUserGroups();
  if (groups.includes(normalized)) {
    return groups;
  }
  return saveUserGroups([...groups, normalized]);
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

/**
 * Validate user identity and get user data
 * @param openid - WeChat mini-program user identifier (higher priority)
 * @param userId - Web platform user identifier (fallback)
 * @returns User validation result with user data
 */
async function validateAndGetUser(openid: string | undefined, userId: string | undefined) {
  const effectiveUserId = openid || userId;
  
  if (!effectiveUserId) {
    return { valid: false, error: { status: 401, response: { error: 'AUTH_REQUIRED', message: '缺少用户身份，请先登录' } } };
  }
  
  const user = await getUser(effectiveUserId);
  const normalizedUser = await ensureMonthlyQuotaReset(user);
  
  return { valid: true, user: normalizedUser, effectiveUserId };
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
    const totalOcrLimit = user.ocrLimit + user.extraOcrQuota;
    if (!user.isUnlimited && user.ocrUsed >= totalOcrLimit) {
      return res.status(403).json({ error: 'QUOTA_EXCEEDED', message: 'Monthly OCR quota exceeded' });
    }

    const configs = await getLevelConfigs();
    const levelConfig = configs[user.level] || configs.care;
    const modelToUse = levelConfig.ocrModel;

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
              text: 'Extract structured medical report data from this image.',
            },
          ],
        },
      ],
      config: {
        systemInstruction: IMAGE_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
      },
    });

    const resultText = response.text || '{}';
    const parsed = safeJsonParse(resultText);
    const resultJson = normalizeOcrResult(parsed);

    user.ocrUsed += 1;
    user.totalOcrUsedCount += 1;
    user.totalUsedCount += 1;
    await redis.set(`user:${effectiveUserId}`, JSON.stringify(user));

    const ip = extractClientIp(req);
    await logUsage(effectiveUserId, ip, 'ocr', user.ocrUsed, user.totalOcrUsedCount);

    res.json(resultJson);
  } catch (error: any) {
    console.error('OCR Error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

apiRouter.post('/analyze/excel-header', async (req, res) => {
  try {
    const { headers } = req.body || {};
    if (!Array.isArray(headers) || headers.length === 0) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Missing headers array' });
    }

    const safeHeaders: ExcelHeaderItem[] = headers
      .map((item: unknown, idx: number) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const index = Number.isInteger(row.index) ? Number(row.index) : idx;
        const text = toText(row.text).trim();
        if (!text) return null;
        return { index, text };
      })
      .filter((item): item is ExcelHeaderItem => item !== null);

    if (!safeHeaders.length) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'No valid header items' });
    }

    const prompt = `
You are given one Excel header row for a medical report table.
Header list:
${JSON.stringify(safeHeaders)}

Return ONLY JSON in this format:
{
  "dateColumnIndex": number,
  "mappings": [
    { "columnIndex": number, "id": "string", "name": "string", "category": "string" }
  ]
}

Rules:
1. dateColumnIndex is the best date/time column index. If not found, return -1.
2. mappings should include medical indicator columns only, excluding date/time columns.
3. Keep name as close as possible to original header text.
4. id should be lowercase letters/numbers/underscore (e.g. creatinine, egfr, protein_24h).
5. Output JSON only, no markdown.
`.trim();

    const configs = await getLevelConfigs();
    const modelToUse = configs.care?.ocrModel || SUPPORTED_MODELS[0];

    const response = await ai.models.generateContent({
      model: modelToUse,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = safeJsonParse(response.text || '{}');
    const normalized = normalizeExcelHeaderMap(parsed);
    res.json(normalized);
  } catch (error: any) {
    console.error('Excel Header Analyze Error:', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// 2. Summary API
apiRouter.post('/summary/text', async (req, res) => {
  try {
    const { userId, examData, promptSlot, nickname, userLevel, model, openid } = req.body;
    if (!examData || !Array.isArray(examData.items) || examData.items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST',
        message: 'Missing examData items',
      });
    }

    const validation = await validateAndGetUser(openid, userId);
    if (!validation.valid) {
      return res.status(validation.error!.status).json(validation.error!.response);
    }

    const user = validation.user!;
    const effectiveUserId = validation.effectiveUserId!;
    const totalSummaryLimit = user.summaryLimit + user.extraSummaryQuota;
    if (!user.isUnlimited && user.summaryUsed >= totalSummaryLimit) {
      return res.status(403).json({ success: false, error: 'QUOTA_EXCEEDED', message: 'Monthly summary quota exceeded' });
    }

    const configs = await getLevelConfigs();
    const levelConfig = configs[user.level] || configs.care;
    const modelToUse = levelConfig.summaryModel;

    const prompts = await getSummaryPrompts();
    const requestedSlot = isSummaryPromptKey(promptSlot) ? promptSlot : 'slot1';
    const finalPrompt = prompts[requestedSlot].prompt.trim() || SUMMARY_FALLBACK_PROMPT;

    const prompt = `Exam data JSON:\n${JSON.stringify(examData, null, 2)}\n\nPlease generate the final summary in Chinese.`;
    const response = await ai.models.generateContent({
      model: modelToUse,
      contents: prompt,
      config: {
        systemInstruction: finalPrompt,
      },
    });

    const summary = response.text || 'No summary generated.';
    const nextResetAt = getNextMonthlyResetAt();

    user.summaryUsed += 1;
    user.totalSummaryUsedCount += 1;
    user.totalUsedCount += 1;
    await redis.set(`user:${effectiveUserId}`, JSON.stringify(user));

    const ip = extractClientIp(req);
    await logUsage(effectiveUserId, ip, 'summary', user.summaryUsed, user.totalSummaryUsedCount);

    res.json({
      success: true,
      summary,
      quota: {
        remaining: user.isUnlimited ? 9999 : totalSummaryLimit - user.summaryUsed,
        used: user.summaryUsed,
        limit: totalSummaryLimit,
        resetAt: nextResetAt,
      },
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
    const normalizedUser = await ensureMonthlyQuotaReset(user);
    const nextResetAt = getNextMonthlyResetAt();
    
    res.json({
      success: true,
      data: {
        userId: normalizedUser.userId,
        isPro: normalizedUser.isPro,
        isUnlimited: normalizedUser.isUnlimited,
        extraOcrQuota: normalizedUser.extraOcrQuota,
        extraSummaryQuota: normalizedUser.extraSummaryQuota,
        ocrUsed: normalizedUser.ocrUsed,
        ocrLimit: normalizedUser.ocrLimit,
        summaryUsed: normalizedUser.summaryUsed,
        summaryLimit: normalizedUser.summaryLimit,
        resetAt: nextResetAt
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
    const today = getDateKeyInTimezone();
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
    const logsStr = await redis.lrange('usage_logs', 0, 499);
    const logs = logsStr.map(l => typeof l === 'string' ? JSON.parse(l) : l);
    rebuildFeatureTotals(logs);
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
    const usageFeatureTotals = await getUsageFeatureTotals();
    let cursor = '0';
    let users: UserRecord[] = [];
    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: 'user:*', count: 100 });
      cursor = nextCursor;
      if (keys.length > 0) {
        const userStrs = await redis.mget(...keys);
        const allUsers = userStrs
          .filter(Boolean)
          .map(u => typeof u === 'string' ? JSON.parse(u) : u)
          .filter((u: any) => u?.userId && !u.userId.startsWith('web_'))
          .map((u: any) =>
            fillMissingFeatureTotals(
              u,
              normalizeUserRecord(u, String(u?.userId || '')),
              usageFeatureTotals,
            ),
          );
        users.push(...allUsers);
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
    const data = req.body || {};
    if (typeof data.group === 'string' && data.group.trim()) {
      await ensureUserGroupExists(data.group);
    }
    const updated = await updateUser(userId, data);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/admin/user-groups', checkAdmin, async (req, res) => {
  try {
    const groups = await getUserGroups();
    res.json({ groups });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/admin/user-groups', checkAdmin, async (req, res) => {
  try {
    const group = normalizeGroupName(req.body?.group);
    const groups = await ensureUserGroupExists(group);
    res.json({ success: true, groups, group });
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

apiRouter.get('/admin/summary/prompts', checkAdmin, async (req, res) => {
  try {
    const prompts = await getSummaryPrompts();
    res.json({ success: true, prompts });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});
apiRouter.put('/admin/summary/prompts', checkAdmin, async (req, res) => {
  try {
    const { slot, name, prompt, description } = req.body || {};
    const targetSlot: SummaryPromptKey = isSummaryPromptKey(slot) ? slot : 'slot1';
    const prompts = await getSummaryPrompts();
    const current = prompts[targetSlot];
    prompts[targetSlot] = {
      name: typeof name === 'string' && name.trim() ? name.trim() : current.name,
      prompt: typeof prompt === 'string' ? prompt : current.prompt,
      description:
        typeof description === 'string' && description.trim()
          ? description.trim()
          : current.description,
    };
    await saveSummaryPrompts(prompts);
    res.json({
      success: true,
      message: `${targetSlot} prompt updated`,
      prompts,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});
apiRouter.use((err: any, req: any, res: any, next: any) => {
  console.error('API Error:', err);
  res.status(500).json({ 
    error: 'INTERNAL_ERROR', 
    message: err.message || 'An unexpected error occurred' 
  });
});

