/**
 * Shared guard for member-data BFF routes.
 * Resolves the verified member_id from the signed session cookie. The member
 * can only ever read their own records: the id is bound in the JWT, not the
 * URL. Returns a 401 response when there is no valid session so routes can
 * short-circuit.
 */

import { NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export type GuardResult =
  | { ok: true; memberId: string }
  | { ok: false; response: NextResponse };

export async function requireMember(request: Request): Promise<GuardResult> {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const [k, ...rest] = c.split('=');
        return [k, rest.join('=')];
      }),
  );
  const token = cookies[SESSION_COOKIE_NAME];
  const session = await verifySession(token);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Your session has expired. Please verify your details again.' },
        { status: 401 },
      ),
    };
  }
  return { ok: true, memberId: session.member_id };
}

/** Wrap a data handler with the member guard and friendly error normalization. */
export function withMember<T>(
  handler: (memberId: string) => Promise<T>,
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    const guard = await requireMember(request);
    if (!guard.ok) return guard.response;
    try {
      const data = await handler(guard.memberId);
      return NextResponse.json({ success: true, data });
    } catch (e: unknown) {
      const message =
        e instanceof Error && e.message ? e.message : 'Unable to load this information right now.';
      const status =
        e && typeof e === 'object' && 'status' in e && typeof e.status === 'number' ? e.status : 500;
      return NextResponse.json({ success: false, error: message }, { status: status >= 400 && status < 600 ? status : 500 });
    }
  };
}
