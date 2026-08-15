/**
 * Compliance Management API
 * Phase 4: Member compliance tracking and approval workflow
 */

import { NextRequest, NextResponse } from 'next/server';
import { documentService } from '@/lib/services/document.service';
import { authService } from '@/lib/services/auth.service';
import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
export const dynamic = 'force-dynamic';

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

      // Graceful fallback: missing/old compliance_records are treated as empty.
      const oldComplianceData = oldError ? [] : (oldCompliance || []);

      const { data: newCompliance, error: newError } = await supabase
        .from('member_compliance')
        .select('*');

      // Graceful fallback: missing/member_compliance are treated as empty.
      const newComplianceData = newError ? [] : (newCompliance || []);

      // Combine and deduplicate compliance records
      const allCompliance = [
        ...(oldComplianceData).map(r => ({
          ...r,
          source: 'compliance_records',
          category_name: r.compliance_type || r.compliance_type,
        })),
        ...(newComplianceData).map(r => ({
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

    // Fetch compliance records directly so the UI can reflect manual overrides
    // even when no member_approval_workflow row exists yet.
    const supabase = await createServiceClient();
    const { data: complianceRecords, error: crError } = await supabase
      .from('compliance_records')
      .select('*')
      .eq('member_id', memberId);
    // Graceful fallback: missing compliance_records are treated as empty.
    const crData = crError ? [] : (complianceRecords || []);

    const { data: memberCompliance, error: mcError } = await supabase
      .from('member_compliance')
      .select('*')
      .eq('member_id', memberId);
    // Graceful fallback: missing member_compliance are treated as empty.
    const mcData = mcError ? [] : (memberCompliance || []);

    // Merge both sources keyed by category code / compliance_type
    const recordsByCode: Record<string, any> = {};
    crData.forEach((r: any) => {
      recordsByCode[r.compliance_type] = { ...r, source: 'compliance_records' };
    });
    mcData.forEach((r: any) => {
      const key = r.document_category_code || r.compliance_type;
      if (!recordsByCode[key]) {
        recordsByCode[key] = { ...r, source: 'member_compliance' };
      }
    });

    // Try the full workflow-backed status; fall back gracefully if no workflow row.
    let workflowData: any = null;
    try {
      workflowData = await documentService.getMemberComplianceStatus(memberId);
    } catch {
      workflowData = null;
    }

    return NextResponse.json({
      success: true,
      data: {
        ...(workflowData || {}),
        records: Object.values(recordsByCode),
        recordsByCode,
      },
    });
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

      // If not found, try member_compliance (new system)
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
      }

      // Log the action
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        user_id: session.user.id,
        action: `compliance.${status}`,
        record_id: complianceId,
        description: `Compliance ${status} for member ${memberId}`,
        created_at: new Date().toISOString(),
      });

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
      await supabase
        .from('compliance_records')
        .update({ 
          status, 
          completed_date: completedDate,
          notes: notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('member_id', memberId);

      // Update all member_compliance for this member
      await supabase
        .from('member_compliance')
        .update({ 
          status, 
          reviewed_at: completedDate,
          review_notes: notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('member_id', memberId);

      return NextResponse.json({ 
        success: true, 
        message: `All compliance records marked as ${status}` 
      });
    }

    // Manual complete: an admin manually marks ALL required compliance requirements
    // as complete (e.g. physical documents verified outside the system). This:
    // 1. Approves any existing uploaded documents for required categories.
    // 2. Upserts compliance_records (status='complete') + member_compliance (status='approved')
    //    for every required member category (creating rows if none exist).
    // 3. Sets member_approval_workflow.compliance_score = 100, required_documents_complete = true.
    if (action === 'manual_complete' && memberId) {
      const { MemberDocumentsConfig } = await import('@/lib/services/documents/module-configurations');
      const requiredCategories = Object.values(MemberDocumentsConfig.categories)
        .filter(c => c.isRequired);

      if (requiredCategories.length === 0) {
        return NextResponse.json({ success: false, error: 'No required compliance categories configured' }, { status: 400 });
      }

      const now = new Date().toISOString();
      let approvedDocs = 0;

      // 1. Approve any existing uploaded documents for required categories
      const { data: existingDocs } = await supabase
        .from('documents')
        .select('id, category_code')
        .eq('module', 'members')
        .eq('entity_id', memberId)
        .eq('is_archived', false)
        .in('category_code', requiredCategories.map(c => c.code));

      if (existingDocs && existingDocs.length > 0) {
        const docIds = existingDocs.map(d => d.id);
        const { error: docErr } = await supabase
          .from('documents')
          .update({
            status: 'approved',
            is_verified: true,
            verified_by: session.user.id,
            verified_at: now,
            verification_notes: notes || 'Manually marked complete by admin',
          })
          .in('id', docIds);
        if (docErr) {
          return NextResponse.json({
            success: false,
            error: 'Failed to approve documents during manual verification'
          }, { status: 500 });
        }
        approvedDocs = existingDocs.length;
      }

      // 2. Upsert compliance_records + member_compliance for each required category
      for (const cat of requiredCategories) {
        // compliance_records (uses compliance_type = category code)
        const { data: existingCR } = await supabase
          .from('compliance_records')
          .select('id')
          .eq('member_id', memberId)
          .eq('compliance_type', cat.code)
          .maybeSingle();

        if (existingCR) {
          await supabase
            .from('compliance_records')
            .update({
              status: 'complete',
              completed_date: now,
              notes: notes || 'Manually marked complete by admin',
              updated_at: now,
            })
            .eq('id', existingCR.id);
        } else {
          await supabase
            .from('compliance_records')
            .insert({
              id: uuidv4(),
              member_id: memberId,
              compliance_type: cat.code,
              description: cat.name,
              status: 'complete',
              completed_date: now,
              notes: notes || 'Manually marked complete by admin',
              created_at: now,
              updated_at: now,
            });
        }

        // member_compliance (uses document_category_code)
        const { data: existingMC } = await supabase
          .from('member_compliance')
          .select('id')
          .eq('member_id', memberId)
          .eq('document_category_code', cat.code)
          .maybeSingle();

        if (existingMC) {
          await supabase
            .from('member_compliance')
            .update({
              status: 'approved',
              reviewed_by: session.user.id,
              reviewed_at: now,
              review_notes: notes || 'Manually marked complete by admin',
              updated_at: now,
            })
            .eq('id', existingMC.id);
        } else {
          await supabase
            .from('member_compliance')
            .insert({
              id: uuidv4(),
              member_id: memberId,
              document_category_code: cat.code,
              status: 'approved',
              reviewed_by: session.user.id,
              reviewed_at: now,
              review_notes: notes || 'Manually marked complete by admin',
              created_at: now,
              updated_at: now,
            });
        }
      }

      // 3. Update workflow compliance score
      const { error: wfError } = await supabase
        .from('member_approval_workflow')
        .update({
          compliance_score: 100,
          required_documents_complete: true,
          updated_at: now,
        })
        .eq('member_id', memberId);

      if (wfError) {
        // Workflow row may not exist; create it so the score is persisted.
        // NOTE: current_stage must satisfy the DB CHECK constraint
        // ('documentation', 'review', 'approval', 'completed', 'rejected').
        // 'compliance_review' is NOT a valid stage and would raise a Postgres error.
        await supabase
          .from('member_approval_workflow')
          .insert({
            id: uuidv4(),
            member_id: memberId,
            current_stage: 'review',
            compliance_score: 100,
            required_documents_complete: true,
            notes: notes || 'Manually marked complete by admin',
            created_at: now,
            updated_at: now,
          });
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        user_id: session.user.id,
        action: 'compliance.manual_complete',
        record_id: memberId,
        description: `Manually marked all compliance requirements complete for member ${memberId} (${approvedDocs} document(s) approved)`,
        created_at: now,
      });

      return NextResponse.json({
        success: true,
        message: `All compliance requirements marked complete (${approvedDocs} document(s) approved)`,
        data: { approved_documents: approvedDocs, requirements: requiredCategories.length },
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
