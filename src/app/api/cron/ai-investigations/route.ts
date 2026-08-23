/**
 * GET  /api/cron/ai-investigations
 * POST /api/cron/ai-investigations
 *
 * The clock that wakes scheduled AI investigations. Render cron pokes this
 * endpoint (no session cookie) with the shared CRON_SECRET. Each tick:
 *   1. Reads due ai_investigation_schedules (is_enabled, next_run_at <= now).
 *   2. For each, runs runInvestigation(scope) (dual mode for full_system).
 *   3. Alerts on any CRITICAL findings (internal notification + email).
 *   4. Advances next_run_at.
 *
 * If both AI providers are unavailable, deterministic findings are still
 * produced and the alert still fires on deterministic criticals — AI is an
 * intelligence layer, not a dependency for alerting.
 *
 * Auth: CRON_SECRET (header X-Cron-Secret OR Authorization: Bearer — Vercel
 * Cron's native form — OR ?secret=). 503 if unset.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runInvestigation } from '@/ai';
import { listDueSchedules, markScheduleRun } from '@/ai/persistence';
import { alertCriticalFindings } from '@/ai/alerting.service';
export const dynamic = 'force-dynamic';
// Dual-provider AI investigations can take minutes. Capped at 60s to fit
// the Vercel Hobby function limit; Render ignores this.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return runTick(request);
}

export async function POST(request: NextRequest) {
  return runTick(request);
}

async function runTick(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET is not configured; AI investigation cron is disabled.' },
      { status: 503 },
    );
  }
  const bearer = request.headers.get('authorization');
  const provided =
    request.headers.get('x-cron-secret') ||
    (bearer?.startsWith('Bearer ') ? bearer.slice(7) : null) ||
    request.nextUrl.searchParams.get('secret');
  if (provided !== expected) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const due = await listDueSchedules();
  const results: any[] = [];
  let totalCritical = 0;
  let totalAlerts = 0;

  for (const schedule of due) {
    try {
      const result = await runInvestigation(schedule.scope, undefined, undefined, 'cron');
      const criticals = result.findings.filter((f) => f.severity === 'critical').length;
      totalCritical += criticals;
      const alert = criticals > 0
        ? await alertCriticalFindings(result.investigation_id, result.findings).catch(() => ({ notified: 0, skipped: 0 }))
        : { notified: 0, skipped: 0 };
      totalAlerts += alert.notified;
      const nextRun = computeNextFromSchedule(schedule);
      await markScheduleRun(schedule.id, nextRun);
      results.push({ schedule: schedule.name, scope: schedule.scope, investigation_id: result.investigation_id, ai_status: result.ai_status, score: result.overall_score, criticals, alerts: alert.notified });
    } catch (error: any) {
      console.error(`[cron/ai-investigations] schedule ${schedule.name} failed:`, error);
      results.push({ schedule: schedule.name, scope: schedule.scope, error: error?.message || String(error) });
      const nextRun = computeNextFromSchedule(schedule);
      await markScheduleRun(schedule.id, nextRun).catch(() => undefined);
    }
  }

  return NextResponse.json({
    success: true,
    data: { schedules_run: results.length, total_critical: totalCritical, total_alerts: totalAlerts, results },
  });
}

function computeNextFromSchedule(s: any): string | null {
  const cadence = s.cadence as string;
  if (cadence === 'on_demand') return null;
  const now = new Date();
  const [hh, mm] = (s.time_of_day || '03:00').split(':').map(Number);
  const next = new Date(now);
  next.setHours(hh ?? 3, mm ?? 0, 0, 0);
  if (cadence === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (cadence === 'weekly') {
    const target = s.day_of_week ?? 1;
    const cur = next.getDay();
    let delta = (target - cur + 7) % 7;
    if (delta === 0 && next <= now) delta = 7;
    next.setDate(next.getDate() + delta);
  } else if (cadence === 'monthly') {
    const target = s.day_of_month ?? 1;
    next.setDate(target);
    next.setMonth(next.getMonth() + (next <= now ? 1 : 0));
  }
  return next.toISOString();
}
