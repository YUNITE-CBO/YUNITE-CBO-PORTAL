import { NextRequest, NextResponse } from 'next/server';
import { memberRegistrationService, transactionEngine } from '@/lib/services';
import { createClient } from '@/lib/supabase/server';

// GET /api/members/[id] - Get member workspace
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const workspace = await memberRegistrationService.getWorkspace(id);

    if (!workspace) {
      return NextResponse.json(
        { success: false, error: 'Member not found' },
        { status: 404 }
      );
    }

    // Calculate live balances
    const balances = await transactionEngine.calculateAllBalances(id);

    return NextResponse.json({
      success: true,
      data: {
        ...workspace,
        balances,
      },
    });
  } catch (error) {
    console.error('Error fetching member workspace:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch member' },
      { status: 500 }
    );
  }
}

// PATCH /api/members/[id] - Update member
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const supabase = await createClient();
    
    // Get current values for audit
    const { data: current } = await supabase
      .from('members')
      .select('*')
      .eq('id', id)
      .single();

    if (!current) {
      return NextResponse.json(
        { success: false, error: 'Member not found' },
        { status: 404 }
      );
    }

    // Update
    const { data: member, error } = await supabase
      .from('members')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error || !member) {
      throw new Error(error?.message || 'Update failed');
    }

    // Audit
    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      action: 'members.update',
      record_id: member.id,
      user_id: body.user_id || '00000000-0000-0000-0000-000000000000',
      before_value: current,
      after_value: member,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Member updated successfully',
      data: member,
    });
  } catch (error) {
    console.error('Error updating member:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update member' },
      { status: 500 }
    );
  }
}
