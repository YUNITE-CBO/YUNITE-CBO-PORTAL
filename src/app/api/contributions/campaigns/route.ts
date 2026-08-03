import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Fetch all contribution campaigns
// Note: Campaigns are stored as a new table or derived from contribution types
// For now, we'll derive campaigns from distinct transaction types and aggregate amounts
export async function GET() {
  try {
    const supabase = await createClient();
    
    // Get aggregated contribution totals by type
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        transaction_type,
        amount,
        created_at
      `)
      .in('transaction_type', ['contribution_monthly', 'contribution_special', 'contribution_development']);

    if (error) throw error;

    // Aggregate by transaction type
    const campaignMap = new Map();
    data?.forEach(txn => {
      const existing = campaignMap.get(txn.transaction_type) || {
        id: txn.transaction_type,
        campaign_name: formatCampaignName(txn.transaction_type),
        description: getCampaignDescription(txn.transaction_type),
        target_amount: getTargetAmount(txn.transaction_type),
        collected_amount: 0,
        contribution_count: 0,
        start_date: '2024-01-01',
        end_date: null,
        is_active: true,
        created_at: txn.created_at,
      };
      existing.collected_amount += parseFloat(txn.amount) || 0;
      existing.contribution_count += 1;
      campaignMap.set(txn.transaction_type, existing);
    });

    const campaigns = Array.from(campaignMap.values());

    // If no contributions yet, return default campaigns
    if (campaigns.length === 0) {
      return NextResponse.json({
        success: true,
        data: [
          {
            id: 'contribution_monthly',
            campaign_name: 'Monthly Contributions',
            description: 'Regular monthly contributions from all members',
            target_amount: 100000,
            collected_amount: 0,
            contribution_count: 0,
            start_date: new Date().toISOString().split('T')[0],
            end_date: null,
            is_active: true,
          },
          {
            id: 'contribution_special',
            campaign_name: 'Special Contributions',
            description: 'Special contribution drives for specific purposes',
            target_amount: 50000,
            collected_amount: 0,
            contribution_count: 0,
            start_date: new Date().toISOString().split('T')[0],
            end_date: null,
            is_active: true,
          },
          {
            id: 'contribution_development',
            campaign_name: 'Development Fund',
            description: 'Contributions towards organizational development',
            target_amount: 200000,
            collected_amount: 0,
            contribution_count: 0,
            start_date: new Date().toISOString().split('T')[0],
            end_date: null,
            is_active: true,
          },
        ],
      });
    }

    return NextResponse.json({
      success: true,
      data: campaigns,
    });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
}

function formatCampaignName(type: string): string {
  return type
    .replace('contribution_', '')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ') + ' Contributions';
}

function getCampaignDescription(type: string): string {
  const descriptions: Record<string, string> = {
    contribution_monthly: 'Regular monthly contributions from all members',
    contribution_special: 'Special contribution drives for specific purposes',
    contribution_development: 'Contributions towards organizational development',
  };
  return descriptions[type] || 'Contribution campaign';
}

function getTargetAmount(type: string): number {
  const targets: Record<string, number> = {
    contribution_monthly: 100000,
    contribution_special: 50000,
    contribution_development: 200000,
  };
  return targets[type] || 100000;
}

// POST - Create a new contribution (shortcut for recording contributions)
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

    // Map campaign_id to transaction type
    const transactionType = campaign_id || 'contribution_monthly';

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
