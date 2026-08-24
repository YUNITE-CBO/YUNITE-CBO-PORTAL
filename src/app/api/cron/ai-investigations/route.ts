/**
 * GET  /api/cron/ai-investigations
 * POST /api/cron/ai-investigations
 *
 * The clock that wakes scheduled AI investigations. Render cron / cron-job.org
 * / the GitHub Actions pinger poke this endpoint (no session cookie) with the
 * shared CRON_SECRET. Each tick:
 *   1. Reads due ai_investigation_schedules (is_enabled, next_run_at <= now).
 *   2. Advances each schedule's next_run_at immediately (mark-first).
 *   3. Returns 202, then runs each schedule's investigation in the background
 *      (dual mode for full_system) and alerts on CRITICAL findings.
 *
 * External pingers (cron-job.org caps requests at 30s) cannot wait for a
 * full dual-AI investigation (minutes). The route therefore runs in two
 * phases:
 *   FAST PHASE (awaited, well under 30s): auth -> list due schedules ->
 *   advance each schedule's next_run_at (mark-first, so a killed run never
 *   re-fires on every tick) -> return 202 Accepted.
 *   BACKGROUND PHASE (after the response): the investigations, critical
 *   alerts. Kept alive via @vercel/functions waitUntil on Vercel; Render's
 *   long-lived Node process keeps the promise running on its own.
 *
 * Auth: CRON_SECRET (header X-Cron-Secret OR Authorization: Bearer — Vercel
 * Cron's native form — OR ?secret=). 503 if unset.
 */

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { listDueSchedules, markScheduleRun } from '@/ai/persistence';
import { runDueSchedules } from './background';
export const dynamic = 'force-dynamic';
// The fast phase is seconds; the background work is what can take minutes.
// Capped at 60s to fit the Vercel Hobby function limit; Render ignores this.
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

  let due: any[] = [];
  try {
    due = await listDueSchedules();
  } catch (e: any) {
    // The AI tables come from migration 030 (ai_investigation_schedules,
    // ai_investigations, ...). If 030 has not been run on the live DB the
    // first query throws (PGRST205 "Could not find the table") and the cron
    // 500s on every tick. Degrade gracefully with an actionable message.
    const msg = e?.message || String(e);
    console.error('[cron/ai-investigations] listDueSchedules failed:', msg);
    return NextResponse.json(
      {
        success: false,
        error: 'ai_investigation_schedules unavailable — run migration 030 (ai_intelligence_engine) in the Supabase SQL Editor.',
        detail: msg,
      },
      { status: 503 },
    );
  }

  if (due.length === 0) {
    return NextResponse.json({
      success: true,
      data: { schedules_run: 0, total_critical: 0, total_alerts: 0, results: [] },
    });
  }

  // MARK-FIRST: advance every due schedule BEFORE starting any work. A dual
  // AI investigation outlives every external pinger's timeout (cron-job.org
  // cuts at 30s), so the old order (run -> then advance) meant a run that
  // outlived the request retried on every tick forever.
  for (const schedule of due) {
    await markScheduleRun(schedule.id, computeNextFromSchedule(schedule)).catch((e) =>
      console.warn('[cron/ai-investigations] failed to advance schedule', schedule.name, e),
    );
  }

  // Background phase: after the 202, the client is done. waitUntil keeps the
  // work alive on Vercel; Render's long-lived process keeps it running anyway.
  waitUntil(runDueSchedules(due));

  return NextResponse.json(
    {
      success: true,
      data: {
        accepted: true,
        schedules_queued: due.map((s) => ({ name: s.name, scope: s.scope })),
        note: 'Investigations run in the background; results land in ai_investigations and the AI Intelligence dashboard.',
      },
    },
    { status: 202 },
  );
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
