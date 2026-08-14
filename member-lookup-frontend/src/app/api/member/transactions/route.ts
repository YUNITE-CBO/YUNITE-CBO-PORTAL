/** GET /api/member/transactions — unified member transaction history (optionally filtered by account type). */
import { NextResponse } from 'next/server';
import { requireMember } from '../_guard';
import { getTransactions } from '@/lib/api/member.service';

export async function GET(request: Request) {
  const guard = await requireMember(request);
  if (!guard.ok) return guard.response;
  const { searchParams } = new URL(request.url);
  const account_type = searchParams.get('account_type') || undefined;
  try {
    const data = await getTransactions(guard.memberId, { account_type });
    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unable to load transactions right now.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
