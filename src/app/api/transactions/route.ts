import { NextRequest, NextResponse } from 'next/server';
import { transactionEngine, AccountType } from '@/lib/services';
import { z } from 'zod';

// Map simplified client transaction types to internal types
const TRANSACTION_TYPE_MAP: Record<string, string> = {
  // Savings
  deposit: 'savings_deposit',
  withdrawal: 'savings_withdrawal',
  adjustment: 'savings_adjustment',
  // Contributions
  contribution: 'contribution_monthly',
  contribution_monthly: 'contribution_monthly',
  contribution_special: 'contribution_special',
  contribution_development: 'contribution_development',
  // Welfare
  welfare_deposit: 'welfare_deposit',
  welfare_disbursement: 'welfare_disbursement',
  // Fines
  fine: 'fine_payment',
  fine_payment: 'fine_payment',
  // Loans
  loan_repayment: 'loan_repayment',
  // Shares
  share_purchase: 'savings_adjustment', // Maps to savings adjustment for simplicity
  // Transfer
  transfer: 'savings_adjustment', // Maps to savings adjustment for simplicity
  fee: 'fine_payment', // Maps to fine payment for simplicity
};

const transactionSchema = z.object({
  member_id: z.string().uuid(),
  account_type: z.enum(['savings', 'shares', 'contributions', 'welfare', 'fines']),
  transaction_type: z.string(),
  amount: z.number().positive(),
  description: z.string().optional(),
  reference_number: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// GET /api/transactions - Get transaction history
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const memberId = searchParams.get('member_id');
    
    if (!memberId) {
      return NextResponse.json({ success: false, error: 'Member ID required' }, { status: 400 });
    }

    const result = await transactionEngine.getHistory({
      member_id: memberId,
      account_type: searchParams.get('account_type') as AccountType | undefined,
      start_date: searchParams.get('start_date') || undefined,
      end_date: searchParams.get('end_date') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '50'),
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
    const body = await request.json();
    const validated = transactionSchema.parse(body);

    // Map client transaction type to internal type
    const internalTransactionType = TRANSACTION_TYPE_MAP[validated.transaction_type];
    if (!internalTransactionType) {
      return NextResponse.json(
        { success: false, error: `Invalid transaction type: ${validated.transaction_type}` },
        { status: 400 }
      );
    }

    const userId = body.user_id || '00000000-0000-0000-0000-000000000000';

    const result = await transactionEngine.execute({
      member_id: validated.member_id,
      account_type: validated.account_type,
      transaction_type: internalTransactionType as 'savings_deposit' | 'savings_withdrawal' | 'savings_adjustment' | 'contribution_monthly' | 'contribution_special' | 'contribution_development' | 'welfare_deposit' | 'welfare_disbursement' | 'fine_payment' | 'loan_repayment' | 'reversal',
      amount: validated.amount,
      description: validated.description,
      reference_number: validated.reference_number,
      metadata: validated.metadata,
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
