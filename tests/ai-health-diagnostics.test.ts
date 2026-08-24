/**
 * Diagnostics for "the dashboard says UNAVAILABLE but my env var is set".
 *
 * The health monitor reports a provider 'unavailable' only when the RUNTIME
 * cannot see its API key (isConfigured() === false) — so the health endpoint
 * now exposes `configured.gemini_key_present` / `openrouter_key_present`
 * (booleans, never the keys) and a `?probe=true` live reachability check that
 * returns the provider's real error (401 bad key / 404 bad model / timeout).
 */

import { NextRequest } from 'next/server';

export {};

const requireAdminAuth = jest.fn();
const getHealth = jest.fn();
const geminiProvider = { isConfigured: jest.fn(), ping: jest.fn() };
const openRouterProvider = { isConfigured: jest.fn(), ping: jest.fn() };

jest.mock('@/app/api/ai/_guard', () => ({
  requireAdminAuth: (...args: any[]) => requireAdminAuth(...args),
}));
jest.mock('@/ai', () => ({
  getHealth: (...args: any[]) => getHealth(...args),
  geminiProvider,
  openRouterProvider,
}));
jest.mock('@/ai/persistence', () => ({
  getLatestHealth: jest.fn().mockResolvedValue({}),
  listProviderRuns: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/ai/settings', () => ({
  readAiSettings: jest.fn().mockResolvedValue({}),
}));
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn().mockResolvedValue({
    from: () => ({
      select: () => ({
        order: () => ({ limit: () => Promise.resolve({ data: [] }) }),
      }),
    }),
  }),
}));

const HEALTHY = {
  provider: 'gemini',
  status: 'healthy',
  availability_pct: 100,
  success_count: 1,
  failure_count: 0,
  timeout_count: 0,
  rate_limited_count: 0,
  fallback_count: 0,
};

function req(url: string) {
  return new NextRequest(url);
}

describe('GET /api/ai/health diagnostics', () => {
  let route: typeof import('@/app/api/ai/health/route');

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    requireAdminAuth.mockResolvedValue({ ok: true });
    getHealth.mockResolvedValue(HEALTHY);
    route = await import('@/app/api/ai/health/route');
  });

  it('reports gemini_key_present=false when the runtime cannot see the key', async () => {
    geminiProvider.isConfigured.mockReturnValue(false);
    openRouterProvider.isConfigured.mockReturnValue(true);
    const res = await route.GET(req('https://x.test/api/ai/health'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.configured.gemini_key_present).toBe(false);
    expect(body.data.configured.openrouter_key_present).toBe(true);
    expect(body.data.probes).toBeUndefined();
  });

  it('does not probe providers unless ?probe=true', async () => {
    geminiProvider.isConfigured.mockReturnValue(true);
    openRouterProvider.isConfigured.mockReturnValue(true);
    await route.GET(req('https://x.test/api/ai/health'));
    expect(geminiProvider.ping).not.toHaveBeenCalled();
    expect(openRouterProvider.ping).not.toHaveBeenCalled();
  });

  it('?probe=true pings both providers and returns their real errors', async () => {
    geminiProvider.isConfigured.mockReturnValue(true);
    openRouterProvider.isConfigured.mockReturnValue(true);
    geminiProvider.ping.mockResolvedValue({ ok: true, latency_ms: 120 });
    openRouterProvider.ping.mockResolvedValue({ ok: false, latency_ms: 340, error: 'HTTP 401' });
    const res = await route.GET(req('https://x.test/api/ai/health?probe=true'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.probes.gemini).toEqual({ ok: true, latency_ms: 120 });
    expect(body.data.probes.openrouter).toEqual({ ok: false, latency_ms: 340, error: 'HTTP 401' });
  });

  it('probe survives a ping that throws (reports the error instead of 500)', async () => {
    geminiProvider.isConfigured.mockReturnValue(true);
    openRouterProvider.isConfigured.mockReturnValue(true);
    geminiProvider.ping.mockRejectedValue(new Error('socket hangup'));
    openRouterProvider.ping.mockResolvedValue({ ok: true, latency_ms: 90 });
    const res = await route.GET(req('https://x.test/api/ai/health?probe=true'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.probes.gemini.ok).toBe(false);
    expect(body.data.probes.gemini.error).toMatch(/socket hangup/);
    expect(body.data.probes.openrouter.ok).toBe(true);
  });

  it('rejects unauthenticated callers', async () => {
    requireAdminAuth.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false }), { status: 401 }),
    });
    const res = await route.GET(req('https://x.test/api/ai/health?probe=true'));
    expect(res.status).toBe(401);
    expect(geminiProvider.ping).not.toHaveBeenCalled();
  });
});
