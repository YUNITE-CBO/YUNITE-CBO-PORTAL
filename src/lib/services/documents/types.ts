/**
 * ENTERPRISE DOCUMENT & MEDIA SERVICE - TYPES
 * 
 * Centralized TypeScript types for the Enterprise Document & Media Service.
 * These types define the contract for all document operations across YUNITE modules.
 */

// =============================================================================
// MODULE DEFINITIONS
// =============================================================================

export type ModuleType = 
  | 'members'           // Member documents, KYC, compliance
  | 'users'             // User/administrator profiles
  | 'organization'      // Org documents, certificates, branding
  | 'loans'             // Loan agreements, collateral, guarantors
  | 'savings'           // Savings-related documents
  | 'contributions'     // Contribution records
  | 'welfare'           // Welfare case documents
  | 'donations'         // Donation records and receipts
  | 'investments'       // Investment documents
  | 'projects'          // Project proposals, contracts, reports
  | 'meetings'          // Meeting agendas, minutes, resolutions
  | 'procurement'       // Purchase orders, contracts
  | 'inventory'         // Inventory records
  | 'assets'            // Asset documentation
  | 'events'            // Event records and materials
  | 'reports'           // Generated reports, statements
  | 'ai_center'         // AI analysis outputs
  | 'notifications'     // Notification attachments
  | 'statements'        // Financial statements
  | 'financial'         // Financial documents
  | 'settings'         // Configuration documents
  | 'audit';            // Audit evidence

// =============================================================================
// ENTITY TYPES PER MODULE
// =============================================================================

export type EntityTypeForModule = {
  members: 'member' | 'compliance_record' | 'approval_workflow';
  users: 'user' | 'session';
  organization: 'organization' | 'branch' | 'department';
  loans: 'loan' | 'guarantor' | 'collateral' | 'approval';
  savings: 'savings_account' | 'transaction';
  contributions: 'campaign' | 'payment';
  welfare: 'case' | 'claim' | 'disbursement';
  donations: 'donation' | 'campaign' | 'receipt';
  investments: 'investment' | 'return' | 'statement';
  projects: 'project' | 'milestone' | 'deliverable';
  meetings: 'meeting' | 'agenda' | 'attendance' | 'resolution';
  procurement: 'purchase' | 'order' | 'supplier' | 'contract';
  inventory: 'item' | 'transfer' | 'adjustment';
  assets: 'asset' | 'maintenance' | 'depreciation';
  events: 'event' | 'attendee' | 'feedback';
  reports: 'report' | 'statement' | 'analysis';
  ai_center: 'analysis' | 'prediction' | 'model';
  notifications: 'notification' | 'template';
  settings: 'configuration' | 'backup';
  audit: 'audit_trail' | 'evidence';
  financial: 'transaction' | 'statement' | 'reconciliation';
};

// =============================================================================
// DOCUMENT LIFECYCLE STATES
// =============================================================================

export type DocumentStatus = 
  | 'draft'           // Initial upload, not submitted
  | 'pending'         // Awaiting review
  | 'under_review'    // Being reviewed
  | 'approved'        // Approved and verified
  | 'rejected'        // Rejected with reason
  | 'expired'         // Past expiration date
  | 'archived'        // Soft deleted/archived
  | 'deleted';       // Permanently deleted

// =============================================================================
// DOCUMENT CATEGORY CONFIGURATION
// =============================================================================

export interface DocumentCategoryConfig {
  code: string;
  name: string;
  description: string;
  module?: ModuleType;
  entityType?: string;
  isRequired?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  
  // File constraints
  allowedMimeTypes?: string[];
  maxFileSizeMb?: number;
  minFileSizeKb?: number;
  
  // Validation
  requireVerification?: boolean;
  autoApproveWithCategory?: string[];  // Auto-approve if these categories are approved
  
  // Workflow
  workflowRequired?: boolean;
  workflowStages?: WorkflowStage[];
  
  // Retention
  retentionDays?: number;
  autoArchiveAfterDays?: number;
  
  // Module-specific behavior
  behavior?: DocumentBehavior;
  
  // Additional properties used in configs
  required?: boolean;
  maxSizeMb?: number;
  allowedTypes?: string[];
  lifecycle?: string[];
  autoApprove?: boolean;
  presentation?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  expiryRequired?: boolean;
  expiryYears?: number;
}

export interface WorkflowStage {
  id: string;
  name: string;
  order: number;
  requiredRole: string;
  action: 'approve' | 'reject' | 'request_changes' | 'escalate';
  notifyRoles?: string[];
  autoProgressDays?: number;
}

// =============================================================================
// DOCUMENT BEHAVIOR BY MODULE
// =============================================================================

export interface DocumentBehavior {
  // Profile/Avatar behavior
  isProfileImage?: boolean;
  allowCropping?: boolean;
  generateThumbnail?: boolean;
  maxThumbnailWidth?: number;
  maxThumbnailHeight?: number;
  displayLatestApproved?: boolean;
  
  // Compliance behavior
  isComplianceDocument?: boolean;
  requiredForApproval?: boolean;
  calculateComplianceScore?: boolean;
  requireVerification?: boolean;
  
