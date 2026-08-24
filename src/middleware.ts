import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { applyCorsHeaders, corsPreflightResponse } from '@/lib/api/cors';
import { getJwtSecret } from '@/lib/auth/jwt-secret';

// API paths that intentionally accept unauthenticated requests. All other API
// routes, including GET routes, require a valid session before reaching their handler.
const publicReadPaths = [
  '/health',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/health',
  // Public member pre-registration: prospective members submit their info
  // through /register/member. POST creates a pending submission (NO member);
  // admin list/read is gated by requirePermission inside the route handler.
  '/api/member-registration-submissions',
  // Public document authenticity verification: external parties (banks,
  // employers) holding a printed document verify it by doc_ref without a
  // session. Read-only; exposes only the audit-ledger entry for that ref.
  '/api/reports/verify',
  // The automation cron route authenticates via CRON_SECRET (header/query),
  // not a session cookie (Render cron cannot carry one). Listed here so the
  // cookie-based auth check below does not 401 it before it can verify the
  // shared secret itself.
  '/api/cron/automation',
  // AI investigation cron — same CRON_SECRET pattern (Render cron, no cookie).
  '/api/cron/ai-investigations',
];

// Protected paths (require authentication)
const protectedPaths = [
  '/api/auth/session',
  '/api/admin',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The YUNITE API gateway (/api/v1/*) performs its own complete authentication
  // (session cookie OR Bearer API key), authorization, rate limiting, and
  // request logging. Let it handle auth itself so API-key clients (which do not
  // carry a session cookie) can reach POST/PUT/DELETE endpoints. The older
  // cookie-only check below would otherwise 401 them before the gateway runs.
  //
  // CORS is applied here for every /api/v1 response (preflight + actual),
  // governed by the YUNITE_API_CORS_ORIGINS env var. With the env unset the
  // gateway stays same-origin only (no CORS headers).
  if (pathname.startsWith('/api/v1')) {
    if (request.method === 'OPTIONS') {
      return corsPreflightResponse(request) ?? NextResponse.next();
    }
    return applyCorsHeaders(NextResponse.next(), request);
  }

  // Allow public paths
  if (publicReadPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check if this is a protected path
  if (protectedPaths.some((path) => pathname.startsWith(path))) {
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    try {
      const secret = getJwtSecret();
      const { jwtVerify } = await import('jose');
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }
  }

  // Check if this is an API route
  if (pathname.startsWith('/api/')) {
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    try {
      const secret = getJwtSecret();
      const { jwtVerify } = await import('jose');
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/((?!_next/static|_next/image|favicon.ico).*)'],
};
