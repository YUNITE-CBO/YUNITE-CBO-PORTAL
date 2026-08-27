/**
 * YUNITE Services - Single Source of Truth
 * 
 * All services read from the same Supabase database.
 * All balances are calculated from transaction ledger.
 */

export { transactionEngine } from './transaction.engine';
export type { TransactionType, AccountType, TransactionRequest, CalculatedBalances } from './transaction.engine';

// Controlled transaction posting subsystem (Transaction Rules Engine).
export { transactionPostingService } from './transactions/transaction-posting.service';
export type { PostTransactionInput, PostTransactionResult } from './transactions/transaction-posting.service';
export * from './transactions/transaction-rules';

export { memberRegistrationService } from './member-registration.service';
export type { MemberRegistrationData } from './member-registration.service';

export { settingsService } from './settings.service';

export { loanService } from './loan.service';
export type { LoanEligibility, LoanApplication } from './loan.service';

export { dashboardService } from './dashboard.service';
export type { DashboardStats, ActivityItem, DashboardAlert } from './dashboard.service';

// User Management Services
export { userManagementService } from './user-management.service';
export type { 
  UserRole, 
  UserStatus, 
  CreateUserData, 
  UpdateUserData, 
  UserQueryOptions, 
  UserWithDetails,
  AuditLogEntry,
  UserManagementResult 
} from './user-management.service';

export { superAdminBootstrapService } from './super-admin-bootstrap.service';
export type { SuperAdminConfig, BootstrapResult } from './super-admin-bootstrap.service';

export { applicationStartupService, getOrCreateInitialization } from './application-startup.service';
export type { StartupResult } from './application-startup.service';

// Unity Fund — organization-level central financial engine
export { unityFundEngine } from './unity-fund.engine';
export type {
  UnityFundSource, Direction, PaymentStatus, UnityFundTransaction,
  SourceBreakdown, ExpenditureSummary, LiabilitySummary, UnityFundPosition,
  ReconciliationResult, ReconciliationCheck, PeriodSummary, PeriodFilter,
} from './unity-fund.engine';

// Notification Services
export { notificationService, emailService, notificationEventService, templateService, scheduleService, statementService } from './notifications';
export type { 
  NotificationData, NotificationRecipient, NotificationChannel, NotificationPriority, 
  RecipientType, NotificationStatus 
} from './notifications/notification.service';
export type { EmailMessage, EmailDeliveryResult } from './notifications/email.service';
export type { DomainEvent, EventTemplateMapping } from './notifications/event.service';
export type { TemplateData, TemplateVersion } from './notifications/template.service';
export type { ScheduleData, ScheduleType, RecipientFilterType, ScheduleRun } from './notifications/schedule.service';
export type { StatementData, StatementType, GeneratedStatement } from './notifications/statement.service';
