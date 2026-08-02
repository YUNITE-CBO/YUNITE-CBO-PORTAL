import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/api/auth/login', '/api/auth/logout', '/api/members'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
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
