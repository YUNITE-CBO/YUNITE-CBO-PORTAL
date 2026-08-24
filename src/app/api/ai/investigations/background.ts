/**
 * Background-phase runner for POST /api/ai/investigations.
 *
 * Lives in its own module (NOT route.ts) because Next.js 14's production
 * type-checker rejects non-standard exports from a route file — the
 * `_awaitBackgroundWork` test hook below previously failed the Vercel build
 * with: '"_awaitBackgroundWork" is not a valid Route export field.'
 *
 * A manual dashboard investigation awaits the full run (deterministic engines
 * + up to two AI provider generations + comparison). On Vercel Hobby the
 * function is killed at maxDuration (60s) and the client receives Vercel's
 * plain-text/HTML error page instead of JSON — surfacing as
 * "Investigation failed: JSON.parse: unexpected character at line 1 column 1".
 * The route therefore acknowledges with 202 and runs the work here, after
 * the response (same pattern as /api/cron/ai-investigations).
 */

import { runInvestigation } from '@/ai';
import type { RunInvestigationOptions } from '@/ai/investigation.engine';

let runInFlight: Promise<void> | null = null;

/** Test hook: resolves when the current background run settles. */
export function _awaitBackgroundWork(): Promise<void> {
  return runInFlight ?? Promise.resolve();
}

export function startInvestigation(opts: RunInvestigationOptions): void {
  // A warm long-lived instance can receive a second click while the previous
  // run is still going; skip rather than double-run.
  if (runInFlight) {
    console.warn('[ai/investigations] previous background run still in flight; skipping overlap');
    return;
  }
  const work = (async () => {
    try {
      const result = await runInvestigation(opts);
      console.log(
        `[ai/investigations] ${result.investigation_number}: scope=${result.scope} ai_status=${result.ai_status} score=${result.overall_score} findings=${result.findings.length}`,
      );
    } catch (error: any) {
      // runInvestigation already persists a partial investigation on internal
      // failure; a throw here means something truly unexpected. Log it — the
      // dashboard will show the investigation row as stuck/partial, which is
      // far more diagnosable than the old opaque JSON.parse error.
      console.error('[ai/investigations] background run failed:', error?.message || error);
    }
  })();
  runInFlight = work;
  work.finally(() => {
    runInFlight = null;
  }).catch(() => undefined);
}
