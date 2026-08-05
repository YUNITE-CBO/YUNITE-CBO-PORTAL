import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transactionEngine } from '@/lib/services';

/**
 * Welfare API
 * Handles welfare deposits and disbursements
 */

// GET - Fetch all welfare transactions
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get member_id from query params
    const searchParams = request.nextUrl.searchParams;
    const memberId = searchParams.get('member_id');
    
    let query = supabase
      .from('transactions')
      .select(`
        id,
        transaction_ref,
        member_id,
        amount,
        transaction_type,
        description,
        reference_number,
        metadata,
        posted_at,
        created_at,
        member:members (
          id,
          member_number,
          first_name,
          last_name
        )
      `)
      .eq('transaction_type', 'welfare_deposit');
    
    if (memberId) {
      query = query.eq('member_id', memberId);
    }
    
    const { data, error } = await query
      .eq('reversed', false)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get totals
    const totals = await supabase
      .from('transactions')
      .select('amount')
      .eq('transaction_type', 'welfare_deposit')
      .eq('reversed', false);
    
    const totalDeposits = totals.data?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    
    // Get disbursements
    const disbursements = await supabase
      .from('transactions')
      .select('amount')
      .eq('transaction_type', 'welfare_disbursement')
      .eq('reversed', false);
    
    const totalDisbursements = disbursements.data?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

    return NextResponse.json({
      success: true,
      data: data || [],
      summary: {
        total_deposits: totalDeposits,
        total_disbursements: totalDisbursements,
        balance: totalDeposits - totalDisbursements,
      },
    });
  } catch (error) {
    console.error('Error fetching welfare transactions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch welfare transactions' },
      { status: 500 }
    );
  }
}

// POST - Record a welfare deposit or disbursement
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { member_id, amount, type, description, reference_number } = body;
    const userId = body.user_id || '00000000-0000-0000-0000-000000000000';

    if (!member_id || !amount || !type) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: member_id, amount, type' },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes = ['deposit', 'disbursement'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid type. Must be "deposit" or "disbursement"' },
        { status: 400 }
      );
    }

    const transactionType = type === 'deposit' ? 'welfare_deposit' : 'welfare_disbursement';

    // Execute through transaction engine
    const result = await transactionEngine.execute({
      member_id,
      account_type: 'welfare',
      transaction_type: transactionType as 'welfare_deposit' | 'welfare_disbursement',
      amount: parseFloat(amount),
      description: description || `${type === 'deposit' ? 'Welfare deposit' : 'Welfare disbursement'}`,
      reference_number: reference_number || undefined,
      user_id: userId,
      metadata: body.metadata || {},
    });

    return NextResponse.json({
      success: true,
      data: result.transaction,
      balances: result.balances,
      message: `${type === 'deposit' ? 'Welfare deposit' : 'Welfare disbursement'} recorded successfully`,
    }, { status: 201 });
  } catch (error) {
    console.error('Error recording welfare transaction:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to record welfare transaction';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
