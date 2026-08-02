import { NextRequest, NextResponse } from 'next/server';
import { transactionService } from '@/lib/services';
import { z } from 'zod';

const transactionSchema = z.object({
  member_id: z.string().uuid(),
  account_type: z.enum(['savings', 'shares', 'contributions', 'welfare', 'fines']),
  transaction_type: z.enum([
    'deposit', 'withdrawal', 'transfer', 'fee', 'fine',
    'loan_disbursement', 'loan_repayment', 'contribution',
    'share_purchase', 'interest', 'adjustment'
  ]),
  amount: z.number().positive(),
  description: z.string().optional(),
  reference_number: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  user_id: z.string().uuid().optional(),
});

const reversalSchema = z.object({
  transaction_id: z.string().uuid(),
  reason: z.string().min(1),
  user_id: z.string().uuid().optional(),
});

// GET /api/transactions - Get recent transactions
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const transaction_type = searchParams.get('type') as any || undefined;

    const transactions = await transactionService.getRecent({
      limit,
      transaction_type,
    });

    return NextResponse.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}

// POST /api/transactions - Post new transaction
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = transactionSchema.parse(body);

    // TODO: Get actual user_id from session
    const userId = validated.user_id || '00000000-0000-0000-0000-000000000000';

    const transaction = await transactionService.postTransaction({
      ...validated,
      user_id: userId,
    });

    return NextResponse.json({
      success: true,
      message: 'Transaction posted successfully',
      data: transaction,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Failed to post transaction';
    console.error('Error posting transaction:', error);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
