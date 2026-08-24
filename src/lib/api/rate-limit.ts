/**
 * YUNITE API — Rate limiting & abuse protection
 *
 * Fixed-window limiter keyed by client (or IP for anonymous).
 *
 * Store selection (lazy, per-process):
 *   - REDIS_URL set   → shared Redis store (e.g. an Upstash rediss:// URL),
 *                       so limits hold across serverless instances (Vercel)
 *   - REDIS_URL unset → in-memory Map, adequate for a single-instance
 *                       deployment (Render) and local dev
 *
 * Redis failures fail OPEN to the in-memory store (a rate-limiter outage must
 * never take the API down), with a short cooldown before Redis is retried.
 * Rate-limit events are still persisted to api_request_logs by the handler.
 *
 * Limits are tier-based with per-endpoint overrides applied by the handler.
 */

import Redis from 'ioredis';
import type { ApiPrincipal } from './principal';

interface Bucket {
  tokens: number;
  refillAt: number;
}

const DEFAULT_LIMITS: Record<ApiPrincipal['clientTier'], number> = {
  public: 30, // requests per minute
  standard: 120,
  privileged: 600,
};

const WINDOW_MS = 60_000;
const REDIS_FAILURE_COOLDOWN_MS = 30_000;
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
}

function checkInMemory(key: string, limit: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket) {
    buckets.set(key, { tokens: limit - 1, refillAt: now + WINDOW_MS });
    return { allowed: true, remaining: limit - 1, limit, retryAfterSeconds: 0 };
  }

  // Refill on window rollover.
  if (now >= bucket.refillAt) {
    bucket.tokens = limit;
    bucket.refillAt = now + WINDOW_MS;
  }

  if (bucket.tokens > 0) {
    bucket.tokens -= 1;
    return { allowed: true, remaining: bucket.tokens, limit, retryAfterSeconds: 0 };
  }

  const retryAfterSeconds = Math.ceil((bucket.refillAt - now) / 1000);
  return { allowed: false, remaining: 0, limit, retryAfterSeconds };
}

/** Minimal surface of ioredis used here (also satisfied by test fakes). */
interface RedisLike {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
}

let redisClient: RedisLike | null | undefined;
let redisDisabledUntil = 0;

function getRedis(): RedisLike | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) {
    redisClient = null;
    return null;
  }
  try {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
  } catch (err) {
    console.warn('[rate-limit] Redis init failed; using in-memory store:', err);
    redisClient = null;
  }
  return redisClient;
}

async function checkRedis(client: RedisLike, key: string, limit: number): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / WINDOW_MS);
  const redisKey = `rl:${key}:${windowStart}`;
  const count = await client.incr(redisKey);
  if (count === 1) {
    // Set the window TTL once. If this fails the stale key is harmless —
    // the next minute's requests use a new window key.
    await client.pexpire(redisKey, WINDOW_MS).catch(() => 0);
  }
  if (count <= limit) {
    return { allowed: true, remaining: limit - count, limit, retryAfterSeconds: 0 };
  }
  const windowEnd = (windowStart + 1) * WINDOW_MS;
  return { allowed: false, remaining: 0, limit, retryAfterSeconds: Math.ceil((windowEnd - now) / 1000) };
}

export async function checkRateLimit(
  principal: ApiPrincipal,
  limitOverride?: number
): Promise<RateLimitResult> {
  const key = principal.authMode === 'anonymous'
    ? `anon:${principal.clientId}`
    : principal.authMode === 'session'
      ? `user:${principal.userId ?? principal.clientId}`
      : `client:${principal.keyId ?? principal.clientId}`;

  const limit = limitOverride ?? DEFAULT_LIMITS[principal.clientTier] ?? DEFAULT_LIMITS.standard;

  const redis = getRedis();
  if (redis && Date.now() >= redisDisabledUntil) {
    try {
      return await checkRedis(redis, key, limit);
    } catch (err) {
      redisDisabledUntil = Date.now() + REDIS_FAILURE_COOLDOWN_MS;
      console.warn('[rate-limit] Redis check failed; falling back to in-memory for 30s:', err);
    }
  }
  return checkInMemory(key, limit);
}

/** Test hook: reset all in-memory buckets. */
export function _resetRateLimits(): void {
  buckets.clear();
}

/** Test hook: inject a fake Redis client (or null to force the in-memory store). */
export function _setRedisClientForTests(client: RedisLike | null): void {
  redisClient = client;
  redisDisabledUntil = 0;
}
