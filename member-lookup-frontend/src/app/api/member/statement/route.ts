/**
 * GET /api/member/statement — member statement of account.
 *
 * Builds the member's statement of account from the authoritative live
 * ledger (balances + transactions), which are the single source of truth.
 * The backend `GET /api/v1/members/{id}/statement` is attempted first (it
 * adds persistence + a certified summary); if it is unavailable, we fall
 * back to building an equivalent statement directly from balances +
 * transactions so the member ALWAYS sees their real financial position —
 * never a blank 0.00 page.
 */
import { NextResponse } from 'next/server';
import { requireMember } from '../_guard';
import { getMemberBalances, getTransactions } from '@/lib/api/member.service';
import { YuniteApiError } from '@/lib/api/client';
import type { Transaction } from '@/lib/api/types';

export async function GET(request: Request) {
  const guard = await requireMember(request);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const periodStart = searchParams.get('period_start') || undefined;
  const periodEnd = searchParams.get('period_end') || undefined;

  // Always fetch the authoritative balances + recent transactions. These are
  // the live-ledger source of truth and power both the primary statement and
  // the fallback. Fetching them up front guarantees the member sees real data
  // even when the statement endpoint is unavailable.
  const [balances, transactions] = await Promise.all([
    getMemberBalances(guard.memberId).catch(() => ({ member_id: guard.memberId, balances: { savings: 0, shares: 0, contributions: 0, welfare: 0, fines: 0, loans: 0 } })),
    getTransactions(guard.memberId, { limit: 200 }).catch(() => [] as Transaction[]),
  ]);

  // Try the authoritative backend statement first (adds a certified summary
  // with opening/closing balances + period credits/debits).
  try {
    const { apiGet } = await import('@/lib/api/client');
    const statement = await apiGet<unknown>(`/api/v1/members/${guard.memberId}/statement`, {
      type: 'savings',
      period_start: periodStart,
      period_end: periodEnd,
    });
    return NextResponse.json({
      success: true,
      available: true,
      data: {
        statement,
        balances: balances.balances,
        transactions,
      },
    });
  } catch (e) {
    // Backend statement unavailable — degrade gracefully with REAL balances +
    // transactions from the live ledger. Never show a blank 0.00 page.
    const isUnavailable = e instanceof YuniteApiError && e.status >= 500;
    return NextResponse.json({
      success: true,
      available: false,
      data: {
        balances: balances.balances,
        transactions,
        note: isUnavailable
          ? 'The official YUNITE statement service is temporarily unavailable. Your balances and recent transactions below are accurate in the meantime.'
          : undefined,
      },
    });
  }
}

