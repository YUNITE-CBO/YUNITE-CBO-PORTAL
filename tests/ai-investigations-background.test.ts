/**
 * Regression: POST /api/ai/investigations awaited the full runInvestigation
 * synchronously. A manual dual investigation takes minutes, but Vercel kills
 * the function at maxDuration (60s) and returns its plain-text error page —
 * the dashboard then died on res.json() with
 * "Investigation failed: JSON.parse: unexpected character at line 1 column 1".
 *
 * The route now returns 202 immediately and runs the investigation in the
 * background (same pattern as /api/cron/ai-investigations); the engine
 * creates + finalizes the ai_investigations row, and the dashboard polls
 * History and auto-opens it.
 */

import { NextRequest } from 'next/server';

export {};

const requireAdminAuth = jest.fn();
const runInvestigation = jest.fn();

jest.mock('@/app/api/ai/_guard', () => ({
  requireAdminAuth: (...args: any[]) => requireAdminAuth(...args),
}));
jest.mock('@/ai', () => ({
  runInvestigation: (...args: any[]) => runInvestigation(...args),
}));
jest.mock('@/ai/persistence', () => ({
  listInvestigations: jest.fn().mockResolvedValue([]),
}));

function req(body: any) {
  return new NextRequest('https://x.test/api/ai/investigations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/investigations (202 background)', () => {
  let route: typeof import('@/app/api/ai/investigations/route');
  let background: typeof import('@/app/api/ai/investigations/background');

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    requireAdminAuth.mockResolvedValue({ ok: true, userId: 'admin-1' });
    route = await import('@/app/api/ai/investigations/route');
    background = await import('@/app/api/ai/investigations/background');
  });

  it('returns 202 immediately and runs the investigation in the background', async () => {
    runInvestigation.mockResolvedValue({
      investigation_id: 'inv1',
      investigation_number: 'INV-1',
      scope: 'full_system',
      ai_status: 'completed',
      overall_score: 90,
      findings: [],
    });
    const res = await route.POST(req({ scope: 'full_system' }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.accepted).toBe(true);
    expect(body.data.scope).toBe('full_system');

    await background._awaitBackgroundWork();
    expect(runInvestigation).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'full_system', initiatedBy: 'admin-1', trigger: 'manual' }),
    );
  });

  it('survives a background run failure without failing the 202', async () => {
    runInvestigation.mockRejectedValue(new Error('db gone'));
    const res = await route.POST(req({ scope: 'database' }));
    expect(res.status).toBe(202);
    await expect(background._awaitBackgroundWork()).resolves.toBeUndefined();
  });

  it('still validates the scope synchronously (400 before any background work)', async () => {
    const res = await route.POST(req({ scope: 'not_a_scope' }));
    expect(res.status).toBe(400);
    expect(runInvestigation).not.toHaveBeenCalled();
  });

  it('still requires memberId for member_verification', async () => {
    const res = await route.POST(req({ scope: 'member_verification' }));
    expect(res.status).toBe(400);
    expect(runInvestigation).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated callers', async () => {
    requireAdminAuth.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false }), { status: 401 }),
    });
    const res = await route.POST(req({ scope: 'database' }));
    expect(res.status).toBe(401);
    expect(runInvestigation).not.toHaveBeenCalled();
  });

  it('skips a second run while a background run is still in flight', async () => {
    let release!: () => void;
    runInvestigation.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              investigation_id: 'inv9',
              investigation_number: 'INV-9',
              scope: 'database',
              ai_status: 'completed',
              overall_score: 100,
              findings: [],
            });
        }),
    );
    const res1 = await route.POST(req({ scope: 'database' }));
    expect(res1.status).toBe(202);
    expect(runInvestigation).toHaveBeenCalledTimes(1);

    const res2 = await route.POST(req({ scope: 'database' }));
    expect(res2.status).toBe(202);
    expect(runInvestigation).toHaveBeenCalledTimes(1); // overlap skipped

    release();
    await background._awaitBackgroundWork();
    expect(runInvestigation).toHaveBeenCalledTimes(1);
  });
});
