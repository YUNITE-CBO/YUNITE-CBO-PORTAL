/**
 * ENTERPRISE DOCUMENT & MEDIA SERVICE - CORE
 * 
 * Centralized document management service that serves as the single source of truth
 * for all document operations across the YUNITE Enterprise Operating System.
 * 
 * Key Features:
 * - Unified upload/download/validation across all modules
 * - Module-specific behaviors via configurable handlers
 * - Full integration with notifications, audit, and workflows
 * - Versioning, expiration, and lifecycle management
 * - Comprehensive search and retrieval
 * - Event publishing for business process automation
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import {
  ModuleType,
  DocumentStatus,
  DocumentUploadOptions,
  DocumentUploadResult,
  DocumentSearchOptions,
  DocumentSearchResult,
  EnterpriseDocument,
  DocumentMetadata,
  DocumentOperationResult,
  BulkOperationResult,
  WorkflowAction,
  WorkflowResult,
  DocumentEvent,
  DocumentEventType,
  ModuleDocumentHandler,
  DocumentCategoryConfig,
  DocumentServiceConfig,
  LinkedEntity,
} from './types';

// Default service configuration
const DEFAULT_CONFIG: DocumentServiceConfig = {
  defaultBucket: 'documents',
  buckets: {
    members: 'member-documents',
    users: 'user-documents',
    organization: 'org-documents',
    loans: 'loan-documents',
    savings: 'savings-documents',
    contributions: 'contribution-documents',
    welfare: 'welfare-documents',
    donations: 'donation-documents',
    investments: 'investment-documents',
    projects: 'project-documents',
    meetings: 'meeting-documents',
    procurement: 'procurement-documents',
    inventory: 'inventory-documents',
    assets: 'asset-documents',
    events: 'event-documents',
    reports: 'reports',
    ai_center: 'ai-documents',
    notifications: 'notification-attachments',
    settings: 'settings-documents',
    audit: 'audit-evidence',
    financial: 'financial-documents',
    statements: 'statements',
  },
  generateStoragePath: (module, entityId, fileName) => {
    const timestamp = Date.now();
    const sanitized = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${module}/${entityId}/${timestamp}_${sanitized}`;
  },
  defaultVisibility: 'authenticated',
  maxVersionsPerDocument: 10,
  autoArchiveOldVersions: true,
  generateThumbnails: true,
  thumbnailWidth: 200,
  thumbnailHeight: 200,
  thumbnailQuality: 80,
  enableOcr: false,
  ocrLanguages: ['eng'],
  defaultRetentionDays: 365,
  autoDeleteExpiredAfterDays: 30,
  notifyOnUpload: true,
  notifyOnApprove: true,
  notifyOnReject: true,
  notifyOnExpire: true,
  logAllAccess: true,
  logDownloads: true,
};

export class EnterpriseDocumentService {
  private config: DocumentServiceConfig;
  private moduleHandlers: Map<ModuleType, ModuleDocumentHandler> = new Map();
  private eventListeners: Map<DocumentEventType, ((event: DocumentEvent) => Promise<void>)[]> = new Map();

  constructor(config?: Partial<DocumentServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // =============================================================================
  // MODULE HANDLER REGISTRATION
  // =============================================================================

  /**
   * Register a module-specific document handler
   */
  registerModuleHandler(handler: ModuleDocumentHandler): void {
    this.moduleHandlers.set(handler.module, handler);
  }

  /**
   * Get handler for a specific module
   */
  getModuleHandler(module: ModuleType): ModuleDocumentHandler | undefined {
    return this.moduleHandlers.get(module);
  }

  // =============================================================================
  // EVENT SYSTEM
  // =============================================================================

  /**
   * Subscribe to document events
   */
  on(eventType: DocumentEventType, callback: (event: DocumentEvent) => Promise<void>): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType)!.push(callback);
  }

  /**
   * Unsubscribe from document events
   */
  off(eventType: DocumentEventType, callback: (event: DocumentEvent) => Promise<void>): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Publish an event to all listeners
   */
  private async publishEvent(event: DocumentEvent): Promise<void> {
    const listeners = this.eventListeners.get(event.eventType);
    if (listeners) {
      await Promise.all(listeners.map(listener => listener(event)));
    }

    // Also notify 'all' listeners if any
    const allListeners = this.eventListeners.get('*' as DocumentEventType);
    if (allListeners) {
      await Promise.all(allListeners.map(listener => listener(event)));
    }
  }

  // =============================================================================
  // CORE UPLOAD OPERATIONS
  // =============================================================================

  /**
   * Upload a document
   */
  async upload(options: DocumentUploadOptions): Promise<DocumentUploadResult> {
    const supabase = await createServiceClient();

    // Get handler for module-specific validation
    const handler = this.moduleHandlers.get(options.module);
    
    // Run pre-upload validation
    if (handler?.validateUpload) {
      const validation = await handler.validateUpload(options);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
    }

    // Get bucket for this module
    const bucket = options.bucket || this.config.buckets[options.module] || this.config.defaultBucket;

    // Generate storage path
    const storagePath = this.config.generateStoragePath(
      options.module,
      options.entityId,
      options.fileName
    );

    // Process file
    let fileBuffer: Buffer;
    let mimeType: string;
    let fileSize: number;

    if (options.file instanceof File) {
      const arrayBuffer = await options.file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
      mimeType = options.file.type;
      fileSize = options.file.size;
    } else {
      fileBuffer = options.file;
      mimeType = 'application/octet-stream';
      fileSize = options.file.length;
    }

    // Calculate checksum
    const checksum = crypto.createHash('md5').update(fileBuffer).digest('hex');

    // Check for duplicate
    const { data: existing } = await supabase
      .from('documents')
      .select('id, checksum')
      .eq('storage_path', storagePath)
      .single();

    if (existing && existing.checksum === checksum) {
      return { 
        success: false, 
        error: 'Duplicate document detected. This file has already been uploaded.' 
      };
    }

    // Handle versioning
    let parentDocumentId: string | null = null;
    let version = 1;

    if (options.isNewVersion && options.parentDocumentId) {
      parentDocumentId = options.parentDocumentId;
      
      // Get current max version
      const { data: versions } = await supabase
        .from('documents')
        .select('version')
        .eq('parent_document_id', parentDocumentId)
        .order('version', { ascending: false })
        .limit(1);

      version = (versions?.[0]?.version || 0) + 1;

      // Auto-archive old version if max versions reached
      if (version > this.config.maxVersionsPerDocument && this.config.autoArchiveOldVersions) {
        await supabase
          .from('documents')
          .update({ 
            is_archived: true, 
            archived_at: new Date().toISOString(),
            status: 'archived'
          })
          .eq('parent_document_id', parentDocumentId)
          .eq('version', version - this.config.maxVersionsPerDocument);
      }
    }

    // Upload to Supabase Storage
    // First, ensure the bucket exists (auto-create if missing)
    const { data: bucketList } = await supabase.storage.listBuckets();
    const bucketExists = bucketList?.some(b => b.id === bucket);
    
    if (!bucketExists) {
      // Try to create the bucket
      console.log(`Creating storage bucket: ${bucket}`);
      const { error: createBucketError } = await supabase.storage.createBucket(bucket, {
        public: false,
      });
      
      if (createBucketError && createBucketError.message !== 'Bucket already exists') {
        console.error('Failed to create bucket:', createBucketError);
        return { success: false, error: `Storage bucket '${bucket}' not found. Please create it in Supabase Dashboard.` };
      }
    }

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
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    // Determine initial status
    const initialStatus: DocumentStatus = options.behaviorOverrides?.requireVerification 
      ? 'pending' 
      : 'draft';

    // Create document record
    const documentId = uuidv4();
    const documentRef = this.generateDocumentRef(options.module);

    // Map category code to document type
    const getDocumentType = (categoryCode: string): string => {
      const typeMap: Record<string, string> = {
        'member_national_id': 'national_id',
        'member_passport_photo': 'photo',
        'member_kra_pin': 'kra_pin',
        'member_proof_residence': 'other',
        'member_application_form': 'membership_form',
        'member_agreement': 'contract',
      };
      return typeMap[categoryCode] || 'other';
    };

    const documentData = {
      id: documentId,
      document_ref: documentRef,
      
      // Storage
      file_name: options.fileName,
      original_file_name: options.fileName,
      storage_bucket: bucket,
      storage_path: storagePath,
      file_path: publicUrl,
      
      // File info
      mime_type: mimeType,
      file_size: fileSize,
      checksum,
      
      // Classification
      module: options.module,
      entity_type: options.entityType,
      entity_id: options.entityId,
      category_code: options.categoryCode,
      document_type: getDocumentType(options.categoryCode),
      
      // Member association (required for members module)
      member_id: options.module === 'members' ? options.entityId : null,
      
      // Versioning
      version,
      parent_document_id: parentDocumentId,
      
      // Lifecycle
      status: initialStatus,
      
      // Verification
      is_verified: false,
      
      // Expiration
      expiry_date: options.expiryDate || null,
      is_expired: false,
      reminder_sent: false,
      reminder_count: 0,
      
      // Audit
      uploaded_by: options.userId,
      uploaded_by_name: options.userName,
      ip_address: options.ipAddress,
      uploaded_at: new Date().toISOString(),
      
      // Archive
      is_archived: false,
      
      // Metadata
      metadata: {
        title: options.title,
        description: options.description,
        tags: options.tags,
        ...options.metadata,
      } as DocumentMetadata,
      
      // Access
      visibility: options.visibility || this.config.defaultVisibility,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('documents')
      .insert(documentData)
      .select()
      .single();

    if (insertError) {
      // Rollback storage upload
      await supabase.storage.from(bucket).remove([storagePath]);
      return { success: false, error: `Database insert failed: ${insertError.message}` };
    }

    // Create document object
    const document = this.mapToEnterpriseDocument(inserted);

    // Call module handler post-upload hook
    if (handler?.onUpload) {
      await handler.onUpload(document, { success: true, document });
    }

    // Publish upload event
    await this.publishEvent({
      eventType: 'document.uploaded',
      documentId: document.id,
      documentRef: document.documentRef,
      module: document.module,
      entityId: document.entityId,
      actorId: options.userId,
      actorName: options.userName,
      timestamp: new Date().toISOString(),
      newState: document,
    });

    // Log to audit
    await this.createAuditLog(
      'document.uploaded',
      document.id,
      options.userId,
      null,
      document,
      options.ipAddress
    );

    return {
      success: true,
      document,
      fileId: document.id,
      publicUrl,
    };
  }

  /**
   * Upload multiple documents
   */
  async uploadBulk(
    uploads: DocumentUploadOptions[]
  ): Promise<BulkOperationResult> {
    const results: DocumentOperationResult[] = [];
    let successful = 0;
    let failed = 0;

    for (const upload of uploads) {
      const result = await this.upload(upload);
      
      if (result.success) {
        successful++;
        results.push({ success: true, document: result.document });
      } else {
        failed++;
        results.push({ success: false, error: result.error });
      }
    }

    return {
      success: failed === 0,
      totalProcessed: uploads.length,
      successful,
      failed,
      results,
      errors: results.filter(r => !r.success).map((r, i) => ({
        id: uploads[i].entityId,
        error: r.error || 'Unknown error',
      })),
    };
  }

  // =============================================================================
  // DOCUMENT RETRIEVAL
  // =============================================================================

  /**
   * Get document by ID
   */
  async getById(documentId: string): Promise<EnterpriseDocument | null> {
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error || !data) return null;

    return this.mapToEnterpriseDocument(data);
  }

  /**
   * Get document by reference
   */
  async getByRef(documentRef: string): Promise<EnterpriseDocument | null> {
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('document_ref', documentRef)
      .single();

    if (error || !data) return null;

    return this.mapToEnterpriseDocument(data);
  }

  /**
   * Get documents for an entity
   */
  async getForEntity(
    module: ModuleType,
    entityId: string,
    options?: {
      categoryCode?: string;
      status?: DocumentStatus;
      includeArchived?: boolean;
    }
  ): Promise<EnterpriseDocument[]> {
    const supabase = await createServiceClient();

    let query = supabase
      .from('documents')
      .select('*')
      .eq('module', module)
      .eq('entity_id', entityId);

    if (options?.categoryCode) {
      query = query.eq('category_code', options.categoryCode);
    }

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    if (!options?.includeArchived) {
      query = query.eq('is_archived', false);
    }

    query = query.order('uploaded_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching documents:', error);
      return [];
    }

    return data.map(d => this.mapToEnterpriseDocument(d));
  }

  /**
   * Get all versions of a document
   */
  async getVersionHistory(documentId: string): Promise<EnterpriseDocument[]> {
    const supabase = await createServiceClient();

    // Get the root document
    const doc = await this.getById(documentId);
    if (!doc) return [];

    // Get all versions (same parent or same root)
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .or(`parent_document_id.eq.${documentId},id.eq.${documentId}`)
      .order('version', { ascending: true });

    if (error) {
      console.error('Error fetching version history:', error);
      return [];
    }

    return data.map(d => this.mapToEnterpriseDocument(d));
  }

  /**
   * Search documents
   */
  async search(options: DocumentSearchOptions): Promise<DocumentSearchResult> {
    const supabase = await createServiceClient();

    let query = supabase
      .from('documents')
      .select('*', { count: 'exact' });

    // Apply filters
    if (options.module) {
      const modules = Array.isArray(options.module) ? options.module : [options.module];
      query = query.in('module', modules);
    }

    if (options.entityType) {
      query = query.eq('entity_type', options.entityType);
    }

    if (options.entityId) {
      query = query.eq('entity_id', options.entityId);
    }

    if (options.categoryCode) {
      const categories = Array.isArray(options.categoryCode) 
        ? options.categoryCode 
        : [options.categoryCode];
      query = query.in('category_code', categories);
    }

    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      query = query.in('status', statuses);
    }

    if (options.uploadedBy) {
      query = query.eq('uploaded_by', options.uploadedBy);
    }

    if (!options.includeArchived) {
      query = query.eq('is_archived', false);
    }

    if (options.includeDeleted) {
      query = query.eq('status', 'deleted');
    }

    // Date filters
    if (options.uploadedAfter) {
      query = query.gte('uploaded_at', options.uploadedAfter);
    }
    if (options.uploadedBefore) {
      query = query.lte('uploaded_at', options.uploadedBefore);
    }
    if (options.expiryDate) {
      query = query.lte('expiry_date', options.expiryDate);
    }

    // Text search
    if (options.query) {
      query = query.or(
        `file_name.ilike.%${options.query}%,` +
        `original_file_name.ilike.%${options.query}%,` +
        `metadata->>'title'.ilike.%${options.query}%,` +
        `metadata->>'description'.ilike.%${options.query}%`
      );
    }

    // Pagination
    const page = options.page || 1;
    const pageSize = options.pageSize || options.limit || 20;
    const offset = options.offset || (page - 1) * pageSize;

    query = query.range(offset, offset + pageSize - 1);

    // Sorting
    const sortBy = options.sortBy || 'uploaded_at';
    const sortOrder = options.sortOrder || 'desc';
    
    switch (sortBy) {
      case 'fileName':
        query = query.order('file_name', { ascending: sortOrder === 'asc' });
        break;
      case 'uploadedAt':
        query = query.order('uploaded_at', { ascending: sortOrder === 'asc' });
        break;
      case 'expiryDate':
        query = query.order('expiry_date', { ascending: sortOrder === 'asc', nullsFirst: false });
        break;
      case 'status':
        query = query.order('status', { ascending: sortOrder === 'asc' });
        break;
      case 'fileSize':
        query = query.order('file_size', { ascending: sortOrder === 'asc' });
        break;
      default:
        query = query.order('uploaded_at', { ascending: false });
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('Search error:', error);
      return {
        documents: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      };
    }

    return {
      documents: data.map(d => this.mapToEnterpriseDocument(d)),
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    };
  }

  // =============================================================================
  // DOCUMENT OPERATIONS
  // =============================================================================

  /**
   * Update document metadata
   */
  async updateMetadata(
    documentId: string,
    metadata: Partial<DocumentMetadata>,
    userId: string
  ): Promise<DocumentOperationResult> {
    const supabase = await createServiceClient();

    const doc = await this.getById(documentId);
    if (!doc) {
      return { success: false, error: 'Document not found' };
    }

    const { error } = await supabase
      .from('documents')
      .update({
        metadata: { ...doc.metadata, ...metadata },
      })
      .eq('id', documentId);

    if (error) {
      return { success: false, error: error.message };
    }

    const updated = await this.getById(documentId);
    return { success: true, document: updated || undefined };
  }

  /**
   * Replace document (creates new version)
   */
  async replace(
    documentId: string,
    newFile: File | Buffer,
    newFileName: string,
    userId: string,
    userName?: string,
    ipAddress?: string
  ): Promise<DocumentUploadResult> {
    const existing = await this.getById(documentId);
    if (!existing) {
      return { success: false, error: 'Document not found' };
    }

    // Upload as new version
    return this.upload({
      module: existing.module,
      entityType: existing.entityType,
      entityId: existing.entityId,
      categoryCode: existing.categoryCode,
      file: newFile,
      fileName: newFileName,
      isNewVersion: true,
      parentDocumentId: existing.parentDocumentId || existing.id,
      expiryDate: existing.expiryDate,
      visibility: existing.visibility,
      userId,
      userName,
      ipAddress,
    });
  }

  /**
   * Archive document
   */
  async archive(
    documentId: string,
    userId: string
  ): Promise<DocumentOperationResult> {
    const supabase = await createServiceClient();

    const doc = await this.getById(documentId);
    if (!doc) {
      return { success: false, error: 'Document not found' };
    }

    const { error } = await supabase
      .from('documents')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by: userId,
        status: 'archived',
      })
      .eq('id', documentId);

    if (error) {
      return { success: false, error: error.message };
    }

    // Publish event
    await this.publishEvent({
      eventType: 'document.archived',
      documentId,
      documentRef: doc.documentRef,
      module: doc.module,
      entityId: doc.entityId,
      actorId: userId,
      timestamp: new Date().toISOString(),
      previousState: doc,
    });

    const updated = await this.getById(documentId);
    return { success: true, document: updated || undefined };
  }

  /**
   * Restore archived document
   */
  async restore(
    documentId: string,
    userId: string
  ): Promise<DocumentOperationResult> {
    const supabase = await createServiceClient();

    const doc = await this.getById(documentId);
    if (!doc) {
      return { success: false, error: 'Document not found' };
    }

    const { error } = await supabase
      .from('documents')
      .update({
        is_archived: false,
        archived_at: null,
        archived_by: null,
        status: 'approved', // Return to approved status
      })
      .eq('id', documentId);

    if (error) {
      return { success: false, error: error.message };
    }

    await this.publishEvent({
      eventType: 'document.restored',
      documentId,
      documentRef: doc.documentRef,
      module: doc.module,
      entityId: doc.entityId,
      actorId: userId,
      timestamp: new Date().toISOString(),
      previousState: { ...doc, isArchived: true, status: 'archived' as DocumentStatus },
      newState: { ...doc, isArchived: false, status: 'approved' as DocumentStatus },
    });

    const updated = await this.getById(documentId);
    return { success: true, document: updated || undefined };
  }

  /**
   * Permanently delete document
   */
  async delete(
    documentId: string,
    userId: string,
    reason?: string
  ): Promise<DocumentOperationResult> {
    const supabase = await createServiceClient();

    const doc = await this.getById(documentId);
    if (!doc) {
      return { success: false, error: 'Document not found' };
    }

    // Delete from storage
    await supabase.storage
      .from(doc.storageBucket)
      .remove([doc.storagePath]);

    // Delete from database
    const { error } = await supabase
      .from('documents')
      .update({
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
        deletion_reason: reason,
      })
      .eq('id', documentId);

    if (error) {
      return { success: false, error: error.message };
    }

    // Call module handler cleanup
    const handler = this.moduleHandlers.get(doc.module);
    if (handler?.onDocumentDelete) {
      await handler.onDocumentDelete(doc);
    }

    // Publish event
    await this.publishEvent({
      eventType: 'document.deleted',
      documentId,
      documentRef: doc.documentRef,
      module: doc.module,
      entityId: doc.entityId,
      actorId: userId,
      timestamp: new Date().toISOString(),
      previousState: doc,
    });

    // Audit log
    await this.createAuditLog(
      'document.deleted',
      documentId,
      userId,
      doc,
      null,
      undefined,
      reason
    );

    return { success: true };
  }

  /**
   * Generate signed download URL
   */
  async getDownloadUrl(
    documentId: string,
    expiresInSeconds = 3600
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    const supabase = await createServiceClient();

    const doc = await this.getById(documentId);
    if (!doc) {
      return { success: false, error: 'Document not found' };
    }

    const { data, error } = await supabase.storage
      .from(doc.storageBucket)
      .createSignedUrl(doc.storagePath, expiresInSeconds);

    if (error) {
      return { success: false, error: error.message };
    }

    // Log access if enabled
    if (this.config.logDownloads) {
      await this.publishEvent({
        eventType: 'document.downloaded',
        documentId,
        documentRef: doc.documentRef,
        module: doc.module,
        entityId: doc.entityId,
        timestamp: new Date().toISOString(),
      });
    }

    return { success: true, url: data.signedUrl };
  }

  // =============================================================================
  // WORKFLOW OPERATIONS
  // =============================================================================

  /**
   * Submit document for review
   */
  async submit(documentId: string, userId: string): Promise<WorkflowResult> {
    return this.updateStatus(documentId, 'pending', userId);
  }

  /**
   * Approve document
   */
  async approve(
    documentId: string,
    userId: string,
    notes?: string
  ): Promise<WorkflowResult> {
    const supabase = await createServiceClient();

    const doc = await this.getById(documentId);
    if (!doc) {
      return { success: false, error: 'Document not found' };
    }

    await supabase
      .from('documents')
      .update({
        status: 'approved',
        is_verified: true,
        verified_by: userId,
        verified_at: new Date().toISOString(),
        verification_notes: notes,
      })
      .eq('id', documentId);

    const updated = await this.getById(documentId);

    // Publish event
    await this.publishEvent({
      eventType: 'document.approved',
      documentId,
      documentRef: doc.documentRef,
      module: doc.module,
      entityId: doc.entityId,
      actorId: userId,
      timestamp: new Date().toISOString(),
      previousState: doc,
      newState: updated || undefined,
      metadata: { notes },
    });

    // Call module handler
    const handler = this.moduleHandlers.get(doc.module);
    if (handler?.onStatusChange) {
      await handler.onStatusChange(updated!, 'approved');
    }

    return { success: true, document: updated || undefined, newStatus: 'approved' };
  }

  /**
   * Reject document
   */
  async reject(
    documentId: string,
    userId: string,
    reason: string
  ): Promise<WorkflowResult> {
    const supabase = await createServiceClient();

    const doc = await this.getById(documentId);
    if (!doc) {
      return { success: false, error: 'Document not found' };
    }

    await supabase
      .from('documents')
      .update({
        status: 'rejected',
        verification_notes: reason,
      })
      .eq('id', documentId);

    const updated = await this.getById(documentId);

    // Publish event
    await this.publishEvent({
      eventType: 'document.rejected',
      documentId,
      documentRef: doc.documentRef,
      module: doc.module,
      entityId: doc.entityId,
      actorId: userId,
      timestamp: new Date().toISOString(),
      previousState: doc,
      newState: updated || undefined,
      metadata: { reason },
    });

    // Call module handler
    const handler = this.moduleHandlers.get(doc.module);
    if (handler?.onStatusChange) {
      await handler.onStatusChange(updated!, 'rejected');
    }

    return { success: true, document: updated || undefined, newStatus: 'rejected' };
  }

  /**
   * Verify document
   */
  async verify(
    documentId: string,
    userId: string,
    notes?: string
  ): Promise<DocumentOperationResult> {
    const supabase = await createServiceClient();

    const { error } = await supabase
      .from('documents')
      .update({
        is_verified: true,
        verified_by: userId,
        verified_at: new Date().toISOString(),
        verification_notes: notes,
      })
      .eq('id', documentId);

    if (error) {
      return { success: false, error: error.message };
    }

    const updated = await this.getById(documentId);

    await this.publishEvent({
      eventType: 'document.verified',
      documentId,
      documentRef: updated?.documentRef || '',
      module: updated?.module || 'members' as ModuleType,
      entityId: updated?.entityId || '',
      actorId: userId,
      timestamp: new Date().toISOString(),
      metadata: { notes },
    });

    return { success: true, document: updated || undefined };
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  /**
   * Map database row to EnterpriseDocument
   */
  private mapToEnterpriseDocument(row: any): EnterpriseDocument {
    return {
      id: row.id,
      documentRef: row.document_ref,
      fileName: row.file_name,
      originalFileName: row.original_file_name,
      storageBucket: row.storage_bucket,
      storagePath: row.storage_path,
      publicUrl: row.file_path,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      checksum: row.checksum,
      module: row.module as ModuleType,
      entityType: row.entity_type,
      entityId: row.entity_id,
      categoryCode: row.category_code,
      memberId: row.member_id,
      version: row.version,
      parentDocumentId: row.parent_document_id,
      status: row.status as DocumentStatus,
      isVerified: row.is_verified,
      verifiedBy: row.verified_by,
      verifiedAt: row.verified_at,
      verificationNotes: row.verification_notes,
      expiryDate: row.expiry_date,
      isExpired: row.is_expired || false,
      reminderSent: row.reminder_sent,
      reminderCount: row.reminder_count,
      uploadedBy: row.uploaded_by,
      uploadedByName: row.uploaded_by_name,
      uploadedAt: row.uploaded_at,
      ipAddress: row.ip_address,
      isArchived: row.is_archived,
      archivedAt: row.archived_at,
      archivedBy: row.archived_by,
      metadata: row.metadata || {},
      visibility: row.visibility || 'authenticated',
    };
  }

  /**
   * Generate unique document reference
   */
  private generateDocumentRef(module: ModuleType): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const prefix = module.substring(0, 3).toUpperCase();
    return `DOC-${prefix}-${timestamp}${random}`.toUpperCase();
  }

  /**
   * Update document status
   */
  private async updateStatus(
    documentId: string,
    newStatus: DocumentStatus,
    userId: string
  ): Promise<WorkflowResult> {
    const supabase = await createServiceClient();

    const doc = await this.getById(documentId);
    if (!doc) {
      return { success: false, error: 'Document not found' };
    }

    const { error } = await supabase
      .from('documents')
      .update({ status: newStatus })
      .eq('id', documentId);

    if (error) {
      return { success: false, error: error.message };
    }

    const updated = await this.getById(documentId);

    await this.publishEvent({
      eventType: `document.${newStatus}` as DocumentEventType,
      documentId,
      documentRef: doc.documentRef,
      module: doc.module,
      entityId: doc.entityId,
      actorId: userId,
      timestamp: new Date().toISOString(),
      previousState: doc,
      newState: updated || undefined,
    });

    return { success: true, document: updated || undefined, newStatus };
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(
    action: string,
    recordId: string,
    userId: string,
    beforeValue: any,
    afterValue: any,
    ipAddress?: string,
    description?: string
  ): Promise<void> {
    const supabase = await createServiceClient();

    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      user_id: userId,
      action,
      record_id: recordId,
      before_value: beforeValue,
      after_value: afterValue,
      description,
      ip_address: ipAddress,
      created_at: new Date().toISOString(),
    });
  }
}

// Export singleton instance
export const enterpriseDocumentService = new EnterpriseDocumentService();
