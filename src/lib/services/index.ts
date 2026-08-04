/**
 * YUNITE Services - Single Source of Truth
 * 
 * All services read from the same Supabase database.
 * All balances are calculated from transaction ledger.
 */

export { transactionEngine } from './transaction.engine';
export type { TransactionType, AccountType, TransactionRequest, CalculatedBalances } from './transaction.engine';

export { memberRegistrationService } from './member-registration.service';
export type { MemberRegistrationData } from './member-registration.service';

export { settingsService } from './settings.service';

export { loanService } from './loan.service';
export type { LoanEligibility, LoanApplication } from './loan.service';

export { dashboardService } from './dashboard.service';
export type { DashboardStats, ActivityItem, DashboardAlert } from './dashboard.service';

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
