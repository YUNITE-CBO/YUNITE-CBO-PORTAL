import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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
];

// Protected paths (require authentication)
const protectedPaths = [
  '/api/auth/session',
  '/api/admin',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
