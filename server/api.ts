import { Router } from 'express';
import { isIP } from 'node:net';
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
  evalRaw(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
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
}

interface StoredUserRecord {
  userId: string;
  level: UserLevel;
  extraOcrQuota: number;
  extraSummaryQuota: number;
  firstUsedAt: string;
  note: string;
  status: string;
  group: string;
}

interface UserUpdateInput {
  level?: UserLevel;
  group?: string;
  note?: string;
  status?: string;
  extraQuota?: number;
  extraOcrQuota?: number;
  extraSummaryQuota?: number;
  extraOcrQuotaDelta?: number;
  extraSummaryQuotaDelta?: number;
}

type FeatureType = 'ocr' | 'summary';

interface FeatureUsageStats {
  monthlyUsedCount: number;
  totalUsedCount: number;
  baseLimit: number;
  baseUsedCount: number;
  baseRemainingCount: number;
  extraLimit: number;
  extraUsedCount: number;
  extraRemainingCount: number;
}

interface AdminUserView extends UserRecord {
  usageStats: Record<FeatureType, FeatureUsageStats>;
}

interface FeatureUsageReservation {
  reservationId: string;
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

  async evalRaw(script: string, keys: string[], args: (string | number)[]): Promise<unknown> {
    return this.client.eval(script, keys.length, ...keys, ...args);
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

  async evalRaw(script: string, keys: string[], args: (string | number)[]): Promise<unknown> {
    return this.client.eval(script, keys, args.map(String));
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
  evalRaw: (script: string, keys: string[], args: (string | number)[]) => getRedisClient().evalRaw(script, keys, args),
};

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// Constants
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function containsChineseText(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function normalizeChinaProvince(value: string): string {
  let normalized = String(value || '').trim();
  normalized = normalized.replace(/^中华人民共和国/, '').replace(/^中国/, '').trim();

  const provinceAliases: Record<string, string> = {
    '广西壮族自治区': '广西',
    '内蒙古自治区': '内蒙古',
    '宁夏回族自治区': '宁夏',
    '新疆维吾尔自治区': '新疆',
    '西藏自治区': '西藏',
    '香港特别行政区': '香港',
    '澳门特别行政区': '澳门',
  };

  if (provinceAliases[normalized]) {
    return provinceAliases[normalized];
  }

  return normalized.replace(/省$/, '').replace(/市$/, '').trim();
}

function normalizeChinaCity(value: string): string {
  let normalized = String(value || '').trim();
  normalized = normalized.replace(/^中国/, '').trim();

  return normalized
    .replace(/市$/, '')
    .trim();
}

function formatProvinceCity(province: string, city: string, fallback: string | null = null): string | null {
  const rawProvince = String(province || '').trim();
  const rawCity = String(city || '').trim();
  const useChineseNormalization = containsChineseText(rawProvince) || containsChineseText(rawCity);
  const normalizedProvince = useChineseNormalization ? normalizeChinaProvince(rawProvince) : rawProvince;
  const normalizedCity = useChineseNormalization ? normalizeChinaCity(rawCity) : rawCity;
  const location = [normalizedProvince, normalizedCity].filter(Boolean).join(' ');
  return location || fallback;
}

type IpLookupConfig = {
  url: (ip: string) => string;
  timeoutMs: number;
  maxRetries: number;
};

type IpApiResponse = {
  status?: 'success' | 'fail';
  country?: string;
  regionName?: string;
  city?: string;
  message?: string;
};

type JsonResponse<T> = {
  rawText: string;
  data: T | null;
};

const IP_LOOKUP_CONFIG: IpLookupConfig = {
  url: (ip: string) => `http://ip-api.com/json/${ip}?lang=zh-CN`,
  timeoutMs: parseInt(process.env.IP_API_TIMEOUT_MS || '3000', 10),
  maxRetries: parseInt(process.env.IP_API_MAX_RETRIES || '2', 10),
};

const USER_GROUPS_KEY = 'admin:user-groups';
const DEFAULT_USER_GROUP = '\u672a\u5206\u7ec4';
const UNKNOWN_IP_LOCATION = '\u672a\u77e5';
const LOCAL_IP_LOCATION = '\u672c\u5730\u7f51\u7edc';
const ipLocationCache = new Map<string, string>();
let ipApiBlockedUntil = 0;
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
  return value === 'care_plus' || value === 'king' ? value : 'care';
}

function isUserLevel(value: unknown): value is UserLevel {
  return value === 'care' || value === 'care_plus' || value === 'king';
}

// `user:*` persists only stable user profile fields.
// Limits come from the current level config, and counters come from `user_stats:*`.
function normalizeStoredUserRecord(raw: any, fallbackUserId: string = ''): StoredUserRecord {
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
    extraOcrQuota,
    extraSummaryQuota,
    firstUsedAt:
      typeof raw?.firstUsedAt === 'string' && raw.firstUsedAt.trim() ? raw.firstUsedAt : new Date().toISOString(),
    note: typeof raw?.note === 'string' ? raw.note : '',
    status: typeof raw?.status === 'string' && raw.status.trim() ? raw.status : 'active',
    group: normalizeGroupName(raw?.group),
  };
}

function needsStoredUserMigration(raw: any, normalized: StoredUserRecord): boolean {
  const legacyFields = [
    'ocrUsed',
    'ocrLimit',
    'summaryUsed',
    'summaryLimit',
    'totalOcrUsedCount',
    'totalSummaryUsedCount',
    'totalUsedCount',
    'isUnlimited',
    'isPro',
    'extraQuota',
    'quotaMonthKey',
  ];

  if (legacyFields.some((field) => raw?.[field] !== undefined)) {
    return true;
  }

  return (
    raw?.userId !== normalized.userId ||
    normalizeUserLevel(raw?.level) !== normalized.level ||
    toNonNegativeNumber(raw?.extraOcrQuota) !== normalized.extraOcrQuota ||
    toNonNegativeNumber(raw?.extraSummaryQuota) !== normalized.extraSummaryQuota ||
    (typeof raw?.firstUsedAt === 'string' && raw.firstUsedAt.trim() ? raw.firstUsedAt : '') !== normalized.firstUsedAt ||
    (typeof raw?.note === 'string' ? raw.note : '') !== normalized.note ||
    (typeof raw?.status === 'string' && raw.status.trim() ? raw.status : 'active') !== normalized.status ||
    normalizeGroupName(raw?.group) !== normalized.group
  );
}

function serializeStoredUserRecord(user: StoredUserRecord): string {
  return JSON.stringify(user);
}

function buildRuntimeUserRecord(user: StoredUserRecord, levelConfig: LevelConfig): UserRecord {
  return {
    userId: user.userId,
    level: user.level,
    ocrUsed: 0,
    ocrLimit: toNonNegativeNumber(levelConfig.ocrLimit),
    summaryUsed: 0,
    summaryLimit: toNonNegativeNumber(levelConfig.summaryLimit),
    extraOcrQuota: user.extraOcrQuota,
    extraSummaryQuota: user.extraSummaryQuota,
    totalOcrUsedCount: 0,
    totalSummaryUsedCount: 0,
    totalUsedCount: 0,
    isUnlimited: user.level === 'king',
    isPro: user.level === 'king' || user.level === 'care_plus',
    firstUsedAt: user.firstUsedAt,
    note: user.note,
    status: user.status,
    group: user.group,
  };
}

// Usage statistics source of truth:
// 1. `user:*` stores profile/config only.
// 2. `user_stats:*` stores monthly and lifetime counters.
// 3. `usage_logs` only stores snapshots for display and never drives counters.
function getUserFeatureTotalKey(userId: string, feature: FeatureType): string {
  return `user_stats:${userId}:total:${feature}`;
}

function getUserFeatureMonthlyKey(userId: string, feature: FeatureType, monthKey: string = getMonthKeyInTimezone()): string {
  return `user_stats:${userId}:monthly:${monthKey}:${feature}`;
}

function getUserFeaturePendingReservationsKey(userId: string, feature: FeatureType): string {
  return `user_stats:${userId}:pending:${feature}`;
}

async function hydrateUsersUsage(users: StoredUserRecord[]): Promise<UserRecord[]> {
  if (!users.length) {
    return [];
  }

  const configs = await getLevelConfigs();
  const normalizedUsers = users.map((user) =>
    buildRuntimeUserRecord(user, configs[user.level] || configs.care || DEFAULT_LEVEL_CONFIGS.care),
  );
  const monthKey = getMonthKeyInTimezone();
  const keys = normalizedUsers.flatMap((user) => [
    getUserFeatureMonthlyKey(user.userId, 'ocr', monthKey),
    getUserFeatureMonthlyKey(user.userId, 'summary', monthKey),
    getUserFeatureTotalKey(user.userId, 'ocr'),
    getUserFeatureTotalKey(user.userId, 'summary'),
  ]);
  const values = await redis.mget(...keys);

  return normalizedUsers.map((user, index) => {
    const offset = index * 4;
    const totalOcrUsedCount = toNonNegativeNumber(values[offset + 2]);
    const totalSummaryUsedCount = toNonNegativeNumber(values[offset + 3]);

    return {
      ...user,
      ocrUsed: toNonNegativeNumber(values[offset]),
      summaryUsed: toNonNegativeNumber(values[offset + 1]),
      totalOcrUsedCount,
      totalSummaryUsedCount,
      totalUsedCount: totalOcrUsedCount + totalSummaryUsedCount,
    };
  });
}

async function hydrateUserUsage(user: StoredUserRecord): Promise<UserRecord> {
  const [hydratedUser] = await hydrateUsersUsage([user]);
  return hydratedUser;
}

function getFeatureMonthlyUsedCount(user: UserRecord, feature: FeatureType): number {
  return feature === 'ocr' ? user.ocrUsed : user.summaryUsed;
}

function getFeatureTotalUsedCount(user: UserRecord, feature: FeatureType): number {
  return feature === 'ocr' ? user.totalOcrUsedCount : user.totalSummaryUsedCount;
}

function getFeatureBaseLimit(user: UserRecord, feature: FeatureType): number {
  return feature === 'ocr' ? user.ocrLimit : user.summaryLimit;
}

function getFeatureExtraLimit(user: UserRecord, feature: FeatureType): number {
  return feature === 'ocr' ? user.extraOcrQuota : user.extraSummaryQuota;
}

function getFeatureTotalLimit(user: UserRecord, feature: FeatureType): number {
  if (user.isUnlimited) {
    return Number.MAX_SAFE_INTEGER;
  }
  return getFeatureBaseLimit(user, feature) + getFeatureExtraLimit(user, feature);
}

function buildFeatureUsageStats(user: UserRecord, feature: FeatureType): FeatureUsageStats {
  const monthlyUsedCount = getFeatureMonthlyUsedCount(user, feature);
  const totalUsedCount = getFeatureTotalUsedCount(user, feature);
  const baseLimit = getFeatureBaseLimit(user, feature);
  const extraLimit = getFeatureExtraLimit(user, feature);
  const baseUsedCount = user.isUnlimited ? monthlyUsedCount : Math.min(monthlyUsedCount, baseLimit);
  const baseRemainingCount = user.isUnlimited ? 0 : Math.max(0, baseLimit - baseUsedCount);
  const extraUsedCount = user.isUnlimited ? 0 : Math.max(0, monthlyUsedCount - baseLimit);
  const extraRemainingCount = user.isUnlimited ? extraLimit : Math.max(0, extraLimit - extraUsedCount);

  return {
    monthlyUsedCount,
    totalUsedCount,
    baseLimit,
    baseUsedCount,
    baseRemainingCount,
    extraLimit,
    extraUsedCount,
    extraRemainingCount,
  };
}

function buildAdminUserView(user: UserRecord): AdminUserView {
  return {
    ...user,
    usageStats: {
      ocr: buildFeatureUsageStats(user, 'ocr'),
      summary: buildFeatureUsageStats(user, 'summary'),
    },
  };
}

function parseLuaReservationResult(result: unknown): { granted: boolean; monthlyUsedCount: number } {
  if (!Array.isArray(result) || result.length < 3) {
    throw new Error('Invalid Redis reservation result');
  }

  return {
    granted: Number(result[0]) === 1,
    monthlyUsedCount: toNonNegativeNumber(result[1]),
  };
}

function parseLuaCountResult(result: unknown): { committed: boolean; monthlyUsedCount: number; totalUsedCount: number } {
  if (!Array.isArray(result) || result.length < 3) {
    throw new Error('Invalid Redis counter result');
  }

  return {
    committed: Number(result[0]) === 1,
    monthlyUsedCount: toNonNegativeNumber(result[1]),
    totalUsedCount: toNonNegativeNumber(result[2]),
  };
}

const USAGE_RESERVATION_TTL_SECONDS = 60 * 30;

// Reserve quota before the AI call, then commit counters and logs only after success.
async function reserveFeatureUsage(user: UserRecord, feature: FeatureType): Promise<FeatureUsageReservation | null> {
  if (user.isUnlimited) {
    return null;
  }

  const totalLimit = getFeatureTotalLimit(user, feature);
  const reservationId = `usage_reservation_${uuidv4()}`;
  const now = Date.now();
  const expiresAt = now + USAGE_RESERVATION_TTL_SECONDS * 1000;
  const luaScript = `
    redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', tonumber(ARGV[3]))

    local monthly = tonumber(redis.call('GET', KEYS[1]) or '0')
    local pending = redis.call('ZCARD', KEYS[2])
    if monthly + pending >= tonumber(ARGV[1]) then
      return { 0, monthly, pending }
    end

    redis.call('ZADD', KEYS[2], tonumber(ARGV[4]), ARGV[2])
    redis.call('EXPIRE', KEYS[2], tonumber(ARGV[5]))

    return { 1, monthly, pending + 1 }
  `;
  const result = await redis.evalRaw(
    luaScript,
    [getUserFeatureMonthlyKey(user.userId, feature), getUserFeaturePendingReservationsKey(user.userId, feature)],
    [totalLimit, reservationId, now, expiresAt, USAGE_RESERVATION_TTL_SECONDS],
  );
  const parsed = parseLuaReservationResult(result);

  if (!parsed.granted) {
    return null;
  }

  return { reservationId };
}

async function releaseFeatureUsageReservation(userId: string, feature: FeatureType, reservationId: string): Promise<void> {
  const now = Date.now();
  const luaScript = `
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[2]))
    redis.call('ZREM', KEYS[1], ARGV[1])

    local remaining = redis.call('ZCARD', KEYS[1])
    if remaining == 0 then
      redis.call('DEL', KEYS[1])
    else
      redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
    end

    return remaining
  `;

  await redis.evalRaw(
    luaScript,
    [getUserFeaturePendingReservationsKey(userId, feature)],
    [reservationId, now, USAGE_RESERVATION_TTL_SECONDS],
  );
}

async function recordFeatureUsage(
  userId: string,
  ip: string,
  ipLocation: string,
  feature: FeatureType,
  reservationId?: string,
) {
  const monthKey = getMonthKeyInTimezone();
  const today = getDateKeyInTimezone();
  const usedAt = new Date().toISOString();
  const logId = `log_${uuidv4()}`;
  const monthlyExpireSeconds = 60 * 60 * 24 * 400;
  const luaScript = `
    if ARGV[1] ~= '' then
      redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', tonumber(ARGV[2]))
      local removed = redis.call('ZREM', KEYS[3], ARGV[1])
      if removed == 0 then
        return { 0, redis.call('GET', KEYS[2]) or '0', redis.call('GET', KEYS[1]) or '0' }
      end

      local remaining = redis.call('ZCARD', KEYS[3])
      if remaining == 0 then
        redis.call('DEL', KEYS[3])
      else
        redis.call('EXPIRE', KEYS[3], tonumber(ARGV[3]))
      end
    end

    local total = redis.call('INCR', KEYS[1])
    local monthly = redis.call('INCR', KEYS[2])
    redis.call('EXPIRE', KEYS[2], tonumber(ARGV[4]))
    redis.call('INCR', KEYS[6])
    redis.call('INCR', KEYS[7])
    redis.call('INCR', KEYS[8])

    local log = cjson.encode({
      id = ARGV[5],
      userId = ARGV[6],
      ip = ARGV[7],
      ipLocation = ARGV[8],
      feature = ARGV[9],
      monthlyUsedCount = monthly,
      totalUsedCount = total,
      usedAt = ARGV[10],
      status = 'success'
    })

    redis.call('LPUSH', KEYS[4], log)
    redis.call('SET', KEYS[5], log)
    redis.call('LTRIM', KEYS[4], 0, 999)

    return { 1, monthly, total }
  `;

  const result = await redis.evalRaw(
    luaScript,
    [
      getUserFeatureTotalKey(userId, feature),
      getUserFeatureMonthlyKey(userId, feature, monthKey),
      getUserFeaturePendingReservationsKey(userId, feature),
      'usage_logs',
      `log_index:${logId}`,
      'stats:totalCalls',
      `stats:dailyCalls:${today}`,
      `stats:monthlyCalls:${monthKey}`,
    ],
    [
      reservationId || '',
      Date.now(),
      USAGE_RESERVATION_TTL_SECONDS,
      monthlyExpireSeconds,
      logId,
      userId,
      ip,
      ipLocation,
      feature,
      usedAt,
    ],
  );
  const parsed = parseLuaCountResult(result);

  if (!parsed.committed) {
    throw new Error(`Usage reservation missing for ${feature}:${userId}`);
  }

  return {
    logId,
    usedAt,
    monthlyUsedCount: parsed.monthlyUsedCount,
    totalUsedCount: parsed.totalUsedCount,
  };
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
const USER_PATCH_SKIP_TOKEN = '__USER_PATCH_SKIP__';

async function getUser(userId: string) {
  const userKey = `user:${userId}`;
  const userStr = await redis.get(userKey);
  if (userStr) {
    const parsed = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
    const normalized = normalizeStoredUserRecord(parsed, userId);
    if (needsStoredUserMigration(parsed, normalized)) {
      await redis.set(userKey, serializeStoredUserRecord(normalized));
    }
    return hydrateUserUsage(normalized);
  }

  const newUser: StoredUserRecord = {
    userId,
    level: 'care',
    extraOcrQuota: 0,
    extraSummaryQuota: 0,
    firstUsedAt: new Date().toISOString(),
    note: '',
    status: 'active',
    group: DEFAULT_USER_GROUP,
  };
  await redis.set(userKey, serializeStoredUserRecord(newUser));
  return hydrateUserUsage(newUser);
}

async function patchStoredUserRecord(userId: string, patch: UserUpdateInput): Promise<StoredUserRecord> {
  const luaScript = `
    local raw = redis.call('GET', KEYS[1])
    local existing = raw and cjson.decode(raw) or {}

    local function sanitize_number(value)
      local numeric = tonumber(value)
      if not numeric or numeric < 0 then
        return 0
      end
      return math.floor(numeric)
    end

    local function read_existing_number(primary, legacy)
      local current = existing[primary]
      if current == nil and legacy then
        current = existing[legacy]
      end
      return sanitize_number(current or 0)
    end

    local level = existing.level or 'care'
    if level ~= 'care' and level ~= 'care_plus' and level ~= 'king' then
      level = 'care'
    end
    if ARGV[2] ~= '${USER_PATCH_SKIP_TOKEN}' then
      level = ARGV[2]
    end

    local group = existing.group
    if type(group) ~= 'string' or group == '' then
      group = ARGV[10]
    end
    if ARGV[3] ~= '${USER_PATCH_SKIP_TOKEN}' then
      group = ARGV[3]
    end

    local note = existing.note
    if type(note) ~= 'string' then
      note = ''
    end
    if ARGV[4] ~= '${USER_PATCH_SKIP_TOKEN}' then
      note = ARGV[4]
    end

    local status = existing.status
    if type(status) ~= 'string' or status == '' then
      status = 'active'
    end
    if ARGV[5] ~= '${USER_PATCH_SKIP_TOKEN}' then
      status = ARGV[5]
    end

    local extra_ocr = read_existing_number('extraOcrQuota', 'extraQuota')
    local extra_summary = read_existing_number('extraSummaryQuota', 'extraQuota')

    if ARGV[6] ~= '${USER_PATCH_SKIP_TOKEN}' then
      extra_ocr = sanitize_number(ARGV[6])
    else
      extra_ocr = sanitize_number(extra_ocr + sanitize_number(ARGV[8]))
    end
    if ARGV[7] ~= '${USER_PATCH_SKIP_TOKEN}' then
      extra_summary = sanitize_number(ARGV[7])
    else
      extra_summary = sanitize_number(extra_summary + sanitize_number(ARGV[9]))
    end

    local first_used_at = existing.firstUsedAt
    if type(first_used_at) ~= 'string' or first_used_at == '' then
      first_used_at = ARGV[11]
    end

    local stored = {
      userId = ARGV[1],
      level = level,
      extraOcrQuota = extra_ocr,
      extraSummaryQuota = extra_summary,
      firstUsedAt = first_used_at,
      note = note,
      status = status,
      group = group
    }

    redis.call('SET', KEYS[1], cjson.encode(stored))
    return cjson.encode(stored)
  `;

  const result = await redis.evalRaw(
    luaScript,
    [`user:${userId}`],
    [
      userId,
      patch.level ?? USER_PATCH_SKIP_TOKEN,
      patch.group ?? USER_PATCH_SKIP_TOKEN,
      patch.note ?? USER_PATCH_SKIP_TOKEN,
      patch.status ?? USER_PATCH_SKIP_TOKEN,
      patch.extraOcrQuota ?? USER_PATCH_SKIP_TOKEN,
      patch.extraSummaryQuota ?? USER_PATCH_SKIP_TOKEN,
      toNonNegativeNumber(patch.extraOcrQuotaDelta),
      toNonNegativeNumber(patch.extraSummaryQuotaDelta),
      DEFAULT_USER_GROUP,
      new Date().toISOString(),
    ],
  );

  const parsed = typeof result === 'string' ? JSON.parse(result) : result;
  return normalizeStoredUserRecord(parsed, userId);
}

async function updateUser(userId: string, data: UserUpdateInput) {
  const patch: UserUpdateInput = {};
  const hasLegacyExtraQuota = data?.extraQuota !== undefined;
  const normalizedLegacyExtraQuota = hasLegacyExtraQuota ? toNonNegativeNumber(data.extraQuota) : undefined;
  const hasAbsoluteExtraOcrQuota = data.extraOcrQuota !== undefined || normalizedLegacyExtraQuota !== undefined;
  const hasAbsoluteExtraSummaryQuota = data.extraSummaryQuota !== undefined || normalizedLegacyExtraQuota !== undefined;

  if (data.level !== undefined) {
    if (!isUserLevel(data.level)) {
      throw new Error(`Invalid level: ${String(data.level)}`);
    }
    const configs = await getLevelConfigs();
    if (!configs[data.level]) {
      throw new Error(`Invalid level: ${data.level}`);
    }
    patch.level = data.level;
  }

  if (data.group !== undefined) {
    patch.group = normalizeGroupName(data.group);
  }

  if (data.note !== undefined) {
    patch.note = typeof data.note === 'string' ? data.note.trim() : '';
  }

  if (data.status !== undefined && typeof data.status === 'string') {
    patch.status = data.status.trim() || 'active';
  }

  if (data.extraOcrQuota !== undefined) {
    patch.extraOcrQuota = toNonNegativeNumber(data.extraOcrQuota);
  } else if (normalizedLegacyExtraQuota !== undefined) {
    patch.extraOcrQuota = normalizedLegacyExtraQuota;
  }

  if (data.extraSummaryQuota !== undefined) {
    patch.extraSummaryQuota = toNonNegativeNumber(data.extraSummaryQuota);
  } else if (normalizedLegacyExtraQuota !== undefined) {
    patch.extraSummaryQuota = normalizedLegacyExtraQuota;
  }

  if (!hasAbsoluteExtraOcrQuota && data.extraOcrQuotaDelta !== undefined) {
    patch.extraOcrQuotaDelta = toNonNegativeNumber(data.extraOcrQuotaDelta);
  }

  if (!hasAbsoluteExtraSummaryQuota && data.extraSummaryQuotaDelta !== undefined) {
    patch.extraSummaryQuotaDelta = toNonNegativeNumber(data.extraSummaryQuotaDelta);
  }

  const updatedProfile = await patchStoredUserRecord(userId, patch);
  return hydrateUserUsage(updatedProfile);
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

function splitHeaderValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => splitHeaderValues(item));
  }

  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractForwardedForValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractForwardedForValues(item));
  }

  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .flatMap((entry) => entry.split(';'))
    .map((segment) => segment.trim())
    .filter((segment) => /^for=/i.test(segment))
    .map((segment) => segment.replace(/^for=/i, '').trim());
}

