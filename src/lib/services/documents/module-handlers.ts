/**
 * ENTERPRISE DOCUMENT & MEDIA SERVICE - MODULE HANDLERS
 * 
 * Module-specific document handlers that provide customized behaviors
 * for different YUNITE modules while using the centralized service.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import {
  ModuleDocumentHandler,
  ModuleType,
  EnterpriseDocument,
  DocumentUploadOptions,
  DocumentSearchOptions,
  ComplianceRequirement,
  WorkflowAction,
  DocumentStatus,
} from './types';
import { enterpriseDocumentService } from './core.service';

/**
 * MEMBER DOCUMENTS HANDLER
 * Handles KYC, compliance, profile photos, and member documentation
 */
export class MemberDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'members';

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    const warnings: string[] = [];

    // Check for existing document of same category (except for versioning)
    if (!options.isNewVersion) {
      const supabase = await createServiceClient();
      const { data: existing } = await supabase
        .from('documents')
        .select('id')
        .eq('module', 'members')
        .eq('entity_id', options.entityId)
        .eq('category_code', options.categoryCode)
        .eq('is_archived', false)
        .single();

      if (existing) {
        warnings.push('A document already exists for this category. Uploading will create a new version.');
      }
    }

    // Validate file size
    const maxSize = 10 * 1024 * 1024; // 10MB
    const fileSize = options.file instanceof File ? options.file.size : options.file.length;
    if (fileSize > maxSize) {
      return { valid: false, error: 'File size exceeds maximum allowed (10MB)' };
    }

    // Validate mime types for compliance documents
    const requiredMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (options.categoryCode.includes('photo') || options.categoryCode.includes('id')) {
      const mimeType = options.file instanceof File ? options.file.type : 'application/octet-stream';
      if (!requiredMimeTypes.includes(mimeType)) {
        return { valid: false, error: 'Invalid file type. Allowed: JPEG, PNG, PDF' };
      }
    }

    return { valid: true, warnings };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    // For profile photos, update member's profile_photo field
    if (document.categoryCode === 'member_passport_photo') {
      const supabase = await createServiceClient();
      await supabase
        .from('members')
        .update({ profile_photo: document.publicUrl })
        .eq('id', document.entityId);
    }

    // Update compliance status
    await this.updateComplianceStatus(document.entityId);
  }

  async onStatusChange(document: EnterpriseDocument, newStatus: DocumentStatus): Promise<void> {
    if (newStatus === 'approved' || newStatus === 'rejected') {
      await this.updateComplianceStatus(document.entityId);
      
      // Check if member is now ready for approval
      if (newStatus === 'approved') {
        const compliance = await this.calculateComplianceScore(document.entityId);
        if (compliance === 100) {
          // Member has all required documents - trigger notification
          await this.notifyMemberReady(document.entityId);
        }
      }
    }
  }

  async calculateComplianceScore(entityId: string): Promise<number> {
    const supabase = await createServiceClient();

    // Get all required categories for members
    const { data: categories } = await supabase
      .from('document_categories')
      .select('code')
      .eq('module', 'members')
      .eq('is_required', true)
      .eq('is_active', true);

    if (!categories || categories.length === 0) return 100;

    // Get approved documents for this member
    const { data: documents } = await supabase
      .from('documents')
      .select('category_code')
      .eq('module', 'members')
      .eq('entity_id', entityId)
      .eq('status', 'approved')
      .eq('is_archived', false);

    const approvedCategories = new Set(documents?.map(d => d.category_code) || []);

    let score = 0;
    for (const cat of categories) {
      if (approvedCategories.has(cat.code)) {
        score++;
      }
    }

    return Math.round((score / categories.length) * 100);
  }

  async getComplianceRequirements(entityId: string): Promise<ComplianceRequirement[]> {
    const supabase = await createServiceClient();

    // Get all member document categories
    const { data: categories } = await supabase
      .from('document_categories')
      .select('*')
      .eq('module', 'members')
      .eq('is_active', true)
      .order('sort_order');

    if (!categories) return [];

    // Get documents for this member
    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('module', 'members')
      .eq('entity_id', entityId)
      .eq('is_archived', false)
      .order('uploaded_at', { ascending: false });

    const docMap = new Map<string, any>();
    documents?.forEach(doc => {
      if (!docMap.has(doc.category_code)) {
        docMap.set(doc.category_code, doc);
      }
    });

    return categories.map(cat => {
      const doc = docMap.get(cat.code);
      return {
        categoryCode: cat.code,
        categoryName: cat.name,
        isRequired: cat.is_required,
        documentId: doc?.id,
        status: doc?.status || 'pending',
        uploadedAt: doc?.uploaded_at,
        verifiedAt: doc?.verified_at,
        expiryDate: doc?.expiry_date,
      };
    });
  }

  private async updateComplianceStatus(memberId: string): Promise<void> {
    const score = await this.calculateComplianceScore(memberId);
    const supabase = await createServiceClient();

    // Update workflow score
    await supabase
      .from('member_approval_workflow')
      .update({
        compliance_score: score,
        required_documents_complete: score === 100,
        updated_at: new Date().toISOString(),
      })
      .eq('member_id', memberId);
  }

  private async notifyMemberReady(memberId: string): Promise<void> {
    // Notify admins that member is ready for approval
    const supabase = await createServiceClient();

    const { data: member } = await supabase
      .from('members')
      .select('first_name, last_name')
      .eq('id', memberId)
      .single();

    // This would integrate with the notification service
    console.log(`Member ${member?.first_name} ${member?.last_name} has completed all required documents`);
  }

  async onEntityDelete(entityId: string): Promise<void> {
    // Archive all member documents when member is deleted
    const supabase = await createServiceClient();
    await supabase
      .from('documents')
      .update({ 
        is_archived: true, 
        archived_at: new Date().toISOString(),
        status: 'archived'
      })
      .eq('module', 'members')
      .eq('entity_id', entityId);
  }
}

