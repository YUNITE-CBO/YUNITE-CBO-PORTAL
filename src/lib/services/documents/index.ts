/**
 * ENTERPRISE DOCUMENT & MEDIA SERVICE
 * 
 * Centralized document management for the YUNITE Enterprise Operating System.
 * 
 * Usage:
 * 
 * ```typescript
 * import { 
 *   enterpriseDocumentService, 
 *   registerAllModuleHandlers,
 *   ModuleConfigurations 
 * } from '@/lib/services/documents';
 * 
 * // Register all module handlers on app startup
 * registerAllModuleHandlers();
 * 
 * // Upload a member document
 * const result = await enterpriseDocumentService.upload({
 *   module: 'members',
 *   entityType: 'member',
 *   entityId: memberId,
 *   categoryCode: 'member_national_id',
 *   file: fileInput.files[0],
 *   fileName: fileInput.files[0].name,
 *   userId: currentUser.id,
 * });
 * 
 * // Search documents
 * const results = await enterpriseDocumentService.search({
 *   module: 'members',
 *   entityId: memberId,
 *   query: 'birth certificate',
 * });
 * 
 * // Get documents for entity
 * const docs = await enterpriseDocumentService.getForEntity('loans', loanId);
 * 
 * // Get module configuration for custom UI
 * const config = ModuleConfigurations.loans;
 * const maxSize = config.categories.application.maxSizeMb;
 * ```
 */

// Core service
export { EnterpriseDocumentService, enterpriseDocumentService } from './core.service';

// Types
export * from './types';

// Module configurations (business rules per module)
export {
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

// Enhanced module handlers
export {
  registerAllModuleHandlers,
  MemberDocumentHandler,
  LoanDocumentHandler,
  FinancialDocumentHandler,
  MeetingDocumentHandler,
  OrganizationDocumentHandler,
  NotificationDocumentHandler,
  StatementDocumentHandler,
  WelfareDocumentHandler,
} from './enhanced-handlers';

// Legacy handlers (for backward compatibility)
export {
  MemberDocumentHandler as UserDocumentHandler,
  MemberDocumentHandler,
  LoanDocumentHandler,
  OrganizationDocumentHandler,
  FinancialDocumentHandler,
  MeetingDocumentHandler,
  WelfareDocumentHandler,
  ProjectDocumentHandler,
  ReportDocumentHandler,
} from './module-handlers';

// Search service
export { DocumentSearchService, documentSearchService } from './search.service';
