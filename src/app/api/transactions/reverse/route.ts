import { NextRequest, NextResponse } from 'next/server';
import { transactionEngine } from '@/lib/services';

/**
 * POST /api/transactions/reverse
 * 
 * Reverse a transaction with audit trail.
 * Financial records are never deleted, only reversed.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { transaction_id, reason } = body;

    if (!transaction_id) {
      return NextResponse.json(
        { success: false, error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    if (!reason || reason.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: 'Reversal reason is required (min 3 characters)' },
        { status: 400 }
      );
    }

    const userId = body.user_id || '00000000-0000-0000-0000-000000000000';

    const result = await transactionEngine.reverse(transaction_id, userId, reason.trim());

    return NextResponse.json({
      success: true,
      message: 'Transaction reversed successfully',
      data: {
        reversal: result.reversal,
        balances: result.balances,
      },
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
