import { NextRequest, NextResponse } from 'next/server';
import { transactionPostingService, validateRule, isCategoryCode, isSubTypeCode, isLedgerCode, effectFor, getLedger } from '@/lib/services';
export const dynamic = 'force-dynamic';

/**
 * POST /api/transactions/preview
 *
 * Validates a (category, sub-type, ledger) combination and returns the
 * deterministic financial effect WITHOUT posting anything. The UI calls this
 * on the review step and in the financial-effect panel.
 */
export async function POST(request: NextRequest) {
  try {
    const { requirePermission } = await import('@/lib/auth/authorization');
    const auth = await requirePermission(request, 'transactions', 'create');
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Access denied' },
        { status: auth.status || 403 }
      );
    }

    const body = await request.json();
    const category = String(body.category ?? '');
    const subType = String(body.sub_type ?? '');
    const ledger = String(body.ledger ?? '');

    if (!isCategoryCode(category)) {
      return NextResponse.json({ success: false, error: `Invalid category: ${category}` }, { status: 400 });
    }
    if (!isSubTypeCode(subType)) {
      return NextResponse.json({ success: false, error: `Invalid sub-type: ${subType}` }, { status: 400 });
    }
    if (!isLedgerCode(ledger)) {
      return NextResponse.json({ success: false, error: `Invalid ledger: ${ledger}` }, { status: 400 });
    }

    const check = validateRule(category as never, subType as never, ledger as never);
    if (!check.valid) {
      return NextResponse.json({
        success: false,
        error: `TRANSACTION REJECTED — ${check.message}`,
        validation: { expectedLedger: check.expectedLedger, message: check.message },
      }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      data: {
        category,
        sub_type: subType,
        ledger,
        ledgerLabel: getLedger(ledger as never)?.label ?? ledger,
        effect: effectFor(ledger as never),
      },
    });
  } catch (error) {
    console.error('Transaction preview error:', error);
    return NextResponse.json({ success: false, error: 'Preview failed' }, { status: 500 });
  }
}