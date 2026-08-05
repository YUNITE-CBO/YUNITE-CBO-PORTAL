/**
 * ENTERPRISE DOCUMENT & MEDIA SERVICE
 * 
 * Centralized document management for the YUNITE Enterprise Operating System.
 */

// Core service
export { EnterpriseDocumentService, enterpriseDocumentService } from './core.service';

// Types
export * from './types';

// Module configurations
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

// Enhanced module handlers (primary source)
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

// Additional handlers from module-handlers
export {
  UserDocumentHandler,
  ProjectDocumentHandler,
  ReportDocumentHandler,
} from './module-handlers';

// Search service
export { DocumentSearchService, documentSearchService } from './search.service';
