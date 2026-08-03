import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Fetch all contributions from transactions table
export async function GET() {
  try {
    const supabase = await createClient();
    
    // Fetch contributions from transactions table
    const { data, error } = await supabase
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
        members (
          id,
          member_number,
          first_name,
          last_name
        )
      `)
      .in('transaction_type', ['contribution_monthly', 'contribution_special', 'contribution_development'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('Error fetching contributions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch contributions' },
      { status: 500 }
    );
  }
}

// POST - Record a new contribution
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = await createClient();
    
    const { member_id, amount, contribution_type, description, reference_number, payment_method } = body;

    if (!member_id || !amount) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: member_id, amount' },
        { status: 400 }
      );
    }

    // Map contribution type to transaction type
    const transactionType = contribution_type || 'contribution_monthly';

    // Get or create the member's contributions account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('member_id', member_id)
      .eq('account_type', 'contributions')
      .single();

    let accountId;
    
    if (account) {
      accountId = account.id;
    } else {
      // Create the contributions account if it doesn't exist
      const { data: newAccount, error: createAccountError } = await supabase
        .from('accounts')
        .insert({ member_id, account_type: 'contributions' })
        .select('id')
        .single();
      
      if (createAccountError) throw createAccountError;
      accountId = newAccount.id;
    }

    // Generate transaction reference
    const transactionRef = `CTR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Insert the contribution as a transaction
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        transaction_ref: transactionRef,
        member_id,
        account_id: accountId,
        transaction_type: transactionType,
        amount: parseFloat(amount),
        description: description || `${transactionType.replace('_', ' ')} contribution`,
        reference_number: reference_number || null,
        metadata: { payment_method: payment_method || 'cash' },
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data,
      message: 'Contribution recorded successfully',
    });
  } catch (error) {
    console.error('Error recording contribution:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record contribution' },
      { status: 500 }
    );
  }
}
