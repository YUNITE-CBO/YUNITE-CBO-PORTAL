import { NextRequest, NextResponse } from 'next/server';
import { automationRunner } from '@/lib/services/automation/runner.service';
export const dynamic = 'force-dynamic';
// Long-running tick (email queue + schedules + statements + forecast).
// Honored on Vercel (plan-capped); ignored on Render.
export const maxDuration = 300;

/**
 * GET /api/cron/automation
 *
 * The clock that wakes the Workflow & Automation Engine. Poked every few
 * minutes by a Render cron service (see render.yaml). Each tick runs:
 *   - email_queue flush (retry pending emails)
 *   - due notification schedules (the previously-silent processDueSchedules)
 *   - member financial obligations reminders (overdue + due-today)
 *   - weekly/monthly statement cadence
 * All gated by the `workflow.*` settings toggles, all logged to
 * `automation_runs`.
 *
 * Authentication: this endpoint is callable without a session cookie (Render
 * cron cannot carry one). It is protected by a shared secret instead. Three
 * accepted forms:
 *   - Header:  X-Cron-Secret: <CRON_SECRET>
 *   - Header:  Authorization: Bearer <CRON_SECRET>  (Vercel Cron's native form)
 *   - Query:   ?secret=<CRON_SECRET>
 *
 * If CRON_SECRET is unset in the environment, the endpoint refuses to run
 * (returns 503) so it can never be invoked unauthenticated by accident.
 */
function readCronSecret(request: NextRequest): string | null {
  const bearer = request.headers.get('authorization');
  return (
    request.headers.get('x-cron-secret') ||
    (bearer?.startsWith('Bearer ') ? bearer.slice(7) : null) ||
    request.nextUrl.searchParams.get('secret')
  );
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET is not configured; automation cron is disabled.' },
      { status: 503 }
    );
  }

  const provided = readCronSecret(request);
  if (provided !== expected) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await automationRunner.tick('cron');
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        server_time_ms: Date.now() - startedAt,
      },
    });
  } catch (error: any) {
    console.error('[cron/automation] tick failed:', error);
    return NextResponse.json(
      { success: false, error: 'Automation tick failed', message: error?.message || String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/automation
 *
 * Same as GET but allows manual triggering from the admin UI / curl with a
 * JSON body { secret } or the X-Cron-Secret header. Useful for testing.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET is not configured; automation cron is disabled.' },
      { status: 503 }
    );
  }

  let provided: string | null = readCronSecret(request);
  if (!provided) {
    try {
      const body = await request.json();
      provided = body?.secret || null;
    } catch {
      provided = null;
    }
  }
  if (provided !== expected) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await automationRunner.tick('manual');
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[cron/automation] manual tick failed:', error);
    return NextResponse.json(
      { success: false, error: 'Automation tick failed', message: error?.message || String(error) },
      { status: 500 }
    );
  }
}
