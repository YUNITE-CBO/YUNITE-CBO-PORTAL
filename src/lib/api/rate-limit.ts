/**
 * YUNITE API — Rate limiting & abuse protection
 *
 * Token-bucket limiter keyed by client (or IP for anonymous). This is a
 * single-instance deployment (Render), so an in-memory store is adequate;
 * rate-limit events are still persisted to api_request_logs for visibility.
 *
 * Limits are tier-based with per-endpoint overrides applied by the handler.
 */

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
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  principal: ApiPrincipal,
  limitOverride?: number
): RateLimitResult {
  const key = principal.authMode === 'anonymous'
    ? `anon:${principal.clientId}`
    : `client:${principal.clientId}`;

  const limit = limitOverride ?? DEFAULT_LIMITS[principal.clientTier] ?? DEFAULT_LIMITS.standard;
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

/** Test hook: reset all buckets. */
export function _resetRateLimits(): void {
  buckets.clear();
}
