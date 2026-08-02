import { NextRequest, NextResponse } from 'next/server';
import { fineService } from '@/lib/services';
import { z } from 'zod';

const paymentSchema = z.object({
  fine_id: z.string().uuid(),
  amount: z.number().positive(),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = paymentSchema.parse(body);

    const userId = '00000000-0000-0000-0000-000000000000';

    const result = await fineService.create({
      ...validated,
      user_id: userId,
    });

    return NextResponse.json({
      success: true,
      message: 'Fine payment processed successfully',
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Failed to process payment';
    console.error('Error processing fine payment:', error);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
