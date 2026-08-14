import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { applyCorsHeaders, corsPreflightResponse } from '@/lib/api/cors';

// Public read-only API paths (dashboard frontend can access without auth)
const publicReadPaths = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/health',
  '/api/dashboard',
  '/api/members',
  '/api/members/lookup',
  '/api/transactions',
  '/api/fines',
  '/api/loans',
  '/api/contributions',
  '/api/settings',
  '/api/audit',
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
      const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET || 'secret');
      const { jwtVerify } = await import('jose');
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }
  }

  // Check if this is an API route
  if (pathname.startsWith('/api/')) {
    // GET requests are public for read operations
    if (request.method === 'GET') {
      return NextResponse.next();
    }

    // For POST/PUT/DELETE, check auth token
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    try {
      const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET || 'secret');
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
