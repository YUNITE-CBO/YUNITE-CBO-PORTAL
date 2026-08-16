/**
 * DOCUMENT MANAGEMENT SERVICE
 * Phase 4: Enterprise Document, Media & Compliance Management System
 * 
 * Provides centralized document management with:
 * - Multi-module support (members, loans, meetings, etc.)
 * - File versioning
 * - Compliance tracking
 * - Upload/download/preview capabilities
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export interface UploadOptions {
  module: string;
  entityType: string;
  entityId: string;
  documentCategoryId?: string;
  bucket?: string;
  userId?: string;
  userName?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export interface UploadResult {
  success: boolean;
  fileId?: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  error?: string;
}

export interface DocumentWithCategory {
  id: string;
  member_id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  storage_bucket: string;
  storage_path: string | null;
  expiry_date: string | null;
  status: string;
  verified_by: string | null;
  verified_at: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  is_archived: boolean;
  version: number;
  parent_document_id: string | null;
  metadata: Record<string, unknown> | null;
  checksum: string | null;
  original_file_name: string | null;
  created_at: string;
  category_name?: string;
  category_code?: string;
  category_is_required?: boolean;
}

export interface MemberComplianceStatus {
  member_id: string;
  workflow_id: string | null;
  current_stage: string;
  compliance_score: number;
  required_documents_complete: boolean;
  total_required: number;
  approved_count: number;
  pending_count: number;
  missing_count: number;
  requirements: {
    category_code: string;
    category_name: string;
    is_required: boolean;
    status: string;
    document_id: string | null;
    document_name: string | null;
    submitted_at: string | null;
    reviewed_at: string | null;
    review_notes: string | null;
  }[];
}

export class DocumentService {
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor() {
    this.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    this.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  }

  /**
   * Get a public URL for file access
   */
  private getPublicUrl(bucket: string, path: string): string {
    return `${this.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  }

  /**
   * Generate a storage path for a file
   */
  private generateStoragePath(module: string, entityId: string, fileName: string): string {
    const timestamp = Date.now();
    const ext = fileName.split('.').pop() || '';
    const baseName = fileName.replace(`.${ext}`, '').replace(/[^a-zA-Z0-9]/g, '_');
    return `${module}/${entityId}/${timestamp}_${baseName}.${ext}`;
  }

  /**
   * Calculate file checksum
   */
  private calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Upload a file to Supabase Storage
   */
  async uploadFile(
    file: File | Buffer,
    fileName: string,
    options: UploadOptions
  ): Promise<UploadResult> {
    const supabase = await createServiceClient();
    const bucket = options.bucket || 'documents';
    const storagePath = this.generateStoragePath(options.module, options.entityId, fileName);
    
    let fileBuffer: Buffer;
    let mimeType: string;
    let fileSize: number;

    if (file instanceof File) {
      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
      mimeType = file.type;
      fileSize = file.size;
    } else {
      fileBuffer = file;
      mimeType = 'application/octet-stream';
      fileSize = file.length;
    }

    const checksum = this.calculateChecksum(fileBuffer);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return { success: false, error: `Upload failed: ${uploadError.message}` };
    }

    // Get public URL
    const publicUrl = this.getPublicUrl(bucket, storagePath);

    // For member documents, also save to the documents table
    if (options.module === 'members' && options.entityType === 'member') {
      const documentId = uuidv4();
      
      // Determine document type from filename or category
      let documentType = 'other';
      const lowerFileName = fileName.toLowerCase();
      if (lowerFileName.includes('id') || lowerFileName.includes('national')) {
        documentType = 'national_id';
      } else if (lowerFileName.includes('passport')) {
        documentType = 'passport';
      } else if (lowerFileName.includes('photo') || lowerFileName.includes('profile')) {
        documentType = 'photo';
      } else if (lowerFileName.includes('kra') || lowerFileName.includes('pin')) {
        documentType = 'kra_pin';
      } else if (lowerFileName.includes('application') || lowerFileName.includes('form')) {
        documentType = 'membership_form';
      } else if (lowerFileName.includes('certificate')) {
        documentType = 'certificate';
      }

      // Insert document record
      await supabase.from('documents').insert({
        id: documentId,
        member_id: options.entityId,
        document_type: documentType,
        file_name: fileName,
        file_path: publicUrl,
        storage_bucket: bucket,
        storage_path: storagePath,
        file_size: fileSize,
        mime_type: mimeType,
        uploaded_by: options.userId,
        uploaded_at: new Date().toISOString(),
        version: 1,
        checksum,
        original_file_name: fileName,
        status: 'pending',
        metadata: options.metadata || {},
      });

      return {
        success: true,
        fileId: documentId,
        filePath: publicUrl,
        fileName,
        fileSize,
        mimeType,
      };
    }

    // For other modules, save to file_uploads table
    const fileId = uuidv4();
    await supabase.from('file_uploads').insert({
      id: fileId,
      file_name: storagePath,
      original_name: fileName,
      file_path: publicUrl,
      storage_bucket: bucket,
      file_size: fileSize,
      mime_type: mimeType,
      checksum,
      module: options.module,
      entity_type: options.entityType,
      entity_id: options.entityId,
      document_category_id: options.documentCategoryId,
      uploaded_by: options.userId,
      uploaded_by_name: options.userName,
      ip_address: options.ipAddress,
      status: 'active',
      metadata: options.metadata || {},
      created_at: new Date().toISOString(),
    });

    return {
      success: true,
      fileId,
      filePath: publicUrl,
      fileName,
      fileSize,
      mimeType,
    };
  }

  /**
   * Get documents for a member
   */
  async getMemberDocuments(memberId: string): Promise<DocumentWithCategory[]> {
    const supabase = await createServiceClient();

    const { data: documents } = await supabase
      .from('documents')
      .select('*, document_categories:document_category_id(id, code, name, is_required)')
      .eq('member_id', memberId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false });

    if (!documents) return [];

    return documents.map(doc => ({
      ...doc,
      category_name: doc.document_categories?.name,
      category_code: doc.document_categories?.code,
      category_is_required: doc.document_categories?.is_required,
    }));
  }

  /**
   * Get documents for any entity
   */
  async getEntityDocuments(
    module: string,
    entityType: string,
    entityId: string
  ): Promise<DocumentWithCategory[]> {
    const supabase = await createServiceClient();

    if (module === 'members' && entityType === 'member') {
      return this.getMemberDocuments(entityId);
    }

    const { data: documents } = await supabase
      .from('file_uploads')
      .select('*')
      .eq('module', module)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    return (documents || []).map(doc => ({
      id: doc.id,
      member_id: '',
      document_type: 'other',
      file_name: doc.original_name,
      file_path: doc.file_path,
      file_size: doc.file_size,
      mime_type: doc.mime_type,
      storage_bucket: doc.storage_bucket,
      storage_path: doc.file_path,
      expiry_date: null,
      status: 'pending',
      verified_by: null,
      verified_at: null,
      uploaded_by: doc.uploaded_by,
      uploaded_at: doc.created_at,
      is_archived: false,
      version: 1,
      parent_document_id: null,
      metadata: doc.metadata,
      checksum: doc.checksum,
      original_file_name: doc.original_name,
      created_at: doc.created_at,
    }));
  }

  /**
   * Verify/approve a document
   */
  async verifyDocument(
    documentId: string,
    reviewerId: string,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServiceClient();

    const { error } = await supabase
      .from('documents')
      .update({
        status: 'verified',
        verified_by: reviewerId,
        verified_at: new Date().toISOString(),
        metadata: { review_notes: notes },
      })
      .eq('id', documentId);

    if (error) {
      return { success: false, error: error.message };
    }

    // Log to audit
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      user_id: reviewerId,
      action: 'document.verified',
      record_id: documentId,
      description: `Document verified: ${documentId}`,
      created_at: new Date().toISOString(),
    });

    return { success: true };
  }

  /**
   * Archive a document (soft delete)
   */
  async archiveDocument(
    documentId: string,
    archivedBy: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServiceClient();

    const { error } = await supabase
      .from('documents')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by: archivedBy,
      })
      .eq('id', documentId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  /**
   * Delete a document permanently
   */
  async deleteDocument(
    documentId: string,
    deletedBy: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServiceClient();

    // Get document info
    const { data: document } = await supabase
      .from('documents')
      .select('file_path, storage_bucket, storage_path')
      .eq('id', documentId)
      .single();

    if (!document) {
      return { success: false, error: 'Document not found' };
    }

    // Delete from storage
    if (document.storage_path) {
      await supabase.storage
        .from(document.storage_bucket)
        .remove([document.storage_path]);
    }

    // Update document record to deleted
    const { error } = await supabase
      .from('documents')
      .update({
        status: 'expired',
        metadata: { deletion_reason: reason, deleted_by: deletedBy },
      })
      .eq('id', documentId);

    if (error) {
      return { success: false, error: error.message };
    }

    // Log to audit
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      user_id: deletedBy,
      action: 'document.deleted',
      record_id: documentId,
      description: reason || 'Document deleted',
      created_at: new Date().toISOString(),
    });

    return { success: true };
  }

  /**
   * Get member compliance status
   */
  async getMemberComplianceStatus(memberId: string): Promise<MemberComplianceStatus | null> {
    const supabase = await createServiceClient();

    // Get workflow status. Use maybeSingle() — a member may not yet have a
    // workflow row (e.g. registered before the workflow table existed, or the
    // row was never created). `.single()` returns an error object (data:null)
    // in that case, which previously made this return null and caused
    // `approve_member` to 404 with "Compliance not found" even after a
    // successful manual_complete.
    const { data: workflow } = await supabase
      .from('member_approval_workflow')
      .select('*')
      .eq('member_id', memberId)
      .maybeSingle();

    // Get compliance requirements
    const { data: compliance } = await supabase
      .from('member_compliance')
      .select('*, document_categories:document_category_id(*), documents:document_id(*)')
      .eq('member_id', memberId)
      .order('document_category_id');

    // Also read the legacy compliance_records so a manually-marked-complete
    // record (written by manual_complete) counts even when member_compliance
    // has no row for that category.
    const { data: legacyCompliance } = await supabase
      .from('compliance_records')
      .select('compliance_type, status')
      .eq('member_id', memberId);

    // Get document categories for missing requirements
    const { data: categories } = await supabase
      .from('document_categories')
      .select('*')
      .eq('module', 'members')
      .eq('is_active', true)
      .order('sort_order');

    // Build requirements list
    const requirements = (categories || []).map(cat => {
      const comp = compliance?.find(c => c.document_category_code === cat.code);
      const legacy = legacyCompliance?.find(c => c.compliance_type === cat.code);
      // Prefer member_compliance status; fall back to legacy compliance_records.
      const status = comp?.status
        || (legacy && (legacy.status === 'complete' || legacy.status === 'approved') ? 'approved' : 'pending');
      return {
        category_code: cat.code,
        category_name: cat.name,
        is_required: cat.is_required,
        status,
        document_id: comp?.document_id || null,
        document_name: comp?.documents?.file_name || null,
        submitted_at: comp?.submitted_at || null,
        reviewed_at: comp?.reviewed_at || null,
        review_notes: comp?.review_notes || null,
      };
    });

    const total_required = requirements.filter(r => r.is_required).length;
    const approved_count = requirements.filter(r => r.status === 'approved').length;
    const pending_count = requirements.filter(r => ['pending', 'submitted', 'under_review'].includes(r.status)).length;
    const missing_count = requirements.filter(r => r.is_required && r.status === 'pending').length;

    // When a workflow row exists, honor its stored compliance score. When it
    // does NOT exist, derive the score from the requirements so the member can
    // still be approved after a manual_complete (which may have created the
    // compliance records but failed to create the workflow row). This keeps
    // approve_member from 404-ing.
    const derivedComplete = total_required > 0 && approved_count >= total_required;
    const derivedScore = total_required > 0
      ? Math.round((approved_count / total_required) * 100)
      : 100;

    return {
      member_id: memberId,
      workflow_id: workflow?.id || null,
      current_stage: workflow?.current_stage || 'compliance_review',
      compliance_score: workflow?.compliance_score ?? derivedScore,
      required_documents_complete: workflow?.required_documents_complete ?? derivedComplete,
      total_required,
      approved_count,
      pending_count,
      missing_count,
      requirements,
    };
  }

  /**
   * Submit a document for compliance review
   */
  async submitComplianceDocument(
    memberId: string,
    categoryCode: string,
    documentId: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServiceClient();

    // Update compliance record
    const { data: category } = await supabase
      .from('document_categories')
      .select('id')
      .eq('code', categoryCode)
      .single();

    if (!category) {
      return { success: false, error: 'Document category not found' };
    }

    const { error } = await supabase
      .from('member_compliance')
      .update({
        document_id: documentId,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .eq('member_id', memberId)
      .eq('document_category_code', categoryCode);

    if (error) {
      return { success: false, error: error.message };
    }

    // Update workflow stage if needed
    await supabase
      .from('member_approval_workflow')
      .update({ current_stage: 'review' })
      .eq('member_id', memberId)
      .eq('current_stage', 'documentation');

    return { success: true };
  }

  /**
   * Approve/reject compliance requirement
   */
  async reviewCompliance(
    memberId: string,
    categoryCode: string,
    reviewerId: string,
    action: 'approve' | 'reject',
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServiceClient();

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const { error } = await supabase
      .from('member_compliance')
      .update({
        status: newStatus,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        review_notes: notes,
      })
      .eq('member_id', memberId)
      .eq('document_category_code', categoryCode);

    if (error) {
      return { success: false, error: error.message };
    }

    // Log to audit
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      user_id: reviewerId,
      action: `compliance.${action}ed`,
      record_id: memberId,
      description: `Compliance ${action}ed for ${categoryCode}: ${notes || 'No notes'}`,
      created_at: new Date().toISOString(),
    });

    return { success: true };
  }

  /**
   * Get document categories for a module
   */
  async getDocumentCategories(module: string): Promise<any[]> {
    const supabase = await createServiceClient();

    const { data } = await supabase
      .from('document_categories')
      .select('*')
      .eq('module', module)
      .eq('is_active', true)
      .order('sort_order');

    return data || [];
  }

  /**
   * Create a new document category
   */
  async createDocumentCategory(
    category: {
      code: string;
      name: string;
      description?: string;
      module: string;
      is_required?: boolean;
      allowed_mime_types?: string[];
      max_file_size_mb?: number;
    }
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    const supabase = await createServiceClient();

    const { data: existing } = await supabase
      .from('document_categories')
      .select('id')
      .eq('code', category.code)
      .single();

    if (existing) {
      return { success: false, error: 'Category code already exists' };
    }

    const { data, error } = await supabase
      .from('document_categories')
      .insert({
        id: uuidv4(),
        code: category.code,
        name: category.name,
        description: category.description,
        module: category.module,
        is_required: category.is_required || false,
        allowed_mime_types: category.allowed_mime_types || ['image/*', 'application/pdf'],
        max_file_size_mb: category.max_file_size_mb || 10,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  }

  /**
   * Generate download URL for a document
   */
  async getDownloadUrl(documentId: string): Promise<{ success: boolean; url?: string; error?: string }> {
    const supabase = await createServiceClient();

    const { data: document } = await supabase
      .from('documents')
      .select('file_path, storage_bucket, storage_path')
      .eq('id', documentId)
      .single();

    if (!document) {
      return { success: false, error: 'Document not found' };
    }

    // Generate signed URL for private buckets
    const { data: urlData } = await supabase.storage
      .from(document.storage_bucket)
      .createSignedUrl(document.storage_path || '', 3600); // 1 hour

    if (urlData) {
      return { success: true, url: urlData.signedUrl };
    }

    return { success: true, url: document.file_path };
  }
}

export const documentService = new DocumentService();
