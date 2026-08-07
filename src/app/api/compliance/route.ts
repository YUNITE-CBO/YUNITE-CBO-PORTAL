/**
 * Compliance Management API
 * Phase 4: Member compliance tracking and approval workflow
 */

import { NextRequest, NextResponse } from 'next/server';
import { documentService } from '@/lib/services/document.service';
import { authService } from '@/lib/services/auth.service';
import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    const batch = searchParams.get('batch') === 'true';

    // Batch endpoint: Fetch compliance for ALL members in a single query (fixes N+1)
    if (batch) {
      const supabase = await createServiceClient();

      // Fetch all members with their compliance data in a single query
      const { data: members, error: membersError } = await supabase
        .from('members')
        .select('id, member_number, first_name, last_name, status');

      if (membersError) throw membersError;

      // Fetch compliance records from BOTH tables:
      // 1. compliance_records (migration 001 - OLD system)
      // 2. member_compliance (migration 007 - NEW system)
      const { data: oldCompliance, error: oldError } = await supabase
        .from('compliance_records')
        .select('*');

      if (oldError) console.warn('Old compliance_records error:', oldError);

      const { data: newCompliance, error: newError } = await supabase
        .from('member_compliance')
        .select('*');

      if (newError) console.warn('New member_compliance error:', newError);

      // Combine and deduplicate compliance records
      const allCompliance = [
        ...(oldCompliance || []).map(r => ({
          ...r,
          source: 'compliance_records',
          category_name: r.compliance_type || r.compliance_type,
        })),
        ...(newCompliance || []).map(r => ({
          ...r,
          source: 'member_compliance',
          category_name: r.document_category_code || r.compliance_type,
        })),
      ];

      // Group compliance by member
      const complianceByMember: Record<string, any[]> = {};
      allCompliance.forEach(record => {
        if (!complianceByMember[record.member_id]) {
          complianceByMember[record.member_id] = [];
        }
        complianceByMember[record.member_id].push(record);
      });

      // Calculate scores for each member
      const memberCompliance = (members || []).map(member => {
        const records = complianceByMember[member.id] || [];
        const total = records.length;
        const completed = records.filter(r =>
          r.status === 'complete' || r.status === 'approved' || r.status === 'submitted'
        ).length;
        const score = total > 0 ? Math.round((completed / total) * 100) : 0;

        // Determine compliance status
        let complianceStatus = 'non_compliant';
        if (score === 100) complianceStatus = 'compliant';
        else if (score >= 50) complianceStatus = 'partial';
        else if (total === 0) complianceStatus = 'pending';

        return {
          ...member,
          compliance: records,
          compliance_score: score,
          compliance_status: complianceStatus,
          total_requirements: total,
          completed_requirements: completed,
        };
      });

      return NextResponse.json({
        success: true,
        data: memberCompliance,
      });
    }

    // Single member endpoint (existing behavior)
    if (!memberId) {
      return NextResponse.json({ success: false, error: 'memberId is required' }, { status: 400 });
    }

    const data = await documentService.getMemberComplianceStatus(memberId);
    if (!data) {
      return NextResponse.json({ success: false, error: 'Member compliance not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching compliance:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch compliance' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authService.getSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { memberId, categoryCode, documentId, action, notes, complianceId, status } = body;
    const supabase = await createServiceClient();

    // Update compliance record status directly (mark as complete/pending)
    if (action === 'update_compliance' && complianceId && memberId) {
      const validStatuses = ['pending', 'complete', 'missing', 'expired'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ 
          success: false, 
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
        }, { status: 400 });
      }

      const completedDate = status === 'complete' ? new Date().toISOString() : null;

      // Try to update in compliance_records first (old system)
      const { error: oldError } = await supabase
        .from('compliance_records')
        .update({ 
          status, 
          completed_date: completedDate,
          notes: notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', complianceId)
        .eq('member_id', memberId);

      let updatedInOldSystem = !oldError;
      let updatedInNewSystem = false;

      // If error occurred in old system, try member_compliance (new system)
      if (oldError) {
        const { error: newError } = await supabase
          .from('member_compliance')
          .update({ 
            status, 
            reviewed_at: completedDate,
            review_notes: notes || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', complianceId)
          .eq('member_id', memberId);

        if (newError) {
          return NextResponse.json({ 
            success: false, 
            error: 'Failed to update compliance record' 
          }, { status: 500 });
        }

        updatedInNewSystem = true;
      }

      // Only log audit if a record was actually updated
      const wasUpdated = updatedInOldSystem || updatedInNewSystem;
      if (wasUpdated) {
        await supabase.from('audit_logs').insert({
          id: uuidv4(),
          user_id: session.user.id,
          action: `compliance.${status}`,
          record_id: complianceId,
          description: `Compliance ${status} for member ${memberId}`,
          created_at: new Date().toISOString(),
        });
      }

      return NextResponse.json({ 
        success: true, 
        message: `Compliance marked as ${status}`
      });
    }

    // Batch update compliance for a member
    if (action === 'batch_update' && memberId && status) {
      const validStatuses = ['pending', 'complete', 'missing', 'expired'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ 
          success: false, 
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
        }, { status: 400 });
      }

      const completedDate = status === 'complete' ? new Date().toISOString() : null;

      // Update all compliance_records for this member
      const { error: oldError } = await supabase
        .from('compliance_records')
        .update({ 
          status, 
          completed_date: completedDate,
          notes: notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('member_id', memberId);

      if (oldError) {
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to update compliance records in old system' 
        }, { status: 500 });
      }

      // Update all member_compliance for this member
      const { error: newError } = await supabase
        .from('member_compliance')
        .update({ 
          status, 
          reviewed_at: completedDate,
          review_notes: notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('member_id', memberId);

      if (newError) {
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to update compliance records in new system' 
        }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        message: `All compliance records marked as ${status}` 
      });
    }

    // Submit document for compliance
    if (memberId && categoryCode && documentId && !action) {
      const result = await documentService.submitComplianceDocument(memberId, categoryCode, documentId);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: 'Document submitted for review' });
    }

    // Review compliance (approve/reject)
    if (memberId && categoryCode && action && ['approve', 'reject'].includes(action)) {
      const result = await documentService.reviewCompliance(
        memberId,
        categoryCode,
        session.user.id,
        action,
        notes
      );
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: `Compliance ${action}ed successfully` });
    }

    // Approve member (complete workflow)
    if (memberId && action === 'approve_member') {
      const supabase = await createServiceClient();

      // Check compliance score
      const compliance = await documentService.getMemberComplianceStatus(memberId);
      if (!compliance) {
        return NextResponse.json({ success: false, error: 'Compliance not found' }, { status: 404 });
      }

      if (!compliance.required_documents_complete) {
        return NextResponse.json({ 
          success: false, 
          error: `Cannot approve member. Compliance score: ${compliance.compliance_score}%. Missing required documents.` 
        }, { status: 400 });
      }

      // Update workflow
      await supabase
        .from('member_approval_workflow')
        .update({
          current_stage: 'completed',
          approved_at: new Date().toISOString(),
          approved_by: session.user.id,
        })
        .eq('member_id', memberId);

      // Update member status to active
      await supabase
        .from('members')
        .update({ status: 'active' })
        .eq('id', memberId);

      // Log to audit
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        user_id: session.user.id,
        action: 'member.approved',
        record_id: memberId,
        description: `Member approved after compliance review`,
        created_at: new Date().toISOString(),
      });

      return NextResponse.json({ success: true, message: 'Member approved successfully' });
    }

    // Reject member
    if (memberId && action === 'reject_member') {
      const supabase = await createServiceClient();

      await supabase
        .from('member_approval_workflow')
        .update({
          current_stage: 'rejected',
          rejected_at: new Date().toISOString(),
          rejected_by: session.user.id,
          rejection_reason: notes || 'No reason provided',
        })
        .eq('member_id', memberId);

      // Log to audit
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        user_id: session.user.id,
        action: 'member.rejected',
        record_id: memberId,
        description: `Member rejected: ${notes || 'No reason provided'}`,
        created_at: new Date().toISOString(),
      });

      return NextResponse.json({ success: true, message: 'Member rejected' });
    }

    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  } catch (error) {
    console.error('Error processing compliance:', error);
    return NextResponse.json({ success: false, error: 'Failed to process compliance action' }, { status: 500 });
  }
}
