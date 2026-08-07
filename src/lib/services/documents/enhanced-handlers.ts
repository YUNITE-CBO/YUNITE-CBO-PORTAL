/**
 * ENTERPRISE DOCUMENT & MEDIA SERVICE - ENHANCED MODULE HANDLERS
 * 
 * Module handlers that use configurations to define business behavior
 * while leveraging the centralized document infrastructure.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import {
  ModuleType,
  EnterpriseDocument,
  DocumentUploadOptions,
  DocumentStatus,
  ModuleDocumentHandler,
} from './types';
import {
  ModuleConfigurations,
  MemberDocumentsConfig,
  LoanDocumentsConfig,
  FinancialDocumentsConfig,
  MeetingDocumentsConfig,
  OrganizationDocumentsConfig,
  NotificationDocumentsConfig,
  StatementDocumentsConfig,
  WelfareDocumentsConfig,
} from './module-configurations';

/**
 * MEMBER DOCUMENTS HANDLER
 * 
 * Business Rules:
 * - Profile photos update member record directly
 * - Compliance scoring based on required documents
 * - Member cannot be approved without 100% compliance
 * - Document expiration triggers reminders
 */
export class MemberDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'members';
  private config = MemberDocumentsConfig;

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    const warnings: string[] = [];
    
    // Find category by code property, not object key
    const categoryConfig = Object.values(this.config.categories).find(c => c.code === options.categoryCode);
    if (!categoryConfig) {
      return { valid: false, error: 'Unknown document category' };
    }
    const category = categoryConfig;

    // Check file size
    const fileSize = options.file instanceof File ? options.file.size : options.file.length;
    const maxBytes = category.maxFileSizeMb ?? 50 * 1024 * 1024;
    if (fileSize > maxBytes) {
      return { valid: false, error: `File size exceeds maximum of ${category.maxFileSizeMb ?? 50}MB` };
    }

    // Check mime type
    const mimeType = options.file instanceof File ? options.file.type : '';
    if (!(category.allowedMimeTypes ?? []).includes(mimeType)) {
      return { valid: false, error: `File type not allowed. Allowed: ${(category.allowedMimeTypes ?? []).join(', ')}` };
    }

    // Check for existing document
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
        warnings.push('A document already exists. Uploading will create a new version.');
      }
    }

    return { valid: true, warnings };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    const supabase = await createServiceClient();

    // Update member profile photo if this is a profile photo
    if (document.categoryCode === 'member_passport_photo') {
      await supabase
        .from('members')
        .update({ profile_photo: document.publicUrl })
        .eq('id', document.entityId);
    }

    // Calculate and update compliance score
    await this.updateComplianceScore(document.entityId);
  }

  async onStatusChange(document: EnterpriseDocument, newStatus: DocumentStatus): Promise<void> {
    await this.updateComplianceScore(document.entityId);

    if (newStatus === 'approved') {
      const score = await this.calculateComplianceScore(document.entityId);
      if (score === 100) {
        // Notify admins that member is ready for approval
        await this.notifyMemberReady(document.entityId);
      }
    }
  }

  async calculateComplianceScore(entityId: string): Promise<number> {
    const supabase = await createServiceClient();

    // Get required categories
    const requiredCategories = Object.values(this.config.categories)
      .filter(c => c.isRequired)
      .map(c => c.code);

    if (requiredCategories.length === 0) return 100;

    // Get approved documents
    const { data: approvedDocs } = await supabase
      .from('documents')
      .select('category_code')
      .eq('module', 'members')
      .eq('entity_id', entityId)
      .eq('status', 'approved')
      .eq('is_archived', false);

    const approvedSet = new Set(approvedDocs?.map(d => d.category_code) || []);
    const approvedCount = requiredCategories.filter(code => approvedSet.has(code)).length;

    return Math.round((approvedCount / requiredCategories.length) * 100);
  }

  async getComplianceRequirements(entityId: string): Promise<any[]> {
    const supabase = await createServiceClient();

    const categories = Object.values(this.config.categories);
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
        isRequired: cat.isRequired,
        documentId: doc?.id,
        status: doc?.status || 'missing',
        uploadedAt: doc?.uploaded_at,
        verifiedAt: doc?.verified_at,
        expiryDate: doc?.expiry_date,
      };
    });
  }

  async onEntityDelete(entityId: string): Promise<void> {
    const supabase = await createServiceClient();
    await supabase
      .from('documents')
      .update({ is_archived: true, archived_at: new Date().toISOString(), status: 'archived' })
      .eq('module', 'members')
      .eq('entity_id', entityId);
  }

  private async updateComplianceScore(memberId: string): Promise<void> {
    const score = await this.calculateComplianceScore(memberId);
    const supabase = await createServiceClient();
    
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
    // Publish event for notification service to handle
  }
}

