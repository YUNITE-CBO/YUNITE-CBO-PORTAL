import { NextRequest, NextResponse } from 'next/server';
import { transactionEngine, AccountType } from '@/lib/services';
import { z } from 'zod';

const transactionSchema = z.object({
  member_id: z.string().uuid(),
  account_type: z.enum(['savings', 'contributions', 'welfare', 'fines']),
  transaction_type: z.enum([
    'savings_deposit', 'savings_withdrawal', 'savings_adjustment',
    'contribution_monthly', 'contribution_special', 'contribution_development',
    'welfare_deposit', 'welfare_disbursement',
    'fine_payment'
  ]),
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

    const userId = body.user_id || '00000000-0000-0000-0000-000000000000';

    const result = await transactionEngine.execute({
      ...validated,
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
