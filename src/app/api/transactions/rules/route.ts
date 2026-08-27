import { NextRequest, NextResponse } from 'next/server';
import { transactionsMeta } from '@/lib/services';
export const dynamic = 'force-dynamic';

/**
 * GET /api/transactions/rules
 *
 * Returns the authoritative Transaction Rules Engine metadata: categories,
 * sub-types, ledgers, and the valid (category, sub-type) → ledger rules.
 * The UI consumes this to drive the dynamic form; the backend enforces the
 * same rules on every POST. session-authenticated `transactions.read`.
 */
export async function GET(request: NextRequest) {
  try {
    const { requirePermission } = await import('@/lib/auth/authorization');
    const auth = await requirePermission(request, 'transactions', 'read');
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Access denied' },
        { status: auth.status || 403 }
      );
    }

    return NextResponse.json({ success: true, data: transactionsMeta });
  } catch (error) {
    console.error('Error loading transaction rules:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load transaction rules' },
      { status: 500 }
    );
  }
}