import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { transactionEngine } from '@/lib/services/transaction.engine';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServiceClient();

    // Fetch member
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('*')
      .eq('id', id)
      .single();

    if (memberError || !member) {
      return NextResponse.json({ success: false, error: 'Member not found' }, { status: 404 });
    }

    // Fetch accounts
    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .eq('member_id', id);

    // Fetch recent transactions (excluding reversals)
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('member_id', id)
      .eq('reversed', false)
      .order('created_at', { ascending: false })
      .limit(20);

    // Fetch active loans
    const { data: loans } = await supabase
      .from('loans')
      .select('*')
      .eq('member_id', id)
      .in('status', ['pending', 'approved', 'disbursed', 'active']);

    // Fetch pending/partial fines
    const { data: fines } = await supabase
      .from('fines')
      .select('*')
      .eq('member_id', id)
      .in('status', ['pending', 'partial']);

    // Calculate balances using TransactionEngine
    const balances = await transactionEngine.calculateAllBalances(id);

    // Calculate contributions from transactions
    const contributions = transactions
      ?.filter(t => t.transaction_type.startsWith('contribution_'))
      .reduce((sum, t) => sum + Number(t.amount), 0) || 0;

    return NextResponse.json({
      success: true,
      data: {
        member,
        accounts: accounts || [],
        transactions: transactions || [],
        loans: loans || [],
        fines: fines || [],
        balances: {
          ...balances,
          contributions,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching member:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch member' }, { status: 500 });
  }
}

// PUT - Update member
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServiceClient();
    const body = await request.json();

    // Check authentication using cookies
    const cookies = request.headers.get('cookie') || '';
    const { createClient: createAuthClient } = await import('@/lib/supabase/server');
    const authClient = await createAuthClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Fields that can be updated
    const allowedFields = [
      'first_name', 'last_name', 'email', 'phone', 'id_number',
      'date_of_birth', 'gender', 'occupation', 'employer',
      'physical_address', 'postal_address',
      'next_of_kin_name', 'next_of_kin_phone', 'next_of_kin_relationship',
      'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
      'status'
    ];

    // Build update object
    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Add timestamp
    updateData.updated_at = new Date().toISOString();

    // Update member
    const { data: member, error: updateError } = await supabase
      .from('members')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating member:', updateError);
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    // Create audit log entry
    await supabase.from('audit_logs').insert({
      action: body.status ? `member_status_change` : 'member_update',
      description: body.status 
        ? `Member status changed to ${body.status}`
        : 'Member profile updated',
      entity_type: 'member',
      entity_id: id,
      user_id: user.id,
      old_value: body.status ? body._previousStatus : null,
      new_value: body.status ? body.status : null,
      metadata: body,
    });

    return NextResponse.json({ success: true, data: member });
  } catch (error) {
    console.error('Error updating member:', error);
    return NextResponse.json({ success: false, error: 'Failed to update member' }, { status: 500 });
  }
}

// DELETE - Archive member (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServiceClient();
    const body = await request.json().catch(() => ({}));

    // Check authentication
    const { createClient: createAuthClient } = await import('@/lib/supabase/server');
    const authClient = await createAuthClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Soft delete - update status to withdrawn
    const { data: member, error: archiveError } = await supabase
      .from('members')
      .update({ 
        status: 'withdrawn',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (archiveError) {
      console.error('Error archiving member:', archiveError);
      return NextResponse.json({ success: false, error: archiveError.message }, { status: 500 });
    }

    // Create audit log
    await supabase.from('audit_logs').insert({
      action: 'member_archived',
      description: `Member archived${body.reason ? `: ${body.reason}` : ''}`,
      entity_type: 'member',
      entity_id: id,
      user_id: user.id,
    });

    return NextResponse.json({ success: true, data: member });
  } catch (error) {
    console.error('Error archiving member:', error);
    return NextResponse.json({ success: false, error: 'Failed to archive member' }, { status: 500 });
  }
}
