/**
 * GET /api/member/statement — member statement of account.
 *
 * GAP: the backend `GET /api/v1/members/{id}/statement` currently returns a
 * 500 on the live database. This route surfaces that as a clear "not
 * available right now" message instead of fabricating a statement. When the
 * backend statement endpoint is fixed, this lights up automatically.
 *
 * The backend remains the source of truth — balances here come from
 * `/balances` (which works) and the transactions ledger.
 */
import { NextResponse } from 'next/server';
import { requireMember } from '../_guard';
import { getMemberBalances, getTransactions } from '@/lib/api/member.service';
import { YuniteApiError } from '@/lib/api/client';

export async function GET(request: Request) {
  const guard = await requireMember(request);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const periodStart = searchParams.get('period_start') || undefined;
  const periodEnd = searchParams.get('period_end') || undefined;

  try {
    // Try the authoritative backend statement first.
    const { apiGet } = await import('@/lib/api/client');
    const statement = await apiGet<unknown>(`/api/v1/members/${guard.memberId}/statement`, {
      type: 'savings',
      period_start: periodStart,
      period_end: periodEnd,
    });
    return NextResponse.json({ success: true, data: statement, available: true });
  } catch (e) {
    if (e instanceof YuniteApiError && e.status >= 500) {
      // Backend statement generation is currently broken — degrade gracefully.
      const [balances, transactions] = await Promise.all([
        getMemberBalances(guard.memberId),
        getTransactions(guard.memberId, { limit: 200 }),
      ]);
      return NextResponse.json({
        success: true,
        available: false,
        data: {
          balances: balances.balances,
          transactions,
          note: 'The official YUNITE statement service is temporarily unavailable. Your balances and recent transactions below are accurate in the meantime.',
        },
      });
    }
    const message = e instanceof Error ? e.message : 'Unable to load your statement right now.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
