import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// GET - Fetch all contribution campaigns with aggregated totals
export async function GET() {
  try {
    const supabase = await createServiceClient();
    
    // Fetch campaigns
    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch all contribution transactions
    const { data: transactions } = await supabase
      .from('transactions')
      .select('transaction_type, amount')
      .in('transaction_type', ['contribution_monthly', 'contribution_special', 'contribution_development']);

    // Calculate totals by type
    const totals: Record<string, { amount: number; count: number }> = {
      'contribution_monthly': { amount: 0, count: 0 },
      'contribution_special': { amount: 0, count: 0 },
      'contribution_development': { amount: 0, count: 0 },
    };

    transactions?.forEach(t => {
      const type = t.transaction_type;
      if (totals[type]) {
        totals[type].amount += parseFloat(t.amount) || 0;
        totals[type].count += 1;
      }
    });

    // Map campaigns to their totals based on campaign name
    const campaignsWithTotals = campaigns?.map(campaign => {
      const name = campaign.campaign_name.toLowerCase();
      let transactionType = 'contribution_monthly';
      
      if (name.includes('special')) transactionType = 'contribution_special';
      else if (name.includes('development')) transactionType = 'contribution_development';
      
      return {
        ...campaign,
        collected_amount: totals[transactionType]?.amount || 0,
        contribution_count: totals[transactionType]?.count || 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: campaignsWithTotals || [],
    });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
}

// POST - Create a new campaign
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = await createServiceClient();
    
    const { campaign_name, description, target_amount, start_date, end_date } = body;

    if (!campaign_name || !start_date) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: campaign_name, start_date' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        campaign_name,
        description: description || null,
        target_amount: target_amount ? parseFloat(target_amount) : 0,
        start_date,
        end_date: end_date || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data,
      message: 'Campaign created successfully',
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create campaign' },
      { status: 500 }
    );
  }
}

// PUT - Update a campaign
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = await createServiceClient();
    
    const { id, campaign_name, description, target_amount, start_date, end_date, is_active } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Campaign ID is required' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (campaign_name !== undefined) updateData.campaign_name = campaign_name;
    if (description !== undefined) updateData.description = description;
    if (target_amount !== undefined) updateData.target_amount = parseFloat(target_amount);
    if (start_date !== undefined) updateData.start_date = start_date;
    if (end_date !== undefined) updateData.end_date = end_date;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data,
      message: 'Campaign updated successfully',
    });
  } catch (error) {
    console.error('Error updating campaign:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update campaign' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a campaign
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Campaign ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();
    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'Campaign deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete campaign' },
      { status: 500 }
    );
  }
}
