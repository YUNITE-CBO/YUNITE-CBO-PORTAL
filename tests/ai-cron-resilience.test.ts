/**
 * Regression: the AI-investigations cron route called listDueSchedules()
 * unguarded. When migration 030 hasn't been run on the live DB the query
 * throws (PGRST205 "Could not find the table ai_investigation_schedules")
 * and the route returned a bare 500 on every tick — the "Failed (HTTP
 * error) 500 Internal Server Error" in the Render cron history.
 *
 * The route must instead return a 503 with an actionable message.
 *
 * Second regression: the route awaited full dual-AI investigations
 * synchronously, but external pingers (cron-job.org) cap requests at 30s —
 * every tick with a due schedule died as "Failed (timeout)", and because
 * next_run_at was only advanced AFTER the run, the schedule re-fired (and
 * re-timed-out) on every tick. The route must now mark schedules first,
 * return 202 immediately, and run investigations in the background.
 */

import { NextRequest } from 'next/server';

export {};

jest.mock('@/ai/persistence', () => ({
  listDueSchedules: jest.fn(),
  markScheduleRun: jest.fn(),
}));
jest.mock('@/ai', () => ({ runInvestigation: jest.fn() }));
jest.mock('@/ai/alerting.service', () => ({ alertCriticalFindings: jest.fn() }));

const { listDueSchedules, markScheduleRun } = jest.requireMock('@/ai/persistence') as {
  listDueSchedules: jest.Mock;
  markScheduleRun: jest.Mock;
};
const { runInvestigation } = jest.requireMock('@/ai') as { runInvestigation: jest.Mock };
const { alertCriticalFindings } = jest.requireMock('@/ai/alerting.service') as {
  alertCriticalFindings: jest.Mock;
};

function req(secret: string) {
  return new NextRequest('https://x.test/api/cron/ai-investigations', {
    headers: { 'x-cron-secret': secret },
  });
}

const DUE = [
  { id: 's1', name: 'Weekly Full System', scope: 'full_system', cadence: 'weekly', time_of_day: '03:00', day_of_week: 1 },
];

describe('cron/ai-investigations resilience', () => {
  const SECRET = 'test-cron-secret';
  let route: typeof import('@/app/api/cron/ai-investigations/route');

  beforeEach(async () => {
    jest.resetModules();
    // resetModules clears the module registry — re-register the mocks so the
    // freshly-imported route picks them up.
    jest.doMock('@/ai/persistence', () => ({
      listDueSchedules,
      markScheduleRun,
    }));
    jest.doMock('@/ai', () => ({ runInvestigation }));
    jest.doMock('@/ai/alerting.service', () => ({ alertCriticalFindings }));
    jest.clearAllMocks();
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

  it('returns 202 immediately, advances schedules first, then investigates in the background', async () => {
    listDueSchedules.mockResolvedValue(DUE);
    markScheduleRun.mockResolvedValue(undefined);
    runInvestigation.mockResolvedValue({
      investigation_id: 'inv1',
      findings: [{ severity: 'critical' }],
      ai_status: 'completed',
      overall_score: 80,
    });
    alertCriticalFindings.mockResolvedValue({ notified: 1, skipped: 0 });

    const res = await route.GET(req(SECRET));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.accepted).toBe(true);
    expect(body.data.schedules_queued).toEqual([{ name: 'Weekly Full System', scope: 'full_system' }]);

    // mark-first: next_run_at advanced even though the run had not finished.
    expect(markScheduleRun).toHaveBeenCalledWith('s1', expect.any(String));

    await route._awaitBackgroundWork();
    expect(runInvestigation).toHaveBeenCalledWith('full_system', undefined, undefined, 'cron');
    expect(alertCriticalFindings).toHaveBeenCalledWith('inv1', [{ severity: 'critical' }]);
    expect(markScheduleRun.mock.invocationCallOrder[0]).toBeLessThan(
      runInvestigation.mock.invocationCallOrder[0],
    );
  });

  it('does not alert when there are no critical findings', async () => {
    listDueSchedules.mockResolvedValue(DUE);
    markScheduleRun.mockResolvedValue(undefined);
    runInvestigation.mockResolvedValue({
      investigation_id: 'inv2',
      findings: [{ severity: 'info' }],
      ai_status: 'completed',
      overall_score: 95,
    });

    const res = await route.GET(req(SECRET));
    expect(res.status).toBe(202);
    await route._awaitBackgroundWork();
    expect(alertCriticalFindings).not.toHaveBeenCalled();
  });

  it('survives a background schedule failure without failing the 202', async () => {
    listDueSchedules.mockResolvedValue(DUE);
    markScheduleRun.mockResolvedValue(undefined);
    runInvestigation.mockRejectedValue(new Error('db gone'));

    const res = await route.GET(req(SECRET));
    expect(res.status).toBe(202);
    await expect(route._awaitBackgroundWork()).resolves.toBeUndefined();
    // mark-first still advanced the schedule so the failure does not re-fire every tick.
    expect(markScheduleRun).toHaveBeenCalledWith('s1', expect.any(String));
  });

  it('skips a second tick while a background tick is still running', async () => {
    let release!: () => void;
    runInvestigation.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ investigation_id: 'inv3', findings: [], ai_status: 'completed', overall_score: 100 });
        }),
    );
    listDueSchedules.mockResolvedValue(DUE);
    markScheduleRun.mockResolvedValue(undefined);

    const res1 = await route.GET(req(SECRET));
    expect(res1.status).toBe(202);
    expect(runInvestigation).toHaveBeenCalledTimes(1);

    const res2 = await route.GET(req(SECRET));
    expect(res2.status).toBe(202);
    expect(runInvestigation).toHaveBeenCalledTimes(1); // overlap skipped

    release();
    await route._awaitBackgroundWork();
    expect(runInvestigation).toHaveBeenCalledTimes(1);
  });
});