  // Versioning behavior
  allowVersioning?: boolean;
  maxVersions?: number;
  autoIncrementVersion?: boolean;
  
  // Notification behavior
  notifyOnUpload?: string[];
  notifyOnApprove?: string[];
  notifyOnReject?: string[];
  notifyOnExpire?: string[];
  
  // Access behavior
  visibility?: 'public' | 'authenticated' | 'admin' | 'owner';
  allowDownload?: boolean;
  allowPreview?: boolean;
  watermarkOnPreview?: boolean;
  
  // Metadata behavior
  extractMetadata?: boolean;
  ocrEnabled?: boolean;
  indexContent?: boolean;
  
  // Linking behavior
  linkToEntity?: boolean;
  cascadeDelete?: boolean;
}

// =============================================================================
// CORE DOCUMENT INTERFACE
// =============================================================================

export interface EnterpriseDocument {
  // Identity
  id: string;
  documentRef: string;
  
  // Storage
  fileName: string;
  originalFileName: string;
  storageBucket: string;
  storagePath: string;
  publicUrl?: string;
  
  // File Info
  mimeType: string;
  fileSize: number;
  checksum: string;
  
  // Classification
  module: ModuleType;
  entityType: string;
  entityId: string;
  categoryCode: string;
  categoryName?: string;
  
  // Versioning
  version: number;
  parentDocumentId?: string;
  versionHistory?: EnterpriseDocument[];
  
  // Lifecycle
  status: DocumentStatus;
  
  // Verification
  isVerified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  verificationNotes?: string;
  
  // Expiration
  expiryDate?: string;
  isExpired: boolean;
  reminderSent: boolean;
  reminderCount: number;
  
  // Audit
  uploadedBy: string;
  uploadedByName?: string;
  uploadedAt: string;
  ipAddress?: string;
  
  // Archive/Delete
  isArchived: boolean;
  archivedAt?: string;
  archivedBy?: string;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  
  // Relationships
  relatedDocuments?: EnterpriseDocument[];
  linkedEntities?: LinkedEntity[];
  
  // Metadata
  metadata: DocumentMetadata;
  
  // Tags and Search
  tags?: string[];
  keywords?: string[];
  
  // Access Control
  visibility: 'public' | 'authenticated' | 'admin' | 'owner';
  accessRoles?: string[];
}

export interface DocumentMetadata {
  // Standard metadata
  title?: string;
  description?: string;
  author?: string;
  createdDate?: string;
  modifiedDate?: string;
  
  // Content info
  pageCount?: number;
  wordCount?: number;
  language?: string;
  
  // Image-specific
  width?: number;
  height?: number;
  colorSpace?: string;
  
  // OCR
  extractedText?: string;
  ocrConfidence?: number;
  
  // Module-specific metadata (flexible)
  [key: string]: unknown;
}

export interface LinkedEntity {
  module: ModuleType;
  entityType: string;
  entityId: string;
  relationship: 'parent' | 'child' | 'reference' | 'supporting';
  metadata?: Record<string, unknown>;
}

// =============================================================================
// UPLOAD OPTIONS
// =============================================================================

export interface DocumentUploadOptions {
  // Required
  module: ModuleType;
  entityType: string;
  entityId: string;
  categoryCode: string;
  
  // File
  file: File | Buffer;
  fileName: string;
  bucket?: string;
  
  // Versioning
  isNewVersion?: boolean;
  parentDocumentId?: string;
  
  // Metadata
  title?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  
  // Expiration
  expiryDate?: string;
  
  // Access
  visibility?: 'public' | 'authenticated' | 'admin' | 'owner';
  
  // Audit
  userId: string;
  userName?: string;
  ipAddress?: string;
  
  // Module-specific
  behaviorOverrides?: Partial<DocumentBehavior>;
}

export interface DocumentUploadResult {
  success: boolean;
  document?: EnterpriseDocument;
  fileId?: string;
  publicUrl?: string;
  signedUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  warnings?: string[];
}

// =============================================================================
// SEARCH & FILTER
// =============================================================================

export interface DocumentSearchOptions {
  // Text search
  query?: string;
  searchFields?: ('fileName' | 'title' | 'description' | 'tags' | 'extractedText')[];
  
  // Classification filters
  module?: ModuleType | ModuleType[];
  entityType?: string;
  entityId?: string;
  categoryCode?: string | string[];
  
  // Status filters
  status?: DocumentStatus | DocumentStatus[];
  isExpired?: boolean;
  expiringWithinDays?: number;
  
  // Date filters
  uploadedAfter?: string;
  uploadedBefore?: string;
  expiresAfter?: string;
  expiresBefore?: string;
  expiryDate?: string;
  
  // Owner filters
  uploadedBy?: string;
  
  // Pagination
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
  
  // Sorting
  sortBy?: 'fileName' | 'uploadedAt' | 'expiryDate' | 'status' | 'fileSize';
  sortOrder?: 'asc' | 'desc';
  
  // Access control
  includeArchived?: boolean;
  includeDeleted?: boolean;
}

