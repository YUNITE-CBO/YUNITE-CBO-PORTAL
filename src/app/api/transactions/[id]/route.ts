import { NextRequest, NextResponse } from 'next/server';
import { transactionEngine } from '@/lib/services';

// POST /api/transactions/[id]/reverse - Reverse a transaction
//
// NOTE: the dedicated POST /api/transactions/reverse route is the preferred
// reversal path (it resolves the actor from the verified session). This route
// is kept for backward compatibility but now ALSO derives the actor from the
// verified session (never from the body), closes the spoofable user_id gap.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { requirePermission } = await import('@/lib/auth/authorization');
    const auth = await requirePermission(request, 'transactions', 'reverse');
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Access denied' },
        { status: auth.status || 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const reason = (body.reason as string | undefined)?.trim?.() || 'Manual reversal';
    if (!body.reason || reason.length < 3) {
      return NextResponse.json(
        { success: false, error: 'Reason required for reversal (min 3 characters)' },
        { status: 400 }
      );
    }

    const result = await transactionEngine.reverse(id, auth.user.user_id, reason);

    return NextResponse.json({
      success: true,
      message: 'Transaction reversed successfully',
      data: result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Reversal failed';
    console.error('Reversal error:', error);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// GET /api/transactions/[id] - Get single transaction
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { requirePermission } = await import('@/lib/auth/authorization');
    const auth = await requirePermission(request, 'transactions', 'read');
    if (!auth.success) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Access denied' },
        { status: auth.status || 403 }
      );
    }

    const { id } = await params;
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    const { data: transaction } = await supabase
      .from('transactions')
      .select(`
        *,
        member:members(first_name, last_name, member_number, status),
        account:accounts(account_type)
      `)
      .eq('id', id)
      .single();

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Enrich the row with controlled-dimension labels via the rules engine.
    const rules = await import('@/lib/services/transactions/transaction-rules');
    const derived = rules.deriveFromLegacy(transaction.transaction_type);
    return NextResponse.json({
      success: true,
      data: {
        ...transaction,
        txn_category: transaction.txn_category ?? derived.category,
        txn_subtype: transaction.txn_subtype ?? derived.subType,
        ledger: transaction.ledger ?? derived.ledger,
        categoryLabel: transaction.txn_category ? rules.categoryLabel(transaction.txn_category) : rules.categoryLabel(derived.category),
        subTypeLabel: transaction.txn_subtype ? rules.subTypeLabel(transaction.txn_subtype) : rules.subTypeLabel(derived.subType),
        ledgerLabel: transaction.ledger ? rules.ledgerLabel(transaction.ledger) : rules.ledgerLabel(derived.ledger),
      },
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transaction' },
      { status: 500 }
    );
  }
}
