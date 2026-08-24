/**
 * Rate limiter tests (src/lib/api/rate-limit.ts).
 *
 * Covers both stores:
 *   - in-memory Map (no REDIS_URL — single-instance Render / local dev)
 *   - shared Redis store (REDIS_URL set — serverless / Vercel), exercised
 *     through an injected fake client so the REAL redis code path (window
 *     keying, TTL-on-first-incr, fixed-window semantics) is tested without
 *     a live Redis server.
 * Also covers the fail-open behavior: a Redis outage must never take the
 * API down — the limiter falls back to the in-memory store with a cooldown.
 */

import {
  checkRateLimit,
  _resetRateLimits,
  _setRedisClientForTests,
} from '@/lib/api/rate-limit';
import type { ApiPrincipal } from '@/lib/api/principal';

function principal(overrides: Partial<ApiPrincipal> = {}): ApiPrincipal {
  return {
    authMode: 'api_key',
    clientId: 'client-1',
    clientName: 'Test Client',
    clientType: 'third_party',
    clientTier: 'standard',
    ...overrides,
  } as ApiPrincipal;
}

class FakeRedis {
  counts = new Map<string, number>();
  expiries = new Map<string, number>();
  incrCalls = 0;
  failWith: Error | null = null;

  async incr(key: string): Promise<number> {
    this.incrCalls += 1;
    if (this.failWith) throw this.failWith;
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return next;
  }

  async pexpire(key: string, ms: number): Promise<number> {
    this.expiries.set(key, ms);
    return 1;
  }
}

beforeEach(() => {
  delete process.env.REDIS_URL;
  _resetRateLimits();
  _setRedisClientForTests(null);
});

describe('in-memory store (REDIS_URL unset)', () => {
  it('allows up to the limit then denies with a retry-after', async () => {
    const p = principal();
    const r1 = await checkRateLimit(p, 2);
    const r2 = await checkRateLimit(p, 2);
    const r3 = await checkRateLimit(p, 2);

    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(1);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
    expect(r3.retryAfterSeconds).toBeGreaterThan(0);
    expect(r3.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('tracks buckets independently per client', async () => {
    const a = principal({ clientId: 'client-a' });
    const b = principal({ clientId: 'client-b' });

    await checkRateLimit(a, 1);
    const aDenied = await checkRateLimit(a, 1);
    const bAllowed = await checkRateLimit(b, 1);

    expect(aDenied.allowed).toBe(false);
    expect(bAllowed.allowed).toBe(true);
  });

  it('tracks session users independently even though they share the portal client', async () => {
    const a = principal({ authMode: 'session', userId: 'user-a' });
    const b = principal({ authMode: 'session', userId: 'user-b' });

    await checkRateLimit(a, 1);
    expect((await checkRateLimit(a, 1)).allowed).toBe(false);
    expect((await checkRateLimit(b, 1)).allowed).toBe(true);
  });

  it('applies the tier default when no override is given', async () => {
    const p = principal({ clientTier: 'public' }); // 30/min
    const r = await checkRateLimit(p);
    expect(r.limit).toBe(30);
    expect(r.remaining).toBe(29);
  });
});

describe('redis store (REDIS_URL set — serverless)', () => {
  it('counts via INCR and sets the window TTL on the first hit', async () => {
    const redis = new FakeRedis();
    _setRedisClientForTests(redis);
    const p = principal();

    const r1 = await checkRateLimit(p, 2);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(1);
    expect(redis.incrCalls).toBe(1);

    const key = Array.from(redis.counts.keys())[0];
    expect(key).toMatch(/^rl:client:client-1:\d+$/);
    expect(redis.expiries.get(key)).toBe(60_000);
  });

  it('denies once the shared count exceeds the limit', async () => {
    const redis = new FakeRedis();
    _setRedisClientForTests(redis);
    const p = principal();

    await checkRateLimit(p, 2);
    await checkRateLimit(p, 2);
    const r3 = await checkRateLimit(p, 2);

    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
    expect(r3.retryAfterSeconds).toBeGreaterThan(0);
    expect(r3.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('keys anonymous callers separately from authenticated clients', async () => {
    const redis = new FakeRedis();
    _setRedisClientForTests(redis);

    await checkRateLimit(principal({ authMode: 'anonymous', clientId: '1.2.3.4' }), 5);
    await checkRateLimit(principal({ clientId: 'client-1' }), 5);

    const keys = Array.from(redis.counts.keys());
    expect(keys.some((k) => k.startsWith('rl:anon:1.2.3.4:'))).toBe(true);
    expect(keys.some((k) => k.startsWith('rl:client:client-1:'))).toBe(true);
  });
});

describe('redis failure handling (fail-open)', () => {
  it('falls back to the in-memory store when Redis errors', async () => {
    const redis = new FakeRedis();
    redis.failWith = new Error('ECONNREFUSED');
    _setRedisClientForTests(redis);
    const p = principal();

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await checkRateLimit(p, 1);
    expect(r.allowed).toBe(true); // fail-open: request still served
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('cools down after a Redis failure instead of paying latency per request', async () => {
    const redis = new FakeRedis();
    redis.failWith = new Error('ECONNREFUSED');
    _setRedisClientForTests(redis);
    const p = principal();

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await checkRateLimit(p, 10);
    await checkRateLimit(p, 10);
    await checkRateLimit(p, 10);
    warn.mockRestore();

    expect(redis.incrCalls).toBe(1); // subsequent calls went straight to memory
  });

  it('still enforces limits via the in-memory fallback during an outage', async () => {
    const redis = new FakeRedis();
    redis.failWith = new Error('ECONNREFUSED');
    _setRedisClientForTests(redis);
    const p = principal();

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await checkRateLimit(p, 1);
    const denied = await checkRateLimit(p, 1);
    warn.mockRestore();

    expect(denied.allowed).toBe(false);
  });
});
