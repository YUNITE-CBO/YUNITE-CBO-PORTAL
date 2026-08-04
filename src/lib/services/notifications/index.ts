/**
 * Notification Services Index
 * 
 * Central export for all notification-related services.
 */

export { notificationService } from './notification.service';
export type { NotificationData, NotificationRecipient, NotificationChannel, NotificationPriority, RecipientType, NotificationStatus } from './notification.service';

export { emailService } from './email.service';
export type { EmailMessage, EmailDeliveryResult } from './email.service';

export { notificationEventService } from './event.service';
export type { DomainEvent, EventTemplateMapping } from './event.service';

export { templateService } from './template.service';
export type { TemplateData, TemplateVersion } from './template.service';

export { scheduleService } from './schedule.service';
export type { ScheduleData, ScheduleType, RecipientFilterType, ScheduleRun } from './schedule.service';

export { statementService } from './statement.service';
export type { StatementData, StatementType, GeneratedStatement } from './statement.service';