/**
 * USER DOCUMENTS HANDLER
 * Handles profile photos for admin/users
 */
export class UserDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'users';

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    // Only allow images for profile photos
    if (options.categoryCode.includes('profile') || options.categoryCode.includes('avatar')) {
      const mimeType = options.file instanceof File ? options.file.type : '';
      if (!mimeType.startsWith('image/')) {
        return { valid: false, error: 'Profile photos must be image files' };
      }
    }

    return { valid: true };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    // Update user's avatar_url
    if (document.categoryCode.includes('profile') || document.categoryCode.includes('avatar')) {
      const supabase = await createServiceClient();
      await supabase
        .from('users')
        .update({ avatar_url: document.publicUrl })
        .eq('id', document.entityId);
    }
  }
}

/**
 * LOAN DOCUMENTS HANDLER
 * Handles loan agreements, collateral, guarantor documents
 */
export class LoanDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'loans';

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    // Validate required documents
    const requiredCategories = ['loan_application', 'loan_agreement'];
    if (requiredCategories.includes(options.categoryCode)) {
      const supabase = await createServiceClient();
      const { data: existing } = await supabase
        .from('documents')
        .select('id')
        .eq('module', 'loans')
        .eq('entity_id', options.entityId)
        .eq('category_code', options.categoryCode)
        .eq('status', 'approved')
        .single();

      if (existing) {
        return { 
          valid: false, 
          error: `A verified ${options.categoryCode} already exists for this loan. Replacement requires admin approval.` 
        };
      }
    }

    return { valid: true };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    // Update loan approval workflow if all documents are present
    const supabase = await createServiceClient();

    // Check if all required loan documents are approved
    const { data: requiredCats } = await supabase
      .from('document_categories')
      .select('code')
      .eq('module', 'loans')
      .eq('is_required', true);

    const { data: approvedDocs } = await supabase
      .from('documents')
      .select('category_code')
      .eq('module', 'loans')
      .eq('entity_id', document.entityId)
      .eq('status', 'approved');

    const approvedSet = new Set(approvedDocs?.map(d => d.category_code) || []);
    const allApproved = requiredCats?.every(cat => approvedSet.has(cat.code));

    if (allApproved) {
      // Update loan status to indicate documents are ready
      console.log('Loan documents ready for review:', document.entityId);
    }
  }

  async onEntityDelete(entityId: string): Promise<void> {
    const supabase = await createServiceClient();
    await supabase
      .from('documents')
      .update({ is_archived: true, archived_at: new Date().toISOString(), status: 'archived' })
      .eq('module', 'loans')
      .eq('entity_id', entityId);
  }
}

/**
 * ORGANIZATION DOCUMENTS HANDLER
 * Handles org certificates, branding assets, official documents
 */
export class OrganizationDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'organization';

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    // Organization documents should only be uploaded by admins
    // This is handled at the API level

    // Validate branding assets
    if (options.categoryCode.includes('logo')) {
      const mimeType = options.file instanceof File ? options.file.type : '';
      if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(mimeType)) {
        return { valid: false, error: 'Logo must be PNG, JPEG, or SVG format' };
      }
    }

    return { valid: true };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    const supabase = await createServiceClient();

    // Update organization with branding URLs
    if (document.categoryCode.includes('logo')) {
      await supabase
        .from('organizations')
        .update({ logo_url: document.publicUrl })
        .eq('id', document.entityId);
    }

    // Update registration certificate
    if (document.categoryCode.includes('registration')) {
      await supabase
        .from('organizations')
        .update({ certificate_url: document.publicUrl })
        .eq('id', document.entityId);
    }
  }
}

/**
 * FINANCIAL DOCUMENTS HANDLER
 * Handles receipts, invoices, statements, reconciliation documents
 */
