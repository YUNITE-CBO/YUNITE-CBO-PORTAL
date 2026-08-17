/**
 * NOTIFICATION SERVICE - Enterprise Notification Engine
 * 
 * Centralized notification system for all YUNITE modules.
 * Handles internal notifications, email delivery, and event processing.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { notificationEventService } from './event.service';
import { emailService } from './email.service';
import { settingsService } from '../settings.service';

export type NotificationChannel = 'in_app' | 'email' | 'sms';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type RecipientType = 'member' | 'user' | 'admin' | 'all_admins' | 'system' | 'bulk_members';
export type NotificationStatus = 'pending' | 'queued' | 'processing' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled';

export interface NotificationData {
  template_code?: string;
  category_code?: string;
  subject: string;
  body: string;
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
  recipient_type: RecipientType;
  recipient_id?: string;
  recipient_email?: string | string[];
  recipient_phone?: string;
  recipient_name?: string;
  source_module?: string;
  source_entity_type?: string;
  source_entity_id?: string;
  source_action?: string;
  scheduled_for?: Date;
  variables?: Record<string, unknown>;
  idempotency_key?: string;
  actor_id?: string;
  actor_type?: string;
  actor_name?: string;
  created_by?: string;
}

export interface NotificationRecipient {
  id: string;
  type: 'member' | 'user';
  email?: string;
  phone?: string;
  name: string;
}

export class NotificationService {
  /**
   * Create and send a notification
   */
  async send(data: NotificationData): Promise<{ id: string; ref: string } | null> {
    const supabase = await createServiceClient();

    // Handle bulk members - send notification to each recipient
    if (data.recipient_type === 'bulk_members' && Array.isArray(data.recipient_email) && data.recipient_email.length > 0) {
      const results = [];
      for (const email of data.recipient_email) {
        const result = await this.send({
          ...data,
          recipient_type: 'member', // Treat as member for individual notification
          recipient_email: email,
          recipient_id: undefined,
        });
        if (result) {
          results.push(result);
        }
      }
      // Return the first result for backward compatibility
      return results[0] || null;
    }

    // Check idempotency
    if (data.idempotency_key) {
      const { data: existing } = await supabase
        .from('notifications')
        .select('id, notification_ref')
        .eq('idempotency_key', data.idempotency_key)
        .single();
      
      if (existing) {
        console.log('Duplicate notification skipped:', data.idempotency_key);
        return { id: existing.id, ref: existing.notification_ref };
      }
    }

    // Get category ID
    let categoryId = null;
    if (data.category_code) {
      const { data: category } = await supabase
        .from('notification_categories')
        .select('id')
        .eq('code', data.category_code)
        .single();
      categoryId = category?.id || null;
    }

    // Get template ID if provided
    let templateId = null;
    if (data.template_code) {
      const { data: template } = await supabase
        .from('notification_templates')
        .select('id')
        .eq('template_code', data.template_code)
        .eq('is_active', true)
        .single();
      templateId = template?.id || null;
    }

    // Resolve recipient details if not provided
    if (data.recipient_type === 'member' && data.recipient_id && !data.recipient_email) {
      const recipient = await this.getMemberRecipient(data.recipient_id);
      if (recipient) {
        data.recipient_email = data.recipient_email || recipient.email;
        data.recipient_phone = data.recipient_phone || recipient.phone;
        data.recipient_name = data.recipient_name || recipient.name;
      }
    }

    if (data.recipient_type === 'user' && data.recipient_id && !data.recipient_email) {
      const recipient = await this.getUserRecipient(data.recipient_id);
      if (recipient) {
        data.recipient_email = data.recipient_email || recipient.email;
        data.recipient_name = data.recipient_name || recipient.name;
      }
    }

    // Generate notification reference
    const notificationRef = this.generateNotificationRef();

    // Normalize recipient_email to string for database
    const recipientEmail = Array.isArray(data.recipient_email) ? data.recipient_email[0] : data.recipient_email;

    // Create notification record
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        id: uuidv4(),
        notification_ref: notificationRef,
        template_id: templateId,
        template_code: data.template_code,
        category_id: categoryId,
        subject: data.subject,
        body: data.body,
        // Legacy title/message kept in sync by the migration 028 trigger, but
        // populate them here too for DBs where the trigger is not yet applied.
        title: data.subject,
        message: data.body,
        rendered_variables: data.variables || {},
        priority: data.priority || 'normal',
        recipient_type: data.recipient_type,
        recipient_id: data.recipient_id,
        recipient_email: recipientEmail,
        recipient_phone: data.recipient_phone,
        recipient_name: data.recipient_name,
        source_module: data.source_module,
        source_entity_type: data.source_entity_type,
        source_entity_id: data.source_entity_id,
        source_action: data.source_action,
        scheduled_for: data.scheduled_for?.toISOString() || null,
        status: data.scheduled_for ? 'pending' : 'queued',
        idempotency_key: data.idempotency_key,
        actor_id: data.actor_id,
        actor_type: data.actor_type,
        actor_name: data.actor_name,
        created_by: data.created_by,
      })
      .select()
      .single();

    if (error || !notification) {
      console.error('Failed to create notification:', {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code
      });
      return null;
    }

    // Queue for delivery
    const channels = data.channels || ['in_app'];
    const hasInApp = channels.includes('in_app');
    
    if (channels.includes('email') && recipientEmail) {
      await this.queueEmail(notification);
    }

    // Log event
    await this.logDelivery(notification, 'in_app', 'queued');

    // Final status: the in-app channel is delivered synchronously (the row is
    // now readable by the recipient), so mark 'sent' when in_app is active.
    // For email-only notifications, do NOT override the status here — the
    // email queue processing above already set 'delivered' (success) or
    // 'failed' (failure), and overriding would mask a real email failure.
    if (hasInApp) {
      await supabase
        .from('notifications')
        .update({ status: 'sent' })
        .eq('id', notification.id);
    }

    return { id: notification.id, ref: notification.notification_ref };
  }

  /**
   * Send notification from template
   */
  async sendFromTemplate(
    templateCode: string,
    recipient: NotificationRecipient,
    variables: Record<string, unknown>,
    options?: {
      source_module?: string;
      source_entity_type?: string;
      source_entity_id?: string;
      source_action?: string;
      scheduled_for?: Date;
      priority?: NotificationPriority;
      channels?: NotificationChannel[];
      idempotency_key?: string;
      actor_id?: string;
      actor_type?: string;
      actor_name?: string;
    }
  ): Promise<{ id: string; ref: string } | null> {
    const supabase = await createServiceClient();

    // Get template
    const { data: template } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('template_code', templateCode)
      .eq('is_active', true)
      .single();

    if (!template) {
      console.error('Template not found:', templateCode);
      return null;
    }

    // Render template
    const subject = this.renderTemplate(template.subject_template, variables);
    const body = this.renderTemplate(template.body_template, variables);

    // Get category code
    const categoryCode = await this.getCategoryCode(template.category_id);

    return this.send({
      template_code: templateCode,
      category_code: categoryCode,
      subject,
      body,
      priority: options?.priority || (template.priority as NotificationPriority) || 'normal',
      channels: options?.channels || (template.channels as NotificationChannel[]),
      recipient_type: recipient.type,
      recipient_id: recipient.id,
      recipient_email: recipient.email,
      recipient_phone: recipient.phone,
      recipient_name: recipient.name,
      source_module: options?.source_module,
      source_entity_type: options?.source_entity_type,
      source_entity_id: options?.source_entity_id,
      source_action: options?.source_action,
      scheduled_for: options?.scheduled_for,
      variables,
      idempotency_key: options?.idempotency_key,
      actor_id: options?.actor_id,
      actor_type: options?.actor_type,
      actor_name: options?.actor_name,
    });
  }

  /**
   * Queue email for delivery
   */
  private async queueEmail(notification: any): Promise<void> {
    const supabase = await createServiceClient();

    await supabase.from('email_queue').insert({
      id: uuidv4(),
      notification_id: notification.id,
      to_email: notification.recipient_email,
      to_name: notification.recipient_name,
      subject: notification.subject ?? notification.title,
      html_body: notification.body ?? notification.message,
      text_body: (notification.body ?? notification.message ?? '').replace(/<[^>]*>/g, ''),
      from_email: await settingsService.get('smtp.from_email') || 'noreply@yunite.ke',
      from_name: await settingsService.get('smtp.from_name') || 'YUNITE',
      priority: notification.priority === 'urgent' ? 10 : notification.priority === 'high' ? 8 : 5,
      scheduled_for: notification.scheduled_for || new Date().toISOString(),
    });

    // Process email immediately
    await emailService.processQueue();
  }

  /**
   * Log delivery history
   */
  private async logDelivery(
    notification: any,
    channel: string,
    status: string,
    additionalData?: Record<string, unknown>
  ): Promise<void> {
    const supabase = await createServiceClient();

    await supabase.from('notification_delivery_history').insert({
      id: uuidv4(),
      notification_id: notification.id,
      channel,
      recipient: notification.recipient_email || notification.recipient_id || 'unknown',
      recipient_name: notification.recipient_name,
      subject: notification.subject ?? notification.title,
      body_preview: (notification.body ?? notification.message ?? '').substring(0, 200),
      status,
      queued_at: status === 'queued' ? new Date().toISOString() : undefined,
      sent_at: status === 'sent' ? new Date().toISOString() : undefined,
      delivered_at: status === 'delivered' ? new Date().toISOString() : undefined,
      ...additionalData,
    });
  }

  /**
   * Get member details for notification
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
   * Get user details for notification
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
   * Get category code from ID
   */
  private async getCategoryCode(categoryId: string | null): Promise<string | undefined> {
    if (!categoryId) return undefined;
    
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('notification_categories')
      .select('code')
      .eq('id', categoryId)
      .single();
    
    return data?.code;
  }

  /**
   * Render template with variables
   */
  private renderTemplate(template: string, variables: Record<string, unknown>): string {
    let rendered = template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      const stringValue = value !== null && value !== undefined ? String(value) : '';
      rendered = rendered.split(placeholder).join(stringValue);
    }
    return rendered;
  }

  /**
   * Generate notification reference
   */
  private generateNotificationRef(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = uuidv4().split('-')[0].toUpperCase();
    return `NTF-${date}-${random}`;
  }

  /**
   * Get notifications for a recipient
   */
  async getForRecipient(
    recipientId: string,
    recipientType: 'member' | 'user',
    options?: {
      status?: NotificationStatus;
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
    }
  ) {
    const supabase = await createServiceClient();
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('recipient_id', recipientId)
      .eq('recipient_type', recipientType);

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    if (options?.unreadOnly) {
      query = query.neq('status', 'read');
    }

    const { data, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    return {
      notifications: data || [],
      total: count || 0,
      limit,
      offset,
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    const supabase = await createServiceClient();

    await supabase
      .from('notifications')
      .update({ 
        status: 'read',
        read_at: new Date().toISOString(),
      })
      .eq('id', notificationId);
  }

  /**
   * Mark all as read for recipient
   */
  async markAllAsRead(recipientId: string, recipientType: 'member' | 'user'): Promise<void> {
    const supabase = await createServiceClient();

    await supabase
      .from('notifications')
      .update({ 
        status: 'read',
        read_at: new Date().toISOString(),
      })
      .eq('recipient_id', recipientId)
      .eq('recipient_type', recipientType)
      .neq('status', 'read');
  }

  /**
   * Get unread count
   */
  async getUnreadCount(recipientId: string, recipientType: 'member' | 'user'): Promise<number> {
    const supabase = await createServiceClient();

    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', recipientId)
      .eq('recipient_type', recipientType)
      .neq('status', 'read');

    return count || 0;
  }

  /**
   * Get notification by ID
   */
  async getById(notificationId: string) {
    const supabase = await createServiceClient();

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', notificationId)
      .single();

    return data;
  }

  /**
   * Cancel notification
   */
  async cancel(notificationId: string): Promise<void> {
    const supabase = await createServiceClient();

    await supabase
      .from('notifications')
      .update({ status: 'cancelled' })
      .eq('id', notificationId)
      .eq('status', 'pending');

    // Cancel any queued emails
    await supabase
      .from('email_queue')
      .update({ status: 'cancelled' })
      .eq('notification_id', notificationId)
      .eq('status', 'pending');
  }

  /**
   * Retry failed notification
   */
  async retry(notificationId: string): Promise<void> {
    const supabase = await createServiceClient();

    const { data: notification } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', notificationId)
      .eq('status', 'failed')
      .single();

    if (!notification) return;

    await supabase
      .from('notifications')
      .update({ 
        status: 'pending',
        retry_count: notification.retry_count + 1,
        error_message: null,
      })
      .eq('id', notificationId);

    // Re-queue email if applicable
    if (notification.recipient_email) {
      await this.queueEmail(notification);
    }
  }

  /**
   * Get delivery history for notification
   */
  async getDeliveryHistory(notificationId: string) {
    const supabase = await createServiceClient();

    const { data } = await supabase
      .from('notification_delivery_history')
      .select('*')
      .eq('notification_id', notificationId)
      .order('created_at', { ascending: true });

    return data || [];
  }

  /**
   * Process scheduled notifications
   */
  async processScheduled(): Promise<void> {
    const supabase = await createServiceClient();

    // Get pending notifications past scheduled time
    const { data: notifications } = await supabase
      .from('notifications')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .limit(100);

    if (!notifications?.length) return;

    for (const notification of notifications) {
      await supabase
        .from('notifications')
        .update({ status: 'queued' })
        .eq('id', notification.id);

      if (notification.recipient_email) {
        await this.queueEmail(notification);
      }
    }
  }
}

export const notificationService = new NotificationService();
