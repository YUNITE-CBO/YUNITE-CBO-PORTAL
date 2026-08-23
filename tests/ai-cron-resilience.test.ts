/**
 * Regression: the AI-investigations cron route called listDueSchedules()
 * unguarded. When migration 030 hasn't been run on the live DB the query
 * throws (PGRST205 "Could not find the table ai_investigation_schedules")
 * and the route returned a bare 500 on every tick — the "Failed (HTTP
 * error) 500 Internal Server Error" in the Render cron history.
 *
 * The route must instead return a 503 with an actionable message.
 */

import { NextRequest } from 'next/server';

export {};

jest.mock('@/ai/persistence', () => ({
  listDueSchedules: jest.fn(),
  markScheduleRun: jest.fn(),
}));
jest.mock('@/ai', () => ({ runInvestigation: jest.fn() }));
jest.mock('@/ai/alerting.service', () => ({ alertCriticalFindings: jest.fn() }));

const { listDueSchedules } = jest.requireMock('@/ai/persistence') as {
  listDueSchedules: jest.Mock;
};

function req(secret: string) {
  return new NextRequest('https://x.test/api/cron/ai-investigations', {
    headers: { 'x-cron-secret': secret },
  });
}

describe('cron/ai-investigations resilience', () => {
  const SECRET = 'test-cron-secret';
  let route: typeof import('@/app/api/cron/ai-investigations/route');

  beforeEach(async () => {
    jest.resetModules();
    // resetModules clears the module registry — re-register the mocks so the
    // freshly-imported route picks them up.
    jest.doMock('@/ai/persistence', () => ({
      listDueSchedules,
      markScheduleRun: jest.fn(),
    }));
    jest.doMock('@/ai', () => ({ runInvestigation: jest.fn() }));
    jest.doMock('@/ai/alerting.service', () => ({ alertCriticalFindings: jest.fn() }));
    process.env.CRON_SECRET = SECRET;
    route = await import('@/app/api/cron/ai-investigations/route');
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('returns 503 with an actionable message when the schedules table is missing', async () => {
    listDueSchedules.mockRejectedValue(
      Object.assign(new Error("Could not find the table 'public.ai_investigation_schedules' in the schema cache"), { code: 'PGRST205' }),
    );
    const res = await route.GET(req(SECRET));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/migration 030/i);
  });

  it('returns 200 with zero runs when no schedules are due', async () => {
    listDueSchedules.mockResolvedValue([]);
    const res = await route.GET(req(SECRET));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.schedules_run).toBe(0);
  });

  it('returns 401 for a wrong secret', async () => {
    const res = await route.GET(req('wrong'));
    expect(res.status).toBe(401);
  });
});