/**
 * LOAN DOCUMENTS HANDLER
 * 
 * Business Rules:
 * - Documents linked to specific loan records
 * - Guarantor documents validated separately
 * - Collateral documents may have valuation requirements
 * - Loan cannot be approved without required documents
 */
export class LoanDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'loans';
  private config = LoanDocumentsConfig;

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    const categoryConfig = Object.values(this.config.categories).find(c => c.code === options.categoryCode);
    if (!categoryConfig) {
      return { valid: false, error: 'Unknown document category' };
    }
    const category = categoryConfig;

    const fileSize = options.file instanceof File ? options.file.size : options.file.length;
    const maxBytes = category.maxFileSizeMb ?? 50 * 1024 * 1024;
    if (fileSize > maxBytes) {
      return { valid: false, error: `File size exceeds maximum of ${category.maxFileSizeMb ?? 50}MB` };
    }

    const mimeType = options.file instanceof File ? options.file.type : '';
    if (!(category.allowedMimeTypes ?? []).includes(mimeType)) {
      return { valid: false, error: `File type not allowed: ${mimeType}` };
    }

    return { valid: true };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    // Update loan status based on document requirements
    await this.updateLoanDocumentStatus(document.entityId);
  }

  async onStatusChange(document: EnterpriseDocument, newStatus: DocumentStatus): Promise<void> {
    await this.updateLoanDocumentStatus(document.entityId);
  }

  async calculateComplianceScore(entityId: string): Promise<number> {
    const supabase = await createServiceClient();

    const requiredCategories = Object.values(this.config.categories)
      .filter(c => c.isRequired)
      .map(c => c.code);

    if (requiredCategories.length === 0) return 100;

    const { data: approvedDocs } = await supabase
      .from('documents')
      .select('category_code')
      .eq('module', 'loans')
      .eq('entity_id', entityId)
      .eq('status', 'approved');

    const approvedSet = new Set(approvedDocs?.map(d => d.category_code) || []);
    const approvedCount = requiredCategories.filter(code => approvedSet.has(code)).length;

    return Math.round((approvedCount / requiredCategories.length) * 100);
  }

  async onEntityDelete(entityId: string): Promise<void> {
    const supabase = await createServiceClient();
    await supabase
      .from('documents')
      .update({ is_archived: true, archived_at: new Date().toISOString(), status: 'archived' })
      .eq('module', 'loans')
      .eq('entity_id', entityId);
  }

  private async updateLoanDocumentStatus(loanId: string): Promise<void> {
    const score = await this.calculateComplianceScore(loanId);
    // Would update loan record with document status
  }
}

/**
 * FINANCIAL DOCUMENTS HANDLER
 * 
 * Business Rules:
 * - Retention periods based on document type
 * - Auto-expiration for documents past retention
 * - Audit trail for all financial documents
 * - Documents linked to transactions
 */
export class FinancialDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'financial';
  private config = FinancialDocumentsConfig;

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    const categoryConfig = Object.values(this.config.categories).find(c => c.code === options.categoryCode);
    if (!categoryConfig) {
      return { valid: false, error: 'Unknown document category' };
    }
    const category = categoryConfig;

    // Set retention period
    const retentionDays = category.retentionDays || this.config.retention?.default || 365;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + retentionDays);

    options.metadata = {
      ...options.metadata,
      retention_until: expiryDate.toISOString(),
      retention_days: retentionDays,
    };

    return { valid: true };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    // Link to transaction if applicable
  }
}

