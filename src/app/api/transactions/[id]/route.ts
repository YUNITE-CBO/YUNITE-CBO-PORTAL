import { NextRequest, NextResponse } from 'next/server';
import { transactionService } from '@/lib/services';
import { z } from 'zod';

const reversalSchema = z.object({
  reason: z.string().min(1),
  user_id: z.string().uuid().optional(),
});

// POST /api/transactions/[id]/reverse - Reverse a transaction
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = reversalSchema.parse(body);

    const userId = validated.user_id || '00000000-0000-0000-0000-000000000000';

    const transaction = await transactionService.reverse({
      transaction_id: id,
      reason: validated.reason,
      user_id: userId,
    });

    return NextResponse.json({
      success: true,
      message: 'Transaction reversed successfully',
      data: transaction,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to reverse transaction';
    console.error('Error reversing transaction:', error);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
