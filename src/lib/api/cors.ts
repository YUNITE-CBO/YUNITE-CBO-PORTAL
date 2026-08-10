/**
 * YUNITE API — CORS support
 *
 * Cross-origin access for the /api/v1 gateway, controlled by the
 * `YUNITE_API_CORS_ORIGINS` env var (comma-separated allowlist of exact
 * origins, e.g. "https://app.vercel.app,https://portal.yunite.org").
 *
 * Security model:
 *  - Default (env unset/empty): NO CORS headers are emitted. The gateway is
 *    reachable only from the same origin, so it stays locked down.
 *  - Explicit allowlist: the request `Origin` is matched exactly; on a hit the
 *    origin is reflected and `Access-Control-Allow-Credentials: true` is set so
 *    both the portal session cookie and Bearer API keys work cross-origin.
 *  - Wildcard: setting the env to a single `*` enables `Access-Control-Allow-
 *    Origin: *` WITHOUT credentials (browsers forbid `*` with credentials). This
 *    suits API-key-only integrations (Authorization header, no cookie).
 *
 * Preflight (OPTIONS) is answered by the middleware so every route benefits
 * without each route file having to declare an OPTIONS handler.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Authorization, Content-Type, X-Request-Id';
const EXPOSED_HEADERS = 'X-Request-Id';
const PREFLIGHT_MAX_AGE = 86400;

function readAllowedOrigins(): string[] {
  const raw = process.env.YUNITE_API_CORS_ORIGINS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Resolve the CORS origin policy for a request.
 * Returns the value for `Access-Control-Allow-Origin` and whether credentials
 * are allowed, or null when cross-origin access is not permitted.
 */
function resolveOrigin(
  requestOrigin: string | null,
  allowed: string[]
): { origin: string; credentials: boolean } | null {
  if (allowed.length === 0) return null;

  // Wildcard mode: any origin, but no credentials (browser restriction).
  if (allowed.length === 1 && allowed[0] === '*') {
    return { origin: '*', credentials: false };
  }

  // Exact-match allowlist. Reflect the specific origin and allow credentials.
  if (requestOrigin && allowed.includes(requestOrigin)) {
    return { origin: requestOrigin, credentials: true };
  }
  return null;
}

/** Attach CORS headers to an existing response (used for actual responses). */
export function applyCorsHeaders(response: NextResponse, request: NextRequest): NextResponse {
  const policy = resolveOrigin(request.headers.get('origin'), readAllowedOrigins());
  if (!policy) return response;

  response.headers.set('Access-Control-Allow-Origin', policy.origin);
  // Only emit the credentials header when enabling credentials. In wildcard
  // mode (credentials: false) omitting it entirely is cleanest; a literal
  // "false" is also valid but unnecessary.
  if (policy.credentials) {
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  response.headers.set('Access-Control-Expose-Headers', EXPOSED_HEADERS);
  // Vary so caches don't serve an origin-specific response to a different origin.
  const vary = response.headers.get('vary');
  response.headers.set('Vary', vary ? `${vary}, Origin` : 'Origin');
  return response;
}

/**
 * Build a CORS preflight (OPTIONS) response, or null when cross-origin access
 * is not permitted (so the caller can fall back to the default 405/no-content).
 */
export function corsPreflightResponse(request: NextRequest): NextResponse | null {
  const policy = resolveOrigin(request.headers.get('origin'), readAllowedOrigins());
  if (!policy) return null;

  const res = new NextResponse(null, { status: 204 });
  res.headers.set('Access-Control-Allow-Origin', policy.origin);
  if (policy.credentials) {
    res.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  res.headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  res.headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  res.headers.set('Access-Control-Max-Age', String(PREFLIGHT_MAX_AGE));
  res.headers.set('Vary', 'Origin');
  return res;
}
