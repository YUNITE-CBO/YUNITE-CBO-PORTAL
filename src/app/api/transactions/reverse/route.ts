import { NextRequest, NextResponse } from 'next/server';
import { transactionEngine } from '@/lib/services';
import { createServiceClient } from '@/lib/supabase/server';

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

    // Get original transaction to know the member
    const supabase = await createServiceClient();
    const { data: original } = await supabase
      .from('transactions')
      .select('member_id, transaction_type, metadata')
      .eq('id', transaction_id)
      .single();

    if (!original) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Perform the reversal
    const result = await transactionEngine.reverse(transaction_id, userId, reason.trim());

    // Get updated member data with balances
    const memberBalances = result.balances;
    
    // Get updated loans data if this was a loan repayment or disbursement
    let updatedLoans = null;
    if ((original.transaction_type === 'loan_repayment' || original.transaction_type === 'loan_disbursement') && original.metadata?.loan_id) {
      const { data: loan } = await supabase
        .from('loans')
        .select('*')
        .eq('id', original.metadata.loan_id)
        .single();
      updatedLoans = loan;
    }

    // Get updated fine data if this was a fine payment
    let updatedFine = null;
    if (original.transaction_type === 'fine_payment' && original.metadata?.fine_id) {
      const { data: fine } = await supabase
        .from('fines')
        .select('*')
        .eq('id', original.metadata.fine_id)
        .single();
      updatedFine = fine;
    }

    // Get updated campaign data if this was a contribution
    let updatedCampaign = null;
    const contributionTypes = ['contribution_monthly', 'contribution_special', 'contribution_development'];
    if (contributionTypes.includes(original.transaction_type) && original.metadata?.campaign_id) {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', original.metadata.campaign_id)
        .single();
      updatedCampaign = campaign;
    }

    return NextResponse.json({
      success: true,
      message: 'Transaction reversed successfully',
      data: {
        reversal: result.reversal,
        balances: memberBalances,
        updatedLoans,
        updatedFine,
        updatedCampaign,
        transactionType: original.transaction_type,
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
