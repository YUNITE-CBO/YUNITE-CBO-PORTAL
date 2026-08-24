/**
 * Background phase of the AI-investigations cron tick.
 *
 * Kept in a sibling module (not route.ts) because Next.js route files may
 * only export HTTP handlers and route config — the awaitBackgroundWork test
 * hook cannot live there without breaking `next build`.
 */

import { runInvestigation } from '@/ai';
import { alertCriticalFindings } from '@/ai/alerting.service';

let tickInFlight: Promise<void> | null = null;

/** Test hook: resolves when the current background tick settles. */
export function awaitBackgroundWork(): Promise<void> {
  return tickInFlight ?? Promise.resolve();
}

export async function runDueSchedules(due: any[]): Promise<void> {
  // A warm long-lived instance can receive the next tick while the previous
  // background run is still going; skip rather than double-run the schedules.
  if (tickInFlight) {
    console.warn('[cron/ai-investigations] previous background tick still running; skipping overlap');
    return;
  }
  const work = (async () => {
    for (const schedule of due) {
      try {
        const result = await runInvestigation(schedule.scope, undefined, undefined, 'cron');
        const criticals = result.findings.filter((f) => f.severity === 'critical').length;
        if (criticals > 0) {
          await alertCriticalFindings(result.investigation_id, result.findings).catch(() => undefined);
        }
        console.log(
          `[cron/ai-investigations] ${schedule.name}: investigation ${result.investigation_id} ai_status=${result.ai_status} score=${result.overall_score} criticals=${criticals}`,
        );
      } catch (error: any) {
        console.error(`[cron/ai-investigations] schedule ${schedule.name} failed:`, error);
      }
    }
  })();
  tickInFlight = work;
  try {
    await work;
  } finally {
    tickInFlight = null;
  }
}
