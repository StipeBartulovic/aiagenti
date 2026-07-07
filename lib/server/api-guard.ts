import { ServerActionError } from './errors';
import { readEnvValue } from '@/lib/env';

type BucketRule = {
  limit: number;
  windowMs: number;
};

type Entry = {
  count: number;
  resetAt: number;
};

const DEFAULT_RULE: BucketRule = { limit: 12, windowMs: 60_000 };
const MAX_STRING_LENGTH = 12_000;
const MAX_ARRAY_ITEMS = 100;
const MAX_OBJECT_KEYS = 100;
const MAX_NESTING_DEPTH = 8;

const RULES: Record<string, BucketRule> = {
  '/api/chat': { limit: 20, windowMs: 60_000 },
  '/api/idea-brief': { limit: 20, windowMs: 60_000 },
  '/api/intake': { limit: 20, windowMs: 60_000 },
  '/api/research': { limit: 6, windowMs: 60_000 },
  '/api/validate': { limit: 8, windowMs: 60_000 },
};

const MAX_JSON_BYTES = 200_000;

function getStore(): Map<string, Entry> {
  const scoped = globalThis as typeof globalThis & {
    __aivalidatorRateLimitStore?: Map<string, Entry>;
  };
  if (!scoped.__aivalidatorRateLimitStore) {
    scoped.__aivalidatorRateLimitStore = new Map<string, Entry>();
  }
  return scoped.__aivalidatorRateLimitStore;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const cfIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;

  return 'unknown';
}

function redisConfig() {
  const url = readEnvValue('UPSTASH_REDIS_REST_URL');
  const token = readEnvValue('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

async function redisCommand<T>(command: unknown[]): Promise<T | null> {
  const config = redisConfig();
  if (!config) return null;

  const res = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([command]),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new ServerActionError('Rate limit backend request failed.', 500, 'rate_limit_backend_failed');
  }

  const body = await res.json() as { result?: unknown; error?: string }[];
  const first = body[0];
  if (first?.error) {
    throw new ServerActionError('Rate limit backend command failed.', 500, 'rate_limit_backend_failed');
  }

  return (first?.result ?? null) as T | null;
}

function sanitizeString(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, MAX_STRING_LENGTH);
}

function sanitizeUnknown(value: unknown, depth = 0): unknown {
  if (depth > MAX_NESTING_DEPTH) {
    throw new ServerActionError('Request body is nested too deeply.', 400, 'invalid_request_body');
  }

  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeUnknown(item, depth + 1));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);
    return Object.fromEntries(
      entries.map(([key, entryValue]) => [key, sanitizeUnknown(entryValue, depth + 1)])
    );
  }

  throw new ServerActionError('Unsupported request body.', 400, 'invalid_request_body');
}

export async function guardApiRoute(request: Request): Promise<void> {
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
    throw new ServerActionError('Request body too large.', 413, 'request_too_large');
  }

  const pathname = new URL(request.url).pathname;
  const rule = RULES[pathname] || DEFAULT_RULE;
  const ip = getClientIp(request);
  const now = Date.now();
  const key = `${pathname}:${ip}`;
  const redis = redisConfig();

  if (redis) {
    const redisKey = `rate:${key}`;
    const count = Number(await redisCommand<number>(['INCR', redisKey]) ?? 0);
    if (count === 1) {
      await redisCommand(['PEXPIRE', redisKey, rule.windowMs]);
    }
    if (count > rule.limit) {
      throw new ServerActionError('Too many requests. Try again in a minute.', 429, 'rate_limited');
    }
    return;
  }

  const store = getStore();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + rule.windowMs });
    return;
  }

  if (current.count >= rule.limit) {
    throw new ServerActionError('Too many requests. Try again in a minute.', 429, 'rate_limited');
  }

  current.count += 1;
  store.set(key, current);
}

export async function parseAndSanitizeJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new ServerActionError('Content-Type must be application/json.', 415, 'invalid_content_type');
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ServerActionError('Invalid JSON body.', 400, 'invalid_json');
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ServerActionError('Request body must be a JSON object.', 400, 'invalid_request_body');
  }

  return sanitizeUnknown(raw) as T;
}
