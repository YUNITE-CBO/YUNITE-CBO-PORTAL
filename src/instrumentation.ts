/**
 * Next.js instrumentation hook — runs once on server startup (register()).
 *
 * Two jobs:
 *  1. FAIL FAST on missing/misconfigured security env vars, so a misconfigured
 *     deployment dies at boot instead of throwing request-time 500s.
 *  2. Log backend startup/shutdown so observability can track cold starts and
 *     Render spin-downs. This does NOT block server startup — it only logs.
 *
 * Next.js resolves the instrumentation hook from `src/` (per project layout).
 * The legacy root `instrumentation.ts` is deleted to avoid the duplicate file
 * confusing the resolver (root was being silently shadowed). This is the single
 * source of truth for both startup concerns.
 */

export async function register() {
  // 1. Security validation — fail closed at boot, not per-request.
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'SUPABASE_JWT_SECRET must be configured with at least 32 characters. ' +
        'Refusing to start: authentication would fail closed on every request.'
    );
  }

  // 2. Operational lifecycle logging.
  const { lifecycleLogger } = await import('./lib/logging/lifecycle-logger');
  lifecycleLogger.startup();

  // Best-effort shutdown log. process.on('SIGTERM') fires on Render spin-down.
  process.on('SIGTERM', () => {
    lifecycleLogger.shutdown();
  });
}