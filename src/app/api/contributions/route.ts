import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { transactionEngine } from '@/lib/services';

// GET - Fetch all contributions from transactions table
export async function GET() {
  try {
    const supabase = await createServiceClient();
    
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
        member:members (
          id,
          member_number,
          first_name,
          last_name
        )
      `)
      .in('transaction_type', ['contribution_monthly', 'contribution_special', 'contribution_development'])
      .eq('reversed', false)
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
    const supabase = await createServiceClient();
    
    const { member_id, campaign_id, amount, description, reference_number, payment_method } = body;
    const userId = body.user_id || '00000000-0000-0000-0000-000000000000';

    if (!member_id || !amount) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: member_id, amount' },
        { status: 400 }
      );
    }

    // Try to find the campaign to get its type
    let transactionType = 'contribution_monthly';
    if (campaign_id) {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('campaign_name')
        .eq('id', campaign_id)
        .single();
      
      if (campaign) {
        const name = campaign.campaign_name.toLowerCase();
        if (name.includes('monthly')) transactionType = 'contribution_monthly';
        else if (name.includes('special')) transactionType = 'contribution_special';
        else if (name.includes('development')) transactionType = 'contribution_development';
      }
    }

    // Execute through transaction engine for proper balance calculation
    const result = await transactionEngine.execute({
      member_id,
      account_type: 'contributions',
      transaction_type: transactionType as 'contribution_monthly' | 'contribution_special' | 'contribution_development',
      amount: parseFloat(amount),
      description: description || `${transactionType.replace('_', ' ')} contribution`,
      reference_number: reference_number || undefined,
      user_id: userId,
      metadata: { 
        payment_method: payment_method || 'cash',
        campaign_id: campaign_id || null,
      },
    });

    // Update the campaign's collected_amount if campaign_id is provided
    if (campaign_id) {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaign_id)
        .single();
      
      if (campaign) {
        // Calculate total for this campaign type
        const { data: txns } = await supabase
          .from('transactions')
          .select('amount')
          .eq('transaction_type', transactionType)
          .eq('reversed', false);
        
        const totalAmount = txns?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        const count = txns?.length || 0;
        
        await supabase
          .from('campaigns')
          .update({ 
            collected_amount: totalAmount,
            contribution_count: count
          })
          .eq('id', campaign_id);
      }
    }

    return NextResponse.json({
      success: true,
      data: result.transaction,
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