/**
 * MEETING DOCUMENTS HANDLER
 * 
 * Business Rules:
 * - Documents linked to specific meetings
 * - Minutes require chairperson approval
 * - Attendance must be signed
 * - Resolutions require witness signatures
 */
export class MeetingDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'meetings';
  private config = MeetingDocumentsConfig;

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    const categoryConfig = Object.values(this.config.categories).find(c => c.code === options.categoryCode);
    if (!categoryConfig) {
      return { valid: false, error: 'Unknown document category' };
    }
    const category = categoryConfig;

    const fileSize = options.file instanceof File ? options.file.size : options.file.length;
    const maxBytes = category.maxFileSizeMb ?? 50 * 1024 * 1024;
    if (fileSize > maxBytes) {
      return { valid: false, error: `File size exceeds maximum of ${category.maxFileSizeMb ?? 50}MB` };
    }

    return { valid: true };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    const supabase = await createServiceClient();

    // Update meeting record with document URL
    const updateField: Record<string, string> = {};
    switch (document.categoryCode) {
      case 'meeting_agenda':
        updateField.agenda_url = document.publicUrl || '';
        break;
      case 'meeting_minutes':
        updateField.minutes_url = document.publicUrl || '';
        break;
      case 'meeting_attendance':
        updateField.attendance_url = document.publicUrl || '';
        break;
      case 'meeting_resolutions':
        updateField.resolutions_url = document.publicUrl || '';
        break;
    }

    if (Object.keys(updateField).length > 0) {
      await supabase
        .from('meetings')
        .update(updateField)
        .eq('id', document.entityId);
    }
  }

  async getAvailableActions(document: EnterpriseDocument, userRole: string): Promise<('approve' | 'reject' | 'request_changes')[]> {
    const category = this.config.categories[document.categoryCode as keyof typeof this.config.categories];
    
    if (category?.requireVerification && ['admin', 'super_admin'].includes(userRole)) {
      return ['approve', 'reject', 'request_changes'];
    }
    
    return [];
  }
}

/**
 * ORGANIZATION DOCUMENTS HANDLER
 * 
 * Business Rules:
 * - Only super_admin can upload/update org documents
 * - Documents linked to organization branding
 * - Certificate expiration must be tracked
 * - Multiple logo variants supported
 */
export class OrganizationDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'organization';
  private config = OrganizationDocumentsConfig;

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    const categoryConfig = Object.values(this.config.categories).find(c => c.code === options.categoryCode);
    if (!categoryConfig) {
      return { valid: false, error: 'Unknown document category' };
    }
    const category = categoryConfig;

    const fileSize = options.file instanceof File ? options.file.size : options.file.length;
    const maxBytes = category.maxFileSizeMb ?? 50 * 1024 * 1024;
    if (fileSize > maxBytes) {
      return { valid: false, error: `File size exceeds maximum of ${category.maxFileSizeMb ?? 50}MB` };
    }

    const mimeType = options.file instanceof File ? options.file.type : '';
    if (!(category.allowedMimeTypes ?? []).includes(mimeType)) {
      return { valid: false, error: `Invalid file type: ${mimeType}` };
    }

    return { valid: true };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    const supabase = await createServiceClient();

    // Update organization with document URL
    const updates: Record<string, string> = {};
    
    if (document.categoryCode === 'org_logo') {
      updates.logo_url = document.publicUrl || '';
    } else if (document.categoryCode === 'org_registration') {
      updates.certificate_url = document.publicUrl || '';
    } else if (document.categoryCode === 'org_tax_certificate') {
      updates.tax_certificate_url = document.publicUrl || '';
    }

    if (Object.keys(updates).length > 0) {
      await supabase
        .from('organizations')
        .update(updates)
        .eq('id', document.entityId);
    }
  }

  async onEntityDelete(entityId: string): Promise<void> {
    // Organization documents should not be deleted - archive only
    const supabase = await createServiceClient();
    await supabase
      .from('documents')
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq('module', 'organization')
      .eq('entity_id', entityId);
  }
}