function parseIpCandidate(value: unknown): string {
  let candidate = String(value || '').trim();
  if (!candidate || /^unknown$/i.test(candidate)) {
    return '';
  }

  if (candidate.startsWith('"') && candidate.endsWith('"') && candidate.length > 1) {
    candidate = candidate.slice(1, -1).trim();
  }

  if (candidate.startsWith('[')) {
    const closingBracketIndex = candidate.indexOf(']');
    if (closingBracketIndex > 0) {
      candidate = candidate.slice(1, closingBracketIndex).trim();
    }
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.replace(/:\d+$/, '');
  }

  const normalized = normalizeIp(candidate);
  return isIP(normalized) ? normalized : '';
}

function extractClientIp(req: any): string {
  const candidates = [
    ...splitHeaderValues(req.headers['cf-connecting-ip']),
    ...splitHeaderValues(req.headers['x-forwarded-for']),
    ...extractForwardedForValues(req.headers.forwarded),
    ...splitHeaderValues(req.headers['x-real-ip']),
    ...splitHeaderValues(req.headers['x-client-ip']),
    ...splitHeaderValues(req.headers['true-client-ip']),
    ...splitHeaderValues(req.headers['fly-client-ip']),
    ...splitHeaderValues(req.headers['fastly-client-ip']),
    ...splitHeaderValues(req.headers['x-vercel-forwarded-for']),
    req.socket?.remoteAddress,
  ];

  for (const candidate of candidates) {
    const ip = parseIpCandidate(candidate);
    if (!ip) continue;
    if (!isPrivateIp(ip)) {
      return ip;
    }
  }

  for (const candidate of candidates) {
    const ip = parseIpCandidate(candidate);
    if (ip) return ip;
  }

  return 'unknown';
}

async function getIpLocation(ip: string): Promise<string> {
  const normalizedIp = parseIpCandidate(ip);

  if (!normalizedIp) {
    return UNKNOWN_IP_LOCATION;
  }

  if (isPrivateIp(normalizedIp)) {
    return LOCAL_IP_LOCATION;
  }

  if (ipLocationCache.has(normalizedIp)) {
    return ipLocationCache.get(normalizedIp)!;
  }

  const fetchWithTimeout = async (
    url: string,
    timeoutMs: number = IP_LOOKUP_CONFIG.timeoutMs,
  ): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: {
          'accept-language': 'zh-CN,zh;q=0.9',
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  const readJsonResponse = async <T>(response: Response): Promise<JsonResponse<T>> => {
    const rawText = await response.text();
    try {
      return {
        rawText,
        data: rawText ? JSON.parse(rawText) as T : null,
      };
    } catch {
      throw new Error(`INVALID_JSON ${rawText.slice(0, 120)}`);
    }
  };

  if (Date.now() < ipApiBlockedUntil) {
    return UNKNOWN_IP_LOCATION;
  }

  let location = UNKNOWN_IP_LOCATION;

  for (let attempt = 0; attempt < IP_LOOKUP_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(IP_LOOKUP_CONFIG.url(normalizedIp));
      const remainingHeader = response.headers.get('x-rl');
      const ttlHeader = response.headers.get('x-ttl');
      const remaining = remainingHeader === null ? Number.NaN : Number(remainingHeader);
      const ttlSeconds = ttlHeader === null ? Number.NaN : Number(ttlHeader);

      if ((response.status === 429 || remaining === 0) && Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
        ipApiBlockedUntil = Date.now() + (ttlSeconds * 1000);
      }

      const { rawText, data } = await readJsonResponse<IpApiResponse>(response);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${data?.message || rawText.slice(0, 120)}`);
      }

      if (data?.status !== 'success') {
        throw new Error(data?.message || 'IP lookup failed');
      }

      location = formatProvinceCity(data.regionName || '', data.city || '', data.country || UNKNOWN_IP_LOCATION) || UNKNOWN_IP_LOCATION;
      break;
    } catch (error: any) {
      console.error(`IP location lookup failed (ip-api, attempt ${attempt + 1}/${IP_LOOKUP_CONFIG.maxRetries}, ip=${normalizedIp}):`, error.message);
      if (Date.now() < ipApiBlockedUntil) {
        break;
      }
      if (attempt < IP_LOOKUP_CONFIG.maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }

  if (location === UNKNOWN_IP_LOCATION) {
    return location;
  }

  if (ipLocationCache.size >= 100) {
    const firstKey = ipLocationCache.keys().next().value;
    if (firstKey) {
      ipLocationCache.delete(firstKey);
    }
  }

  ipLocationCache.set(normalizedIp, location);
  return location;
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

function sanitizeWeChatSessionPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const { session_key, ...safePayload } = payload as Record<string, unknown>;
  return safePayload;
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
    res.set('Cache-Control', 'no-store');

    if (!appid || !secret) {
      console.error('WX_APPID or WX_APPSECRET not configured');
      return res.status(500).json({ error: 'WX_CONFIG_MISSING', message: '服务器微信配置缺失' });
    }

    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
    const response = await fetch(url);
    const data = await response.json() as any;
    const safeData = sanitizeWeChatSessionPayload(data);

    if (data.errcode) {
      console.error('WeChat API error:', safeData);
      return res.status(400).json({ error: 'WECHAT_API_ERROR', detail: safeData });
    }

    if (!data.openid) {
      return res.status(400).json({ error: 'OPENID_FETCH_FAILED', detail: safeData });
    }

    // session_key is a server-side secret and must never be returned to the client.
    return res.json({ openid: data.openid });
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
  
  return { valid: true, user, effectiveUserId };
}

// 1. OCR API
apiRouter.post('/analyze/image-base64', async (req, res) => {
  let reservation: FeatureUsageReservation | null = null;
  let effectiveUserIdForUsage = '';
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
    effectiveUserIdForUsage = effectiveUserId;

    if (!user.isUnlimited) {
      reservation = await reserveFeatureUsage(user, 'ocr');
      if (!reservation) {
        return res.status(403).json({ error: 'QUOTA_EXCEEDED', message: 'Monthly OCR quota exceeded' });
      }
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

    const ip = extractClientIp(req);
    const ipLocation = await getIpLocation(ip);
    await recordFeatureUsage(effectiveUserId, ip, ipLocation, 'ocr', reservation?.reservationId);
    reservation = null;

    res.json(resultJson);
  } catch (error: any) {
    if (reservation && effectiveUserIdForUsage) {
      try {
        await releaseFeatureUsageReservation(effectiveUserIdForUsage, 'ocr', reservation.reservationId);
      } catch (releaseError) {
        console.error('Failed to release OCR usage reservation:', releaseError);
      }
    }
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
  let reservation: FeatureUsageReservation | null = null;
  let effectiveUserIdForUsage = '';
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
    effectiveUserIdForUsage = effectiveUserId;

    if (!user.isUnlimited) {
      reservation = await reserveFeatureUsage(user, 'summary');
      if (!reservation) {
        return res.status(403).json({ success: false, error: 'QUOTA_EXCEEDED', message: 'Monthly summary quota exceeded' });
      }
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

    const ip = extractClientIp(req);
    const ipLocation = await getIpLocation(ip);
    const usageSnapshot = await recordFeatureUsage(effectiveUserId, ip, ipLocation, 'summary', reservation?.reservationId);
    reservation = null;

    res.json({
      success: true,
      summary,
      quota: {
        remaining: user.isUnlimited ? 9999 : Math.max(0, getFeatureTotalLimit(user, 'summary') - usageSnapshot.monthlyUsedCount),
        used: usageSnapshot.monthlyUsedCount,
        limit: getFeatureTotalLimit(user, 'summary'),
        resetAt: nextResetAt,
      },
    });
  } catch (error: any) {
    if (reservation && effectiveUserIdForUsage) {
      try {
        await releaseFeatureUsageReservation(effectiveUserIdForUsage, 'summary', reservation.reservationId);
      } catch (releaseError) {
        console.error('Failed to release summary usage reservation:', releaseError);
      }
    }
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

    const normalizedUser = await getUser(effectiveUserId);
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
    const logsStr = await redis.lrange('usage_logs', 0, 99);
    const parsedLogs = logsStr.map(l => typeof l === 'string' ? JSON.parse(l) : l);
    res.json(parsedLogs);
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
    let users: AdminUserView[] = [];
    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: 'user:*', count: 100 });
      cursor = nextCursor;
      if (keys.length > 0) {
        const userStrs = await redis.mget(...keys);
        const allUsers = userStrs
          .filter(Boolean)
          .map(u => typeof u === 'string' ? JSON.parse(u) : u)
          .filter((u: any) => u?.userId && !u.userId.startsWith('web_'))
          .map((u: any) => normalizeStoredUserRecord(u, String(u?.userId || '')));
        const hydratedUsers = await hydrateUsersUsage(allUsers);
        users.push(...hydratedUsers.map((user) => buildAdminUserView(user)));
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
    res.json(buildAdminUserView(updated));
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