export interface DocumentSearchResult {
  documents: EnterpriseDocument[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets?: SearchFacets;
}

export interface SearchFacets {
  modules?: Record<ModuleType, number>;
  categories?: Record<string, number>;
  statuses?: Record<DocumentStatus, number>;
  dateRanges?: {
    last7Days: number;
    last30Days: number;
    last90Days: number;
    lastYear: number;
  };
}

// =============================================================================
// WORKFLOW OPERATIONS
// =============================================================================

export interface WorkflowAction {
  documentId: string;
  action: 'submit' | 'approve' | 'reject' | 'request_changes' | 'escalate';
  stageId?: string;
  notes?: string;
  reason?: string;
  requestedChanges?: string[];
}

export interface WorkflowResult {
  success: boolean;
  document?: EnterpriseDocument;
  newStatus?: DocumentStatus;
  stageChanged?: boolean;
  notificationsSent?: number;
  error?: string;
}

// =============================================================================
// DOCUMENT OPERATIONS
// =============================================================================

export interface DocumentOperationResult<T = void> {
  success: boolean;
  data?: T;
  document?: EnterpriseDocument;
  error?: string;
  warnings?: string[];
  affectedIds?: string[];
}

export interface BulkOperationResult {
  success: boolean;
  totalProcessed: number;
  successful: number;
  failed: number;
  results: DocumentOperationResult[];
  errors: { id: string; error: string }[];
}

// =============================================================================
// EVENT TYPES FOR INTEGRATION
// =============================================================================

export type DocumentEventType = 
  | 'document.uploaded'
  | 'document.replaced'
  | 'document.version_added'
  | 'document.submitted'
  | 'document.under_review'
  | 'document.approved'
  | 'document.rejected'
  | 'document.verification_requested'
  | 'document.verified'
  | 'document.expiring_soon'
  | 'document.expired'
  | 'document.archived'
  | 'document.deleted'
  | 'document.accessed'
  | 'document.downloaded'
  | 'document.restored'
  | 'compliance.updated'
  | 'workflow.stage_changed'
  | 'member.approval_ready'
  | 'member.document_missing';

export interface DocumentEvent {
  eventType: DocumentEventType;
  documentId: string;
  documentRef: string;
  module: ModuleType;
  entityId: string;
  actorId?: string;
  actorName?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  previousState?: Partial<EnterpriseDocument>;
  newState?: Partial<EnterpriseDocument>;
}

// =============================================================================
// MODULE-SPECIFIC HANDLER INTERFACE
// =============================================================================

export interface ModuleDocumentHandler {
  module: ModuleType;
  
  // Pre-upload validation
  validateUpload?(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }>;
  
  // Post-upload processing
  onUpload?(document: EnterpriseDocument, result: DocumentUploadResult): Promise<void>;
  
  // Document retrieval
  getDocuments?(entityId: string, options?: DocumentSearchOptions): Promise<EnterpriseDocument[]>;
  getPrimaryDocument?(entityId: string): Promise<EnterpriseDocument | null>;
  
  // Status transitions
  getAvailableActions?(document: EnterpriseDocument, userRole: string): Promise<WorkflowAction['action'][]>;
  onStatusChange?(document: EnterpriseDocument, newStatus: DocumentStatus): Promise<void>;
  
  // Compliance integration
  calculateComplianceScore?(entityId: string): Promise<number>;
  getComplianceRequirements?(entityId: string): Promise<ComplianceRequirement[]>;
  
  // Cleanup
  onDocumentDelete?(document: EnterpriseDocument): Promise<void>;
  onEntityDelete?(entityId: string): Promise<void>;
}

export interface ComplianceRequirement {
  categoryCode: string;
  categoryName: string;
  isRequired: boolean;
  documentId?: string;
  status: DocumentStatus;
  uploadedAt?: string;
  verifiedAt?: string;
  expiryDate?: string;
  notes?: string;
}

// =============================================================================
// CENTRALIZED SERVICE CONFIGURATION
// =============================================================================

export interface DocumentServiceConfig {
  // Storage
  defaultBucket: string;
  buckets: Record<ModuleType, string>;
  
  // Paths
  generateStoragePath: (module: ModuleType, entityId: string, fileName: string) => string;
  
  // Access
  defaultVisibility: 'public' | 'authenticated' | 'admin' | 'owner';
  
  // Versioning
  maxVersionsPerDocument: number;
  autoArchiveOldVersions: boolean;
  
  // Thumbnails
  generateThumbnails: boolean;
  thumbnailWidth: number;
  thumbnailHeight: number;
  thumbnailQuality: number;
  
  // OCR
  enableOcr: boolean;
  ocrLanguages: string[];
  
  // Retention
  defaultRetentionDays: number;
  autoDeleteExpiredAfterDays: number;
  
  // Notifications
  notifyOnUpload: boolean;
  notifyOnApprove: boolean;
  notifyOnReject: boolean;
  notifyOnExpire: boolean;
  
  // Audit
  logAllAccess: boolean;
  logDownloads: boolean;
}
