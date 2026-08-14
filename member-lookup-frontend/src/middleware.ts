/**
 * Edge middleware — protects all /dashboard routes.
 * A valid signed member session cookie is required; otherwise the member is
 * redirected to the home access section. The member_id is bound in the JWT,
 * so the browser cannot impersonate another member.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export default async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.hash = 'access';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
