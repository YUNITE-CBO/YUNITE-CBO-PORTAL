/**
 * Next.js instrumentation hook — runs once on server startup.
 *
 * Logs the backend startup so observability can track cold starts.
 * Also registers a process shutdown handler.
 *
 * This does NOT block server startup — it only logs. The /health endpoint
 * becomes available immediately after the Next.js server process starts
 * listening, independent of any external dependency (req. #2).
 */

export async function register() {
  const { lifecycleLogger } = await import('./src/lib/logging/lifecycle-logger');
  lifecycleLogger.startup();

  // Best-effort shutdown log. process.on('SIGTERM') fires on Render spin-down.
  process.on('SIGTERM', () => {
    lifecycleLogger.shutdown();
  });
}
