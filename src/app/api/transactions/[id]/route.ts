import { NextRequest, NextResponse } from 'next/server';
import { transactionEngine } from '@/lib/services';

// POST /api/transactions/[id]/reverse - Reverse a transaction
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const userId = body.user_id || '00000000-0000-0000-0000-000000000000';
    const reason = body.reason || 'Manual reversal';

    if (!body.reason) {
      return NextResponse.json(
        { success: false, error: 'Reason required for reversal' },
        { status: 400 }
      );
    }

    const result = await transactionEngine.reverse(id, userId, reason);

    return NextResponse.json({
      success: true,
      message: 'Transaction reversed successfully',
      data: result,
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

// GET /api/transactions/[id] - Get single transaction
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    const { data: transaction } = await supabase
      .from('transactions')
      .select(`
        *,
        member:members(first_name, last_name, member_number),
        account:accounts(account_type)
      `)
      .eq('id', id)
      .single();

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transaction' },
      { status: 500 }
    );
  }
}