/**
 * NOTIFICATION DOCUMENTS HANDLER
 * 
 * Business Rules:
 * - Documents are attachments to notifications
 * - No approval workflow - auto-approved
 * - Various file types supported for attachments
 * - Banner images have dimension requirements
 */
export class NotificationDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'notifications';
  private config = NotificationDocumentsConfig;

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    const categoryConfig = Object.values(this.config.categories).find(c => c.code === options.categoryCode);
    if (!categoryConfig) {
      return { valid: false, error: 'Unknown document category' };
    }
    const category = categoryConfig;

    const fileSize = options.file instanceof File ? options.file.size : options.file.length;
    const maxBytes = category.maxFileSizeMb ?? 50 * 1024 * 1024;
    if (fileSize > maxBytes) {
      return { valid: false, error: `File size exceeds maximum of ${category.maxFileSizeMb ?? 50}MB` };
    }

    return { valid: true };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    // Link document to notification
  }
}

/**
 * STATEMENT DOCUMENTS HANDLER
 * 
 * Business Rules:
 * - Statements are system-generated (auto-approved)
 * - Versioned - old statements preserved
 * - Linked to member accounts
 * - Retention based on statement type
 */
export class StatementDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'statements';
  private config = StatementDocumentsConfig;

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    const categoryConfig = Object.values(this.config.categories).find(c => c.code === options.categoryCode);
    if (!categoryConfig) {
      return { valid: false, error: 'Unknown document category' };
    }

    // Statements are typically generated, so validation is lenient
    return { valid: true };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    // Update statement record if exists
    if (document.metadata?.statementId) {
      // Statement linked
    }
  }
}

/**
 * WELFARE DOCUMENTS HANDLER
 * 
 * Business Rules:
 * - Higher confidentiality for sensitive documents
 * - Medical certificates require verification
 * - Death certificates require official verification
 * - Committee approval required
 */
export class WelfareDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'welfare';
  private config = WelfareDocumentsConfig;

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    const categoryConfig = Object.values(this.config.categories).find(c => c.code === options.categoryCode);
    if (!categoryConfig) {
      return { valid: false, error: 'Unknown document category' };
    }
    const category = categoryConfig;

    const fileSize = options.file instanceof File ? options.file.size : options.file.length;
    const maxBytes = category.maxFileSizeMb ?? 50 * 1024 * 1024;
    if (fileSize > maxBytes) {
      return { valid: false, error: `File size exceeds maximum of ${category.maxFileSizeMb ?? 50}MB` };
    }

    // Mark sensitive documents based on visibility
    if (category.behavior?.visibility === 'admin' || category.behavior?.visibility === 'owner') {
      options.metadata = {
        ...options.metadata,
        confidentiality: 'high',
        requires_committee_review: true,
      };
    }

    return { valid: true };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    const supabase = await createServiceClient();

    // Update welfare case with document count
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

  async onEntityDelete(entityId: string): Promise<void> {
    // Archive but don't delete welfare documents (compliance)
    const supabase = await createServiceClient();
    await supabase
      .from('documents')
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq('module', 'welfare')
      .eq('entity_id', entityId);
  }
}

// =============================================================================
// HANDLER REGISTRATION
// =============================================================================

export function registerAllModuleHandlers(): void {
  const { enterpriseDocumentService } = require('./core.service');
  
  enterpriseDocumentService.registerModuleHandler(new MemberDocumentHandler());
  enterpriseDocumentService.registerModuleHandler(new LoanDocumentHandler());
  enterpriseDocumentService.registerModuleHandler(new FinancialDocumentHandler());
  enterpriseDocumentService.registerModuleHandler(new MeetingDocumentHandler());
  enterpriseDocumentService.registerModuleHandler(new OrganizationDocumentHandler());
  enterpriseDocumentService.registerModuleHandler(new NotificationDocumentHandler());
  enterpriseDocumentService.registerModuleHandler(new StatementDocumentHandler());
  enterpriseDocumentService.registerModuleHandler(new WelfareDocumentHandler());
}
