/**
 * POST /api/auth/verify
 *
 * Receives the three public credentials (phone, idNumber, firstName),
 * verifies them against REAL backend member data server-side, and on success
 * sets a short-lived httpOnly session cookie. The YUNITE API key is used only
 * here on the server; it is never exposed to the browser.
 *
 * The browser only ever POSTs the three fields and receives success/failure.
 * No financial data is returned, and failure reveals nothing about which
 * field was wrong.
 */

import { NextResponse } from 'next/server';
import { verifyMember } from '@/lib/api/member.service';
import { createSession, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '@/lib/auth/session';

interface VerifyBody {
  phone?: string;
  idNumber?: string;
  firstName?: string;
}

export async function POST(request: Request) {
  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request. Please submit the form again.' },
      { status: 400 },
    );
  }

  const phone = (body.phone || '').trim();
  const idNumber = (body.idNumber || '').trim();
  const firstName = (body.firstName || '').trim();

  if (!phone || !idNumber || !firstName) {
    return NextResponse.json(
      { success: false, error: 'All three details are required.' },
      { status: 400 },
    );
  }

  let member;
  try {
    member = await verifyMember({ phone, idNumber, firstName });
  } catch {
    return NextResponse.json(
      { success: false, error: 'We could not verify those details right now. Please try again shortly.' },
      { status: 503 },
    );
  }

  if (!member) {
    return NextResponse.json(
      { success: false, error: 'We could not verify those details. Please check your information and try again.' },
      { status: 401 },
    );
  }

  const token = await createSession(member.id);
  const res = NextResponse.json({ success: true, redirectTo: '/dashboard' });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
