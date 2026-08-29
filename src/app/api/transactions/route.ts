import { NextRequest, NextResponse } from 'next/server';
import { transactionEngine, transactionPostingService } from '@/lib/services';
import { requirePermission, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { z } from 'zod';
export const dynamic = 'force-dynamic';

/**
 * POST /api/transactions — controlled financial transaction posting.
 *
 * The client now sends the THREE controlled dimensions (category, sub_type,
 * ledger) plus amount / payment / reference / date. The Transaction Rules
 * Engine is the single source of truth: invalid (category, sub-type, ledger)
 * combinations are REJECTED here even if the UI is bypassed (spec §6). The
 * legacy engine still performs the authoritative ledger movement + balance
 * snapshots; the new controlled columns are written alongside.
 *
 * Legacy free-form postings (old field names) are still accepted and mapped
 * via TRANSACTION_TYPE_MAP for backward compatibility — but only down the
 * legacy path, never combining a new category with an invalid ledger.
 */
const LEGACY_TYPE_MAP: Record<string, string> = {
  deposit: 'savings_deposit',
  withdrawal: 'savings_withdrawal',
  adjustment: 'savings_adjustment',
  contribution: 'contribution_monthly',
  contribution_monthly: 'contribution_monthly',
  contribution_special: 'contribution_special',
  contribution_development: 'contribution_development',
  welfare_deposit: 'welfare_deposit',
  welfare_disbursement: 'welfare_disbursement',
  fine: 'fine_payment',
  fine_payment: 'fine_payment',
  loan_repayment: 'loan_repayment',
  share_purchase: 'savings_adjustment',
  transfer: 'savings_adjustment',
  fee: 'fine_payment',
};

const transactionSchema = z.object({
  // member_id is optional: org-level transactions (is_org: true) are anchored
  // to the organization's designated member server-side.
  member_id: z.string().uuid().optional(),
  is_org: z.boolean().optional(),
  // New controlled-posting field names:
  category: z.string().optional(),
  sub_type: z.string().optional(),
  ledger: z.string().optional(),
  // Legacy field names (backward compatible):
  account_type: z.enum(['savings', 'shares', 'contributions', 'welfare', 'fines']).optional(),
  transaction_type: z.string().optional(),
  // Common:
  amount: z.number().positive(),
  description: z.string().optional(),
  reference_number: z.string().optional(),
  payment_method: z.string().optional(),
  transaction_date: z.string().optional(),
  confirm_duplicate: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// GET /api/transactions - Get transaction history
export async function GET(request: NextRequest) {
  try {
    // Require authentication for all transaction reads
    const authResult = await requirePermission(request, 'transactions', 'read');
    if (!authResult.success) {
      return authResult.status === 401 
        ? unauthorizedResponse(authResult.error)
        : forbiddenResponse(authResult.error);
    }

    const searchParams = request.nextUrl.searchParams;
    const memberId = searchParams.get('member_id');

    // New controlled-posting filters (spec §12): category, sub-type, ledger,
    // payment method, status, reference, posted-by, search, date range.
    const result = await transactionPostingService.listTransactions({
      member_id: memberId || undefined,
      category: searchParams.get('category') || undefined,
      sub_type: searchParams.get('sub_type') || undefined,
      ledger: searchParams.get('ledger') || undefined,
      payment_method: searchParams.get('payment_method') || undefined,
      status: searchParams.get('status') || undefined,
      reference_number: searchParams.get('reference_number') || undefined,
      search: searchParams.get('search') || undefined,
      start_date: searchParams.get('start_date') || undefined,
      end_date: searchParams.get('end_date') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '25'),
    });

    return NextResponse.json({
      success: true,
      data: result.transactions,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}

// POST /api/transactions - Execute transaction
export async function POST(request: NextRequest) {
  try {
    // Require permission to create transactions
    const authResult = await requirePermission(request, 'transactions', 'create');
    if (!authResult.success) {
      return authResult.status === 401 
        ? unauthorizedResponse(authResult.error)
        : forbiddenResponse(authResult.error);
    }

    const body = await request.json();
    const validated = transactionSchema.parse(body);

    // Use the authenticated user's ID.
    const userId = authResult.user!.user_id;

    const isControlled = !!(validated.category && validated.sub_type && validated.ledger);

    // --- Controlled posting path (new) --------------------------------------
    if (isControlled) {
      const result = await transactionPostingService.post({
        member_id: validated.member_id,
        is_org: validated.is_org,
        category: validated.category!,
        sub_type: validated.sub_type!,
        ledger: validated.ledger!,
        amount: validated.amount,
        payment_method: validated.payment_method,
        reference_number: validated.reference_number,
        transaction_date: validated.transaction_date,
        description: validated.description,
        confirm_duplicate: validated.confirm_duplicate,
        metadata: { user_id: userId, ...(validated.metadata ?? {}) },
      });

      if (!result.ok) {
        // Possible-duplicate: ask the caller to confirm (409).
        if (result.warning) {
          return NextResponse.json(
            { success: false, warning: result.warning },
            { status: 409 }
          );
        }
        // Invalid combination — reject with the rule-engine explanation (422).
        const status = result.validation ? 422 : 400;
        return NextResponse.json(
          { success: false, error: result.error || 'Transaction rejected', validation: result.validation },
          { status }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Transaction posted successfully',
        data: result,
      }, { status: 201 });
    }

    // --- Legacy free-form path (backward compatibility) ----------------------
    const internalTransactionType = validated.transaction_type
      ? LEGACY_TYPE_MAP[validated.transaction_type]
      : undefined;
    if (!internalTransactionType) {
      return NextResponse.json(
        { success: false, error: 'Invalid transaction type. Use the controlled workflow (category, sub_type, ledger) or a valid legacy type.' },
        { status: 400 }
      );
    }
    if (!validated.account_type) {
      return NextResponse.json(
        { success: false, error: 'account_type is required for legacy posting' },
        { status: 400 }
      );
    }
    // Legacy free-form posting targets a specific member's account, so a
    // member must always be supplied on this path.
    if (!validated.member_id) {
      return NextResponse.json(
        { success: false, error: 'member_id is required for legacy posting' },
        { status: 400 }
      );
    }

    const result = await transactionEngine.execute({
      member_id: validated.member_id,
      account_type: validated.account_type,
      transaction_type: internalTransactionType as 'savings_deposit' | 'savings_withdrawal' | 'savings_adjustment' | 'contribution_monthly' | 'contribution_special' | 'contribution_development' | 'welfare_deposit' | 'welfare_disbursement' | 'fine_payment' | 'loan_repayment' | 'reversal',
      amount: validated.amount,
      description: validated.description,
      reference_number: validated.reference_number,
      metadata: { user_id: userId, ...(validated.metadata ?? {}) },
      user_id: userId,
    });

    return NextResponse.json({
      success: true,
      message: 'Transaction completed successfully',
      data: result,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Transaction failed';
    console.error('Transaction error:', error);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// DELETE /api/transactions - Delete a transaction
export async function DELETE(request: NextRequest) {
  try {
    // Require permission to reverse/delete transactions
    const authResult = await requirePermission(request, 'transactions', 'delete');
    if (!authResult.success) {
      return authResult.status === 401 
        ? unauthorizedResponse(authResult.error)
        : forbiddenResponse(authResult.error);
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = await createServiceClient();

    // Mark transaction as reversed instead of deleting
    const { error } = await supabase
      .from('transactions')
      .update({ 
        reversed: true,
        reversed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'Transaction deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete transaction' },
      { status: 500 }
    );
  }
}
