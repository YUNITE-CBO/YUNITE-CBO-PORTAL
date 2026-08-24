/**
 * Server startup hook (runs once per server instance, not at build time).
 * Validates security-critical env vars so a misconfigured deployment fails
 * fast at boot instead of throwing request-time 500s.
 */
export function register() {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'SUPABASE_JWT_SECRET must be configured with at least 32 characters. ' +
        'Refusing to start: authentication would fail closed on every request.'
    );
  }
}
