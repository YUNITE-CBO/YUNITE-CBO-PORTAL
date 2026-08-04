/**
 * EVENT SERVICE - Event-Driven Notification Engine
 * 
 * Handles domain events and triggers appropriate notifications.
 * All modules should emit events through this service.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { notificationService, NotificationRecipient } from './notification.service';

export interface DomainEvent {
  event_type: string;
  event_action: string;
  source_module: string;
  entity_type?: string;
  entity_id?: string;
  data: Record<string, unknown>;
  actor_id?: string;
  actor_type?: string;
  actor_name?: string;
}

export interface EventTemplateMapping {
  event_type: string;
  event_action: string;
  template_code: string;
  recipient_type: 'member' | 'user' | 'admin' | 'all_admins' | 'member_and_admin';
  recipient_resolver?: (event: DomainEvent) => Promise<NotificationRecipient | NotificationRecipient[]>;
  variable_mapping?: Record<string, string>;
}

// Built-in event template mappings
const EVENT_TEMPLATE_MAPPINGS: EventTemplateMapping[] = [
  // Member events
  {
    event_type: 'member',
    event_action: 'registered',
    template_code: 'member.registered',
    recipient_type: 'all_admins',
    variable_mapping: { member_id: 'member_id', member_name: 'member_name', member_number: 'member_number' },
  },
  {
    event_type: 'member',
    event_action: 'approved',
    template_code: 'member.approved',
    recipient_type: 'member',
    variable_mapping: { member_id: 'member_id', member_name: 'member_name' },
  },
  {
    event_type: 'member',
    event_action: 'suspended',
    template_code: 'member.suspended',
    recipient_type: 'member',
    variable_mapping: { member_id: 'member_id', member_name: 'member_name', reason: 'reason' },
  },

  // Savings events
  {
    event_type: 'savings',
    event_action: 'deposit',
    template_code: 'savings.deposit',
    recipient_type: 'member',
    variable_mapping: { member_id: 'member_id', member_name: 'member_name', amount: 'amount' },
  },
  {
    event_type: 'savings',
    event_action: 'withdrawal',
    template_code: 'savings.withdrawal',
    recipient_type: 'member',
    variable_mapping: { member_id: 'member_id', member_name: 'member_name', amount: 'amount' },
  },

  // Loan events
  {
    event_type: 'loan',
    event_action: 'application_received',
    template_code: 'loan.application_received',
    recipient_type: 'all_admins',
    variable_mapping: { loan_id: 'loan_id', member_name: 'member_name', amount: 'amount' },
  },
  {
    event_type: 'loan',
    event_action: 'approved',
    template_code: 'loan.approved',
    recipient_type: 'member',
    variable_mapping: { loan_id: 'loan_id', member_id: 'member_id', member_name: 'member_name' },
  },
  {
    event_type: 'loan',
    event_action: 'rejected',
    template_code: 'loan.rejected',
    recipient_type: 'member',
    variable_mapping: { loan_id: 'loan_id', member_id: 'member_id', member_name: 'member_name' },
  },
  {
    event_type: 'loan',
    event_action: 'disbursed',
    template_code: 'loan.disbursed',
    recipient_type: 'member',
    variable_mapping: { loan_id: 'loan_id', member_id: 'member_id', member_name: 'member_name' },
  },
  {
    event_type: 'loan',
    event_action: 'repayment_reminder',
    template_code: 'loan.repayment_reminder',
    recipient_type: 'member',
    variable_mapping: { loan_id: 'loan_id', member_id: 'member_id', member_name: 'member_name' },
  },
  {
    event_type: 'loan',
    event_action: 'overdue',
    template_code: 'loan.overdue',
    recipient_type: 'member',
    variable_mapping: { loan_id: 'loan_id', member_id: 'member_id', member_name: 'member_name' },
  },
  {
    event_type: 'loan',
    event_action: 'repayment_complete',
    template_code: 'loan.repayment_complete',
    recipient_type: 'member',
    variable_mapping: { loan_id: 'loan_id', member_id: 'member_id', member_name: 'member_name' },
  },

  // Fine events
  {
    event_type: 'fine',
    event_action: 'issued',
    template_code: 'fine.issued',
    recipient_type: 'member',
    variable_mapping: { fine_id: 'fine_id', member_id: 'member_id', member_name: 'member_name' },
  },
  {
    event_type: 'fine',
    event_action: 'paid',
    template_code: 'fine.paid',
    recipient_type: 'member',
    variable_mapping: { fine_id: 'fine_id', member_id: 'member_id', member_name: 'member_name' },
  },

  // Contribution events
  {
    event_type: 'contribution',
    event_action: 'received',
    template_code: 'contribution.received',
    recipient_type: 'member',
    variable_mapping: { campaign_id: 'campaign_id', member_id: 'member_id', member_name: 'member_name' },
  },
];

export class NotificationEventService {
  private customMappings: EventTemplateMapping[] = [];

  /**
   * Emit a domain event - triggers notifications
   */
  async emit(event: DomainEvent): Promise<string> {
    const supabase = await createServiceClient();

    // Generate event ID for idempotency
    const eventId = uuidv4();

    // Log the event
    await supabase.from('notification_event_logs').insert({
      id: uuidv4(),
      event_id: eventId,
      event_type: event.event_type,
      event_action: event.event_action,
      source_module: event.source_module,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      event_data: event.data,
      actor_id: event.actor_id,
      actor_type: event.actor_type,
      actor_name: event.actor_name,
      status: 'processing',
      received_at: new Date().toISOString(),
    });

    // Find matching template mappings
    const mappings = this.findMatchingMappings(event);

    if (mappings.length === 0) {
      await this.updateEventLogStatus(eventId, 'skipped', 'No matching template mappings');
      return eventId;
    }

    const notificationIds: string[] = [];

    for (const mapping of mappings) {
      try {
        const recipients = await this.resolveRecipients(mapping, event);
        const recipientList = Array.isArray(recipients) ? recipients : [recipients];

        for (const recipient of recipientList) {
          if (!recipient) continue;

          // Build variables from event data
          const variables = this.buildVariables(mapping, event);

          // Send notification
          const result = await notificationService.sendFromTemplate(
            mapping.template_code,
            recipient,
            variables,
            {
              source_module: event.source_module,
              source_entity_type: event.entity_type,
              source_entity_id: event.entity_id,
              source_action: `${event.event_type}.${event.event_action}`,
              idempotency_key: `${eventId}-${recipient.id}-${mapping.template_code}`,
              actor_id: event.actor_id,
              actor_type: event.actor_type,
              actor_name: event.actor_name,
            }
          );

          if (result) {
            notificationIds.push(result.id);
          }
        }
      } catch (error: any) {
        console.error('Failed to process event mapping:', error);
      }
    }

    // Update event log
    await this.updateEventLogStatus(eventId, 'processed', undefined, notificationIds);

    return eventId;
  }

  /**
   * Find matching template mappings for an event
   */
  private findMatchingMappings(event: DomainEvent): EventTemplateMapping[] {
    const allMappings = [...EVENT_TEMPLATE_MAPPINGS, ...this.customMappings];
    
    return allMappings.filter(
      (mapping) =>
        mapping.event_type === event.event_type &&
        mapping.event_action === event.event_action
    );
  }

  /**
   * Resolve recipients for an event
   */
  private async resolveRecipients(
    mapping: EventTemplateMapping,
    event: DomainEvent
  ): Promise<NotificationRecipient[]> {
    if (mapping.recipient_resolver) {
      const result = await mapping.recipient_resolver(event);
      return Array.isArray(result) ? result : [result].filter(Boolean);
    }

    const supabase = await createServiceClient();
    const recipients: NotificationRecipient[] = [];

    switch (mapping.recipient_type) {
      case 'member':
        if (event.data.member_id) {
          const recipient = await this.getMemberRecipient(event.data.member_id as string);
          if (recipient) recipients.push(recipient);
        }
        break;

      case 'user':
        if (event.data.user_id) {
          const recipient = await this.getUserRecipient(event.data.user_id as string);
          if (recipient) recipients.push(recipient);
        }
        break;

      case 'admin':
      case 'all_admins':
        const admins = await this.getAdminRecipients();
        recipients.push(...admins);
        break;

      case 'member_and_admin':
        if (event.data.member_id) {
          const member = await this.getMemberRecipient(event.data.member_id as string);
          if (member) recipients.push(member);
        }
        const adminList = await this.getAdminRecipients();
        recipients.push(...adminList);
        break;
    }

    return recipients;
  }

  /**
   * Get member recipient
   */
  private async getMemberRecipient(memberId: string): Promise<NotificationRecipient | null> {
    const supabase = await createServiceClient();
    
    const { data: member } = await supabase
      .from('members')
      .select('id, first_name, last_name, email, phone')
      .eq('id', memberId)
      .single();

    if (!member) return null;

    return {
      id: member.id,
      type: 'member',
      email: member.email || undefined,
      phone: member.phone || undefined,
      name: `${member.first_name} ${member.last_name}`,
    };
  }

  /**
   * Get user recipient
   */
  private async getUserRecipient(userId: string): Promise<NotificationRecipient | null> {
    const supabase = await createServiceClient();
    
    const { data: user } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('id', userId)
      .single();

    if (!user) return null;

    return {
      id: user.id,
      type: 'user',
      email: user.email || undefined,
      name: user.full_name,
    };
  }

  /**
   * Get all admin recipients
   */
  private async getAdminRecipients(): Promise<NotificationRecipient[]> {
    const supabase = await createServiceClient();
    
    const { data: admins } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('role', ['admin', 'super_admin'])
      .eq('is_active', true);

    return (admins || []).map((admin) => ({
      id: admin.id,
      type: 'user' as const,
      email: admin.email,
      name: admin.full_name,
    }));
  }

  /**
   * Build variables from event data
   */
  private buildVariables(mapping: EventTemplateMapping, event: DomainEvent): Record<string, unknown> {
    const variables: Record<string, unknown> = {};

    if (mapping.variable_mapping) {
      for (const [varName, dataKey] of Object.entries(mapping.variable_mapping)) {
        variables[varName] = event.data[dataKey];
      }
    }

    // Add common variables
    variables.event_timestamp = new Date().toISOString();
    variables.source_module = event.source_module;

    return variables;
  }

  /**
   * Update event log status
   */
  private async updateEventLogStatus(
    eventId: string,
    status: string,
    error?: string,
    notificationIds?: string[]
  ): Promise<void> {
    const supabase = await createServiceClient();

    await supabase
      .from('notification_event_logs')
      .update({
        status,
        processing_error: error,
        matched_templates: notificationIds?.length || 0,
        created_notifications: notificationIds || [],
        processed_at: new Date().toISOString(),
      })
      .eq('event_id', eventId);
  }

  /**
   * Register custom event template mapping
   */
  registerMapping(mapping: EventTemplateMapping): void {
    // Remove existing mapping for same event type/action
    this.customMappings = this.customMappings.filter(
      (m) => !(m.event_type === mapping.event_type && m.event_action === mapping.event_action)
    );
    
    this.customMappings.push(mapping);
  }

  /**
   * Get event logs
   */
  async getEventLogs(options?: {
    event_type?: string;
    event_action?: string;
    source_module?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const supabase = await createServiceClient();
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    let query = supabase
      .from('notification_event_logs')
      .select('*', { count: 'exact' })
      .order('received_at', { ascending: false });

    if (options?.event_type) query = query.eq('event_type', options.event_type);
    if (options?.event_action) query = query.eq('event_action', options.event_action);
    if (options?.source_module) query = query.eq('source_module', options.source_module);
    if (options?.status) query = query.eq('status', options.status);

    const { data, count } = await query.range(offset, offset + limit - 1);

    return {
      events: data || [],
      total: count || 0,
      limit,
      offset,
    };
  }

  /**
   * Pre-defined event emitter helpers
   */
  async emitMemberRegistered(memberId: string, memberData: any, actorId?: string): Promise<string> {
    return this.emit({
      event_type: 'member',
      event_action: 'registered',
      source_module: 'member-management',
      entity_type: 'member',
      entity_id: memberId,
      data: {
        member_id: memberId,
        member_name: `${memberData.first_name} ${memberData.last_name}`,
        member_number: memberData.member_number,
        phone: memberData.phone,
        email: memberData.email,
        registration_date: memberData.registration_date,
      },
      actor_id: actorId,
      actor_type: 'user',
    });
  }

  async emitLoanApplication(loanId: string, loanData: any, memberData: any, actorId?: string): Promise<string> {
    return this.emit({
      event_type: 'loan',
      event_action: 'application_received',
      source_module: 'loan-management',
      entity_type: 'loan',
      entity_id: loanId,
      data: {
        loan_id: loanId,
        loan_number: loanData.loan_number,
        member_id: memberData.id,
        member_name: `${memberData.first_name} ${memberData.last_name}`,
        amount: loanData.principal_amount,
        loan_type: loanData.loan_type,
        application_date: loanData.application_date || new Date().toISOString().split('T')[0],
      },
      actor_id: actorId,
      actor_type: 'user',
    });
  }

  async emitSavingsDeposit(
    memberId: string,
    memberName: string,
    amount: number,
    newBalance: number,
    transactionRef: string
  ): Promise<string> {
    return this.emit({
      event_type: 'savings',
      event_action: 'deposit',
      source_module: 'savings-management',
      entity_type: 'member',
      entity_id: memberId,
      data: {
        member_id: memberId,
        member_name: memberName,
        amount,
        new_balance: newBalance,
        transaction_ref: transactionRef,
        date: new Date().toISOString(),
      },
    });
  }

  async emitLoanRepaymentReminder(loanId: string, loanData: any, memberData: any): Promise<string> {
    return this.emit({
      event_type: 'loan',
      event_action: 'repayment_reminder',
      source_module: 'loan-management',
      entity_type: 'loan',
      entity_id: loanId,
      data: {
        loan_id: loanId,
        loan_number: loanData.loan_number,
        member_id: memberData.id,
        member_name: `${memberData.first_name} ${memberData.last_name}`,
        amount_due: loanData.monthly_repayment,
        due_date: loanData.repayment_end_date,
        remaining_balance: loanData.amount_due,
      },
    });
  }

  async emitLoanOverdue(loanId: string, loanData: any, memberData: any, daysOverdue: number): Promise<string> {
    return this.emit({
      event_type: 'loan',
      event_action: 'overdue',
      source_module: 'loan-management',
      entity_type: 'loan',
      entity_id: loanId,
      data: {
        loan_id: loanId,
        loan_number: loanData.loan_number,
        member_id: memberData.id,
        member_name: `${memberData.first_name} ${memberData.last_name}`,
        amount_overdue: loanData.amount_due,
        days_overdue: daysOverdue,
      },
    });
  }
}

export const notificationEventService = new NotificationEventService();
