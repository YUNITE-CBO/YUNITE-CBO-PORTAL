import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { transactionEngine } from '@/lib/services/transaction.engine';
import { v4 as uuidv4 } from 'uuid';
import { notificationEventService } from '@/lib/services/notifications';

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
      .limit(50);

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

    // Fetch member committees
    const { data: committees } = await supabase
      .from('member_committees')
      .select('*')
      .eq('member_id', id)
      .eq('is_active', true);

    // Fetch member projects
    const { data: projects } = await supabase
      .from('member_projects')
      .select('*')
      .eq('member_id', id)
      .eq('status', 'active');

    // Fetch status history
    const { data: statusHistory } = await supabase
      .from('member_status_history')
      .select('*')
      .eq('member_id', id)
      .order('changed_at', { ascending: false })
      .limit(20);

    // Fetch compliance data
    const { data: complianceData } = await supabase
      .from('member_compliance')
      .select('*, document_categories(*)')
      .eq('member_id', id);

    // Fetch workflow data
    const { data: workflowData } = await supabase
      .from('member_approval_workflow')
      .select('*')
      .eq('member_id', id)
      .single();

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
        committees: committees || [],
        projects: projects || [],
        statusHistory: statusHistory || [],
        compliance: complianceData || [],
        workflow: workflowData,
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
    const { createClient: createAuthClient } = await import('@/lib/supabase/server');
    const authClient = await createAuthClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get current member state for audit
    const { data: currentMember } = await supabase
      .from('members')
      .select('*')
      .eq('id', id)
      .single();

    if (!currentMember) {
      return NextResponse.json({ success: false, error: 'Member not found' }, { status: 404 });
    }

    // Fields that can be updated
    const allowedFields = [
      // Personal Info
      'first_name', 'last_name', 'date_of_birth', 'gender', 'marital_status', 'nationality',
      // Contact
      'email', 'phone', 'alt_phone', 'alt_email',
      // ID/KYC
      'id_number', 'kra_pin',
      // Address
      'physical_address', 'postal_address',
      // Employment
      'occupation', 'employer', 'employer_address',
      // Next of Kin
      'next_of_kin_name', 'next_of_kin_phone', 'next_of_kin_relationship',
      // Emergency Contact
      'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
      // Communication Preferences
      'preferred_language', 'preferred_contact_method', 'sms_notifications', 'email_notifications',
      // Membership
      'membership_category', 'member_group',
      // Profile
      'profile_photo_url',
      // Admin
      'admin_notes',
      // Status (requires special handling)
      'status'
    ];

    // Build update object
    const updateData: Record<string, any> = {};
    const changes: Record<string, { old: any; new: any }> = {};
    
    for (const field of allowedFields) {
      if (body[field] !== undefined && body[field] !== currentMember[field]) {
        updateData[field] = body[field];
        changes[field] = { old: currentMember[field], new: body[field] };
      }
    }

    // Handle status changes
    const statusChange = body.status && body.status !== currentMember.status;
    if (statusChange) {
      updateData.status = body.status;
      
      // Record status change history
      await supabase.from('member_status_history').insert({
        id: uuidv4(),
        member_id: id,
        previous_status: currentMember.status,
        new_status: body.status,
        reason: body.status_reason || body.approval_comment || body.rejection_comment || body.suspension_reason || null,
        changed_by: user.id,
        changed_at: new Date().toISOString(),
        metadata: { action: body.status },
      });

      // Update workflow based on status
      if (body.status === 'active') {
        updateData.workflow_stage = 'active';
        updateData.approved_by = user.id;
        updateData.approved_at = new Date().toISOString();
        
        // Update workflow table
        await supabase
          .from('member_approval_workflow')
          .upsert({
            member_id: id,
            current_stage: 'completed',
            approved_at: new Date().toISOString(),
            approved_by: user.id,
          });
      } else if (body.status === 'suspended') {
        updateData.suspension_reason = body.suspension_reason;
      } else if (body.status === 'rejected') {
        updateData.rejection_reason = body.rejection_comment;
      }

      // Emit notification events
      try {
        if (body.status === 'active') {
          await notificationEventService.emit({
            event_type: 'member',
            event_action: 'approved',
            entity_id: id,
            entity_data: {
              member_name: `${currentMember.first_name} ${currentMember.last_name}`,
              member_number: currentMember.member_number,
            },
            actor_id: user.id,
          });
        } else if (body.status === 'suspended') {
          await notificationEventService.emit({
            event_type: 'member',
            event_action: 'suspended',
            entity_id: id,
            entity_data: {
              member_name: `${currentMember.first_name} ${currentMember.last_name}`,
              reason: body.suspension_reason,
            },
            actor_id: user.id,
          });
        }
      } catch (notifError) {
        console.error('Failed to emit notification:', notifError);
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

    // Create detailed audit log entry
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: statusChange ? 'member_status_change' : 'member_update',
      description: statusChange 
        ? `Member status changed to ${body.status}`
        : `Member profile updated: ${Object.keys(changes).join(', ')}`,
      entity_type: 'member',
      entity_id: id,
      user_id: user.id,
      before_value: Object.keys(changes).length > 0 ? changes : null,
      after_value: Object.keys(changes).length > 0 ? updateData : null,
      metadata: { 
        status_change: statusChange,
        full_changes: changes,
        reason: body.status_reason || body.approval_comment || body.rejection_comment || body.suspension_reason,
      },
    });

    return NextResponse.json({ 
      success: true, 
      data: member,
      changes: Object.keys(changes),
    });
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

    // Get current member
    const { data: currentMember } = await supabase
      .from('members')
      .select('*')
      .eq('id', id)
      .single();

    if (!currentMember) {
      return NextResponse.json({ success: false, error: 'Member not found' }, { status: 404 });
    }

    // Soft delete - update status to withdrawn
    const { data: member, error: archiveError } = await supabase
      .from('members')
      .update({ 
        status: 'withdrawn',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (archiveError) {
      console.error('Error archiving member:', archiveError);
      return NextResponse.json({ success: false, error: archiveError.message }, { status: 500 });
    }

    // Record status change
    await supabase.from('member_status_history').insert({
      id: uuidv4(),
      member_id: id,
      previous_status: currentMember.status,
      new_status: 'withdrawn',
      reason: body.reason || 'Member archived',
      changed_by: user.id,
    });

    // Create audit log
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: 'member_archived',
      description: `Member archived${body.reason ? `: ${body.reason}` : ''}`,
      entity_type: 'member',
      entity_id: id,
      user_id: user.id,
      before_value: { status: currentMember.status },
      after_value: { status: 'withdrawn' },
    });

    return NextResponse.json({ success: true, data: member });
  } catch (error) {
    console.error('Error archiving member:', error);
    return NextResponse.json({ success: false, error: 'Failed to archive member' }, { status: 500 });
  }
}
