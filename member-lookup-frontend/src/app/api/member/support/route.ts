/**
 * GET  /api/member/support — list the verified member's own support tickets.
 * POST /api/member/support — submit a new support ticket.
 *
 * The member_id comes from the signed session JWT (requireMember), NEVER from
 * the request body — a member can only ever create/list tickets for themselves.
 */
import { NextResponse } from 'next/server';
import { requireMember, withMember } from '../_guard';
import { createSupportTicket, getSupportTickets } from '@/lib/api/member.service';
import { YuniteApiError } from '@/lib/api/client';

export const dynamic = 'force-dynamic';

const CATEGORIES = ['account', 'savings', 'shares', 'contributions', 'welfare', 'loans', 'fines', 'documents', 'statement', 'other'];

export const GET = withMember(async (memberId) => {
  return getSupportTickets(memberId);
});

export async function POST(request: Request) {
  const guard = await requireMember(request);
  if (!guard.ok) return guard.response;

  let body: { category?: string; subject?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const subject = (body.subject || '').trim();
  const message = (body.message || '').trim();
  const category = CATEGORIES.includes(body.category || '') ? body.category! : 'other';

  if (subject.length < 3 || subject.length > 200) {
    return NextResponse.json({ success: false, error: 'Please give your request a subject (3–200 characters).' }, { status: 400 });
  }
  if (message.length < 10 || message.length > 5000) {
    return NextResponse.json({ success: false, error: 'Please describe your request (at least 10 characters).' }, { status: 400 });
  }

  try {
    const ticket = await createSupportTicket(guard.memberId, { category, subject, message });
    return NextResponse.json({ success: true, data: ticket }, { status: 201 });
  } catch (e: unknown) {
    const message =
      e instanceof YuniteApiError ? e.message : 'Unable to submit your request right now. Please try again shortly.';
    const status = e instanceof YuniteApiError && e.status >= 400 && e.status < 600 ? e.status : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
