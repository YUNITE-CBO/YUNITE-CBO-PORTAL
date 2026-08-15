import { NextRequest, NextResponse } from 'next/server';
import { transactionEngine } from '@/lib/services';
import { createServiceClient } from '@/lib/supabase/server';
import { requirePermission, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
export const dynamic = 'force-dynamic';

const fineSchema = z.object({
  member_id: z.string().uuid(),
  fine_type: z.enum(['late_payment', 'missing_meeting', 'non_compliance', 'documentation', 'misconduct', 'share_shortfall', 'loan_default', 'other', 'penalty', 'manual']),
  amount: z.number().positive(),
  reason: z.string().min(1),
  due_date: z.string().optional(),
});

// GET /api/fines - Get fines
export async function GET(request: NextRequest) {
  try {
    // Require authentication for fine reads
    const authResult = await requirePermission(request, 'fines', 'read');
    if (!authResult.success) {
      return authResult.status === 401 
        ? unauthorizedResponse(authResult.error)
        : forbiddenResponse(authResult.error);
    }

    const searchParams = request.nextUrl.searchParams;
    const memberId = searchParams.get('member_id');

    const supabase = await createServiceClient();

    let query = supabase.from('fines').select('*, member:members(first_name, last_name, member_number)');

    if (memberId) {
      query = query.eq('member_id', memberId);
    }

    const { data: fines } = await query.order('issued_date', { ascending: false });

    return NextResponse.json({ success: true, data: fines || [] });
  } catch (error) {
    console.error('Fines error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch fines' },
      { status: 500 }
    );
  }
}

// POST /api/fines - Issue a fine
export async function POST(request: NextRequest) {
  try {
    // Require permission to create fines
    const authResult = await requirePermission(request, 'fines', 'create');
    if (!authResult.success) {
      return authResult.status === 401 
        ? unauthorizedResponse(authResult.error)
        : forbiddenResponse(authResult.error);
    }

    const body = await request.json();
    const validated = fineSchema.parse(body);

    const supabase = await createServiceClient();
    // Use authenticated user's ID
    const userId = authResult.user!.user_id;

    // Generate fine number
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { count } = await supabase.from('fines').select('*', { count: 'exact', head: true });
    const fineNumber = `FINE-${date}-${String((count || 0) + 1).padStart(4, '0')}`;

    // Create fine record
    const { data: fine, error } = await supabase
      .from('fines')
      .insert({
        id: uuidv4(),
        fine_number: fineNumber,
        member_id: validated.member_id,
        fine_type: validated.fine_type,
        amount: validated.amount,
        amount_paid: 0,
        reason: validated.reason,
        due_date: validated.due_date,
        issued_by: userId,
        status: 'pending',
      })
      .select()
      .single();

    if (error || !fine) {
      throw new Error(`Failed to create fine: ${error?.message}`);
    }

    // Create fine posting transaction
    await transactionEngine.execute({
      member_id: validated.member_id,
      account_type: 'fines',
      transaction_type: 'fine_posting',
      amount: validated.amount,
      description: `Fine: ${validated.reason}`,
      user_id: userId,
      metadata: { fine_id: fine.id, fine_number: fineNumber },
    });

    // Audit
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: 'fines.create',
      record_id: fine.id,
      user_id: userId,
      after_value: { fine_number: fineNumber, amount: validated.amount },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Fine issued successfully',
      data: fine,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Failed to issue fine';
    console.error('Fine issue error:', error);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
