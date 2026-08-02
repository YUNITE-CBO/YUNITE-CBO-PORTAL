import { NextRequest, NextResponse } from 'next/server';
import { transactionEngine } from '@/lib/services';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const paymentSchema = z.object({
  fine_id: z.string().uuid(),
  amount: z.number().positive(),
});

// POST /api/fines/pay - Pay a fine
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = paymentSchema.parse(body);

    const supabase = await createServiceClient();
    const userId = body.user_id || '00000000-0000-0000-0000-000000000000';

    // Get fine
    const { data: fine } = await supabase
      .from('fines')
      .select('*')
      .eq('id', validated.fine_id)
      .single();

    if (!fine) {
      return NextResponse.json(
        { success: false, error: 'Fine not found' },
        { status: 404 }
      );
    }

    // Calculate remaining
    const remaining = Number(fine.amount) - Number(fine.amount_paid);

    if (validated.amount > remaining) {
      return NextResponse.json(
        { success: false, error: `Amount exceeds remaining fine balance of ${remaining}` },
        { status: 400 }
      );
    }

    // Create payment transaction
    const result = await transactionEngine.execute({
      member_id: fine.member_id,
      account_type: 'fines',
      transaction_type: 'fine_payment',
      amount: validated.amount,
      description: `Fine payment: ${fine.fine_number}`,
      user_id: userId,
      metadata: { fine_id: fine.id, fine_number: fine.fine_number },
    });

    // Update fine record
    const newAmountPaid = Number(fine.amount_paid) + validated.amount;
    const newStatus = newAmountPaid >= fine.amount ? 'paid' : 'partial';

    await supabase
      .from('fines')
      .update({
        amount_paid: newAmountPaid,
        status: newStatus,
        paid_date: newStatus === 'paid' ? new Date().toISOString() : null,
      })
      .eq('id', fine.id);

    // Audit
    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      action: 'fines.payment',
      record_id: fine.id,
      user_id: userId,
      after_value: { amount: validated.amount, total_paid: newAmountPaid },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Fine payment processed',
      data: {
        payment: result.transaction,
        balances: result.balances,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Payment failed';
    console.error('Fine payment error:', error);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