export class FinancialDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'financial';

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    // Financial documents have specific retention requirements
    const retentionMap: Record<string, number> = {
      receipt: 2555,      // 7 years
      invoice: 2555,       // 7 years
      statement: 2555,      // 7 years
      voucher: 1825,        // 5 years
    };

    const category = options.categoryCode.split('_')[1];
    const retentionDays = retentionMap[category];

    if (retentionDays) {
      // Set expiry date based on retention policy
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + retentionDays);
      options.metadata = {
        ...options.metadata,
        retention_days: retentionDays,
        expiry_date: expiryDate.toISOString(),
      };
    }

    return { valid: true };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    // Link to transaction if entityType is transaction
    if (document.entityType === 'transaction') {
      const supabase = await createServiceClient();
      await supabase
        .from('transactions')
        .update({ 
          metadata: supabase.sql`metadata || ${JSON.stringify({ document_id: document.id })}` 
        })
        .eq('id', document.entityId);
    }
  }
}

/**
 * MEETING DOCUMENTS HANDLER
 * Handles agendas, minutes, attendance sheets, resolutions
 */
export class MeetingDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'meetings';

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    // Validate required meeting documents
    if (options.categoryCode === 'meeting_minutes') {
      const supabase = await createServiceClient();
      const { data: existing } = await supabase
        .from('documents')
        .select('id')
        .eq('module', 'meetings')
        .eq('entity_id', options.entityId)
        .eq('category_code', 'meeting_minutes')
        .eq('is_archived', false)
        .single();

      if (existing) {
        return { 
          valid: false, 
          error: 'Meeting minutes already exist. Upload a new version if changes are needed.' 
        };
      }
    }

    return { valid: true };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    const supabase = await createServiceClient();

    // Update meeting record with document reference
    if (document.categoryCode === 'meeting_agenda') {
      await supabase
        .from('meetings')
        .update({ agenda_url: document.publicUrl })
        .eq('id', document.entityId);
    }

    if (document.categoryCode === 'meeting_minutes') {
      await supabase
        .from('meetings')
        .update({ minutes_url: document.publicUrl })
        .eq('id', document.entityId);
    }
  }
}

/**
 * WELFARE DOCUMENTS HANDLER
 * Handles welfare applications, medical documents, supporting evidence
 */
export class WelfareDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'welfare';

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    // Welfare documents often require sensitive data handling
    // Mark as confidential in metadata
    options.metadata = {
      ...options.metadata,
      confidentiality_level: 'high',
      pi_handling_required: true,
    };

    return { valid: true };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    // Update welfare case with supporting document reference
    if (document.categoryCode === 'welfare_supporting') {
      const supabase = await createServiceClient();
      const { data: case_ } = await supabase
        .from('welfare_cases')
        .select('document_count')
        .eq('id', document.entityId)
        .single();

      if (case_) {
        await supabase
          .from('welfare_cases')
          .update({ 
            document_count: (case_.document_count || 0) + 1,
            last_document_at: new Date().toISOString(),
          })
          .eq('id', document.entityId);
      }
    }
  }
}

/**
 * PROJECT DOCUMENTS HANDLER
 * Handles proposals, contracts, progress reports, deliverables
 */
export class ProjectDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'projects';

  async onUpload(document: EnterpriseDocument): Promise<void> {
    const supabase = await createServiceClient();

    // Link to project
    if (document.categoryCode === 'project_proposal') {
      await supabase
        .from('projects')
        .update({ proposal_url: document.publicUrl })
        .eq('id', document.entityId);
    }

    if (document.categoryCode === 'project_contract') {
      await supabase
        .from('projects')
        .update({ contract_url: document.publicUrl })
        .eq('id', document.entityId);
    }

    if (document.categoryCode === 'project_completion') {
      await supabase
        .from('projects')
        .update({ completion_report_url: document.publicUrl })
        .eq('id', document.entityId);
    }
  }
}

/**
 * REPORT DOCUMENTS HANDLER
 * Handles generated reports, statements, financial analyses
 */
export class ReportDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'reports';

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    // Reports are typically generated, so they auto-approve
    options.metadata = {
      ...options.metadata,
      is_generated: true,
      generation_source: 'system',
    };

    return { valid: true };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    // Reports are stored with version history for audit trail
    // No special entity linking needed - reports are standalone
  }
}

// =============================================================================
// HANDLER REGISTRATION
// =============================================================================

export function registerAllModuleHandlers(): void {
  const handlers = [
    new MemberDocumentHandler(),
    new UserDocumentHandler(),
    new LoanDocumentHandler(),
    new OrganizationDocumentHandler(),
    new FinancialDocumentHandler(),
    new MeetingDocumentHandler(),
    new WelfareDocumentHandler(),
    new ProjectDocumentHandler(),
    new ReportDocumentHandler(),
  ];

  handlers.forEach(handler => {
    enterpriseDocumentService.registerModuleHandler(handler);
  });
}

// Export all handlers
export {
  MemberDocumentHandler,
  UserDocumentHandler,
  LoanDocumentHandler,
  OrganizationDocumentHandler,
  FinancialDocumentHandler,
  MeetingDocumentHandler,
  WelfareDocumentHandler,
  ProjectDocumentHandler,
  ReportDocumentHandler,
};
