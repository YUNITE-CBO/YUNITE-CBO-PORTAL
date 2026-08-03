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
    
    const { member_id, campaign_id, amount, description, reference_number, payment_method } = body;

    if (!member_id || !amount) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: member_id, amount' },
        { status: 400 }
      );
    }

    // Map campaign_id to transaction_type
    // This maps the campaign UUID to one of the contribution transaction types
    const transactionTypeMap: Record<string, string> = {
      'monthly': 'contribution_monthly',
      'special': 'contribution_special',
      'development': 'contribution_development',
    };
    
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

    // Get or create the member's contributions account
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('member_id', member_id)
      .eq('account_type', 'contributions')
      .single();

    let accountId;
    
    if (account) {
      accountId = account.id;
    } else {
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
        metadata: { 
          payment_method: payment_method || 'cash',
          campaign_id: campaign_id || null,
        },
      })
      .select()
      .single();

    if (error) throw error;

    // Update the campaign's collected_amount if campaign_id is provided
    if (campaign_id) {
      // Calculate total collected for this campaign
      const { data: txns } = await supabase
        .from('transactions')
        .select('amount')
        .in('transaction_type', ['contribution_monthly', 'contribution_special', 'contribution_development']);
      
      // Get all transactions and calculate totals by mapping transaction types to campaigns
      const totals: Record<string, number> = {
        'contribution_monthly': 0,
        'contribution_special': 0,
        'contribution_development': 0,
      };
      
      txns?.forEach(t => {
        const type = t.transaction_type;
        if (totals[type] !== undefined) {
          totals[type] += parseFloat(t.amount) || 0;
        }
      });

      // Get all campaigns and update their collected amounts
      const { data: allCampaigns } = await supabase
        .from('campaigns')
        .select('id, campaign_name');
      
      allCampaigns?.forEach(async (camp) => {
        let collected = 0;
        const name = camp.campaign_name.toLowerCase();
        if (name.includes('monthly')) collected = totals['contribution_monthly'];
        else if (name.includes('special')) collected = totals['contribution_special'];
        else if (name.includes('development')) collected = totals['contribution_development'];
        
        await supabase
          .from('campaigns')
          .update({ 
            collected_amount: collected,
            contribution_count: txns?.filter(t => {
              const name = camp.campaign_name.toLowerCase();
              if (name.includes('monthly')) return t.transaction_type === 'contribution_monthly';
              if (name.includes('special')) return t.transaction_type === 'contribution_special';
              if (name.includes('development')) return t.transaction_type === 'contribution_development';
              return false;
            }).length || 0
          })
          .eq('id', camp.id);
      });
    }

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
