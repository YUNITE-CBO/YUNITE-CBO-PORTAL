/**
 * SCHEDULE SERVICE - Scheduled Notification Management
 * 
 * Handles recurring and one-time scheduled notifications.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { notificationService, NotificationRecipient } from './notification.service';
import { statementService } from './statement.service';

export type ScheduleType = 'once' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom';
export type RecipientFilterType = 'all_members' | 'active_members' | 'specific_members' | 'admins' | 'specific_users' | 'loans_overdue' | 'welfare_pending';

export interface ScheduleData {
  schedule_code: string;
  name: string;
  description?: string;
  category_id?: string;
  schedule_type: ScheduleType;
  cron_expression?: string;
  scheduled_time?: string;
  timezone?: string;
  start_date?: string;
  end_date?: string;
  template_id: string;
  conditions?: Record<string, unknown>;
  recipient_type: RecipientFilterType;
  recipient_filter?: Record<string, unknown>;
  is_active?: boolean;
  created_by?: string;
}

export interface ScheduleRun {
  schedule_id: string;
  run_at: Date;
  recipients_processed: number;
  notifications_created: number;
  errors: string[];
}

export class ScheduleService {
  /**
   * Create a new schedule
   */
  async create(data: ScheduleData): Promise<any> {
    const supabase = await createServiceClient();

    const nextRun = this.calculateNextRun(data);

    const { data: schedule, error } = await supabase
      .from('notification_schedules')
      .insert({
        id: uuidv4(),
        schedule_code: data.schedule_code,
        name: data.name,
        description: data.description,
        category_id: data.category_id,
        schedule_type: data.schedule_type,
        cron_expression: data.cron_expression,
        scheduled_time: data.scheduled_time,
        timezone: data.timezone || 'Africa/Nairobi',
        start_date: data.start_date,
        end_date: data.end_date,
        template_id: data.template_id,
        conditions: data.conditions || {},
        recipient_type: data.recipient_type,
        recipient_filter: data.recipient_filter || {},
        is_active: data.is_active !== false,
        next_run_at: nextRun?.toISOString(),
        created_by: data.created_by,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create schedule: ${error.message}`);
    }

    return schedule;
  }

  /**
   * Get schedule by ID
   */
  async getById(scheduleId: string) {
    const supabase = await createServiceClient();

    const { data } = await supabase
      .from('notification_schedules')
      .select('*, template:notification_templates(*)')
      .eq('id', scheduleId)
      .single();

    return data;
  }

  /**
   * Get all schedules
   */
  async getAll(options?: {
    is_active?: boolean;
    category_id?: string;
    limit?: number;
    offset?: number;
  }) {
    const supabase = await createServiceClient();
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    let query = supabase
      .from('notification_schedules')
      .select('*, template:notification_templates(id, template_code, name)', { count: 'exact' });

    if (options?.is_active !== undefined) {
      query = query.eq('is_active', options.is_active);
    }

    if (options?.category_id) {
      query = query.eq('category_id', options.category_id);
    }

    const { data, count } = await query
      .order('name')
      .range(offset, offset + limit - 1);

    return {
      schedules: data || [],
      total: count || 0,
      limit,
      offset,
    };
  }

  /**
   * Update schedule
   */
  async update(scheduleId: string, data: Partial<ScheduleData>): Promise<any> {
    const supabase = await createServiceClient();

    const updateData: Record<string, unknown> = { ...data };
    
    // Recalculate next run if schedule timing changed
    if (data.schedule_type || data.scheduled_time || data.cron_expression) {
      const current = await this.getById(scheduleId);
      const merged = { ...current, ...data };
      updateData.next_run_at = this.calculateNextRun(merged as ScheduleData)?.toISOString();
    }

    const { data: schedule, error } = await supabase
      .from('notification_schedules')
      .update(updateData)
      .eq('id', scheduleId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update schedule: ${error.message}`);
    }

    return schedule;
  }

  /**
   * Delete schedule (soft delete)
   */
  async delete(scheduleId: string): Promise<void> {
    const supabase = await createServiceClient();

    await supabase
      .from('notification_schedules')
      .update({ is_active: false })
      .eq('id', scheduleId);
  }

  /**
   * Activate schedule
   */
  async activate(scheduleId: string): Promise<void> {
    const supabase = await createServiceClient();

    const schedule = await this.getById(scheduleId);
    if (!schedule) return;

    const nextRun = this.calculateNextRun(schedule);

    await supabase
      .from('notification_schedules')
      .update({ is_active: true, next_run_at: nextRun?.toISOString() })
      .eq('id', scheduleId);
  }

  /**
   * Deactivate schedule
   */
  async deactivate(scheduleId: string): Promise<void> {
    const supabase = await createServiceClient();

    await supabase
      .from('notification_schedules')
      .update({ is_active: false, next_run_at: null })
      .eq('id', scheduleId);
  }

  /**
   * Process due schedules
   */
  async processDueSchedules(): Promise<ScheduleRun[]> {
    const supabase = await createServiceClient();
    const runs: ScheduleRun[] = [];

    // Get all active schedules that are due
    const { data: schedules } = await supabase
      .from('notification_schedules')
      .select('*')
      .eq('is_active', true)
      .lte('next_run_at', new Date().toISOString())
      .or(`end_date.is.null,end_date.gte.${new Date().toISOString().split('T')[0]}`);

    if (!schedules?.length) return runs;

    for (const schedule of schedules) {
      try {
        const run = await this.executeSchedule(schedule);
        runs.push(run);
      } catch (error: any) {
        console.error(`Schedule execution failed: ${schedule.id}`, error);
        runs.push({
          schedule_id: schedule.id,
          run_at: new Date(),
          recipients_processed: 0,
          notifications_created: 0,
          errors: [error.message],
        });
      }
    }

    return runs;
  }

  /**
   * Execute a schedule
   */
  private async executeSchedule(schedule: any): Promise<ScheduleRun> {
    const supabase = await createServiceClient();
    const runAt = new Date();
    const errors: string[] = [];
    let recipientsProcessed = 0;
    let notificationsCreated = 0;

    // Get recipients based on filter
    const recipients = await this.getRecipients(schedule.recipient_type, schedule.recipient_filter);

    // Get template
    const { data: template } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('id', schedule.template_id)
      .eq('is_active', true)
      .single();

    if (!template) {
      errors.push('Template not found or inactive');
      return { schedule_id: schedule.id, run_at: runAt, recipients_processed: 0, notifications_created: 0, errors };
    }

    // Process each recipient
    for (const recipient of recipients) {
      recipientsProcessed++;

      try {
        // Build variables for this recipient
        const variables = await this.buildRecipientVariables(recipient, schedule);

        // Send notification
        const result = await notificationService.sendFromTemplate(
          template.template_code,
          recipient,
          variables,
          {
            source_module: 'schedule',
            source_entity_type: 'schedule',
            source_entity_id: schedule.id,
            source_action: `schedule.${schedule.schedule_type}`,
            idempotency_key: `schedule-${schedule.id}-${recipient.id}-${runAt.toISOString()}`,
          }
        );

        if (result) {
          notificationsCreated++;
        }
      } catch (error: any) {
        errors.push(`Failed for ${recipient.id}: ${error.message}`);
      }
    }

    // Update schedule with next run time
    const nextRun = this.calculateNextRun(schedule);
    await supabase
      .from('notification_schedules')
      .update({
        last_run_at: runAt.toISOString(),
        next_run_at: nextRun?.toISOString(),
        run_count: (schedule.run_count || 0) + 1,
      })
      .eq('id', schedule.id);

    return { schedule_id: schedule.id, run_at: runAt, recipients_processed: recipientsProcessed, notifications_created: notificationsCreated, errors };
  }

  /**
   * Get recipients based on filter type
   */
  private async getRecipients(
    recipientType: RecipientFilterType,
    filter: Record<string, unknown>
  ): Promise<NotificationRecipient[]> {
    const supabase = await createServiceClient();

    switch (recipientType) {
      case 'all_members':
      case 'active_members': {
        let query = supabase
          .from('members')
          .select('id, first_name, last_name, email, phone');

        if (recipientType === 'active_members') {
          query = query.eq('status', 'active');
        }

        const { data: members } = await query;
        return (members || []).map(m => ({
          id: m.id,
          type: 'member' as const,
          email: m.email,
          phone: m.phone,
          name: `${m.first_name} ${m.last_name}`,
        }));
      }

      case 'admins': {
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name, email')
          .in('role', ['admin', 'super_admin'])
          .eq('is_active', true);

        return (users || []).map(u => ({
          id: u.id,
          type: 'user' as const,
          email: u.email,
          name: u.full_name,
        }));
      }

      case 'loans_overdue': {
        const { data: loans } = await supabase
          .from('loans')
          .select('*, member:members(id, first_name, last_name, email, phone)')
          .eq('status', 'active');

        const overdueLoans = (loans || []).filter(l => {
          if (!l.repayment_end_date) return false;
          return new Date(l.repayment_end_date) < new Date();
        });

        return overdueLoans.map(l => ({
          id: l.member.id,
          type: 'member' as const,
          email: l.member.email,
          phone: l.member.phone,
          name: `${l.member.first_name} ${l.member.last_name}`,
        }));
      }

      default:
        return [];
    }
  }

  /**
   * Build variables for a recipient
   */
  private async buildRecipientVariables(
    recipient: NotificationRecipient,
    schedule: any
  ): Promise<Record<string, unknown>> {
    const variables: Record<string, unknown> = {
      recipient_id: recipient.id,
      recipient_name: recipient.name,
      schedule_name: schedule.name,
      schedule_code: schedule.schedule_code,
    };

    // Add member-specific data if applicable
    if (recipient.type === 'member') {
      const supabase = await createServiceClient();
      
      const { data: member } = await supabase
        .from('members')
        .select('*')
        .eq('id', recipient.id)
        .single();

      if (member) {
        variables.member_id = member.id;
        variables.member_number = member.member_number;
        variables.organization_name = await this.getOrganizationName();
      }
    }

    return variables;
  }

  /**
   * Get organization name
   */
  private async getOrganizationName(): Promise<string> {
    const supabase = await createServiceClient();
    
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'organization.name')
      .single();

    return data?.value || 'YUNITE CBO';
  }

  /**
   * Calculate next run time
   */
  private calculateNextRun(schedule: any): Date | null {
    const now = new Date();
    const timezone = schedule.timezone || 'Africa/Nairobi';

    // Handle one-time schedules
    if (schedule.schedule_type === 'once') {
      if (schedule.start_date) {
        const scheduledDate = new Date(schedule.start_date);
        if (schedule.scheduled_time) {
          const [hours, minutes] = schedule.scheduled_time.split(':');
          scheduledDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        }
        if (scheduledDate > now) {
          return scheduledDate;
        }
      }
      return null;
    }

    // Parse scheduled time
    const scheduledTime = schedule.scheduled_time ? schedule.scheduled_time.split(':') : ['09', '00'];
    const hour = parseInt(scheduledTime[0]);
    const minute = parseInt(scheduledTime[1]);

    let nextRun = new Date(now);
    nextRun.setHours(hour, minute, 0, 0);

    // Adjust based on schedule type
    switch (schedule.schedule_type) {
      case 'daily':
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        break;

      case 'weekly':
        // Assuming scheduled_time also contains day info or default to Monday
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 7);
        }
        break;

      case 'monthly':
        if (nextRun <= now) {
          nextRun.setMonth(nextRun.getMonth() + 1);
        }
        break;

      case 'quarterly':
        if (nextRun <= now) {
          nextRun.setMonth(nextRun.getMonth() + 3);
        }
        break;

      case 'annual':
        if (nextRun <= now) {
          nextRun.setFullYear(nextRun.getFullYear() + 1);
        }
        break;

      case 'custom':
        // Use cron expression if provided
        // For simplicity, default to daily
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        break;
    }

    // Check end date
    if (schedule.end_date && nextRun > new Date(schedule.end_date)) {
      return null;
    }

    return nextRun;
  }

  /**
   * Get schedule execution history
   */
  async getExecutionHistory(scheduleId: string, limit: number = 10) {
    // For now, return recent notifications created by this schedule
    const supabase = await createServiceClient();

    const { data: notifications } = await supabase
      .from('notifications')
      .select('id, notification_ref, subject, recipient_name, status, created_at')
      .eq('source_entity_id', scheduleId)
      .eq('source_module', 'schedule')
      .order('created_at', { ascending: false })
      .limit(limit);

    return {
      schedule_id: scheduleId,
      recent_notifications: notifications || [],
    };
  }
}

export const scheduleService = new ScheduleService();
