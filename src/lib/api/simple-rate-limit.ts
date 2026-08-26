/**
 * SIMPLE RATE LIMITER for legacy (non-v1-gateway) routes.
 *
 * The v1 API gateway has its own Redis-backed limiter (src/lib/api/rate-limit.ts).
 * This is a lightweight in-memory fixed-window limiter for legacy /api/* routes
 * that handle sensitive operations outside the gateway (login, public
 * registration, public member lookup). It is per-process — adequate for the
 * single-instance Render deployment; the v1 gateway limiter remains the
 * multi-instance solution.
 */

import { NextRequest } from 'next/server';

interface WindowBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowBucket>();
const MAX_BUCKETS = 10_000;

export interface SimpleRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Check (and consume) one request for `key` within the current window.
 * Fails CLOSED on internal errors for sensitive endpoints: an exception in
 * the limiter must not silently unlock a PII or credential endpoint.
 */
export function checkSimpleRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60_000
): SimpleRateLimitResult {
  const now = Date.now();

  // Bound memory: drop expired buckets when the map grows large.
  if (buckets.size >= MAX_BUCKETS) {
    buckets.forEach((b, k) => {
      if (now >= b.resetAt) buckets.delete(k);
    });
  }

  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return {
    allowed: true,
    limit,
    remaining: limit - bucket.count,
    retryAfterSeconds: 0,
  };
}

/** Best-effort client IP for rate-limit keying on anonymous routes. */
export function getRateLimitIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Test hook: clear all buckets between tests. */
export function _resetSimpleRateLimit(): void {
  buckets.clear();
}
