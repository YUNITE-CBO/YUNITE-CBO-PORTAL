/**
 * EMAIL SERVICE - SMTP Email Delivery Engine
 * 
 * Handles all email delivery with retry logic, tracking, and logging.
 */

import nodemailer from 'nodemailer';
import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { settingsService } from '../settings.service';

export interface EmailMessage {
  to: string;
  toName?: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured: boolean = false;

  /**
   * Initialize SMTP transporter
   */
  private async initializeTransporter(): Promise<boolean> {
    if (this.transporter) return this.isConfigured;

    try {
      // Try database settings first, then fallback to environment variables
      const host = await settingsService.get('smtp.host') || process.env.SMTP_HOST;
      const port = await settingsService.getNumber('smtp.port', parseInt(process.env.SMTP_PORT || '587'));
      const secure = (await settingsService.get('smtp.secure') || process.env.SMTP_SECURE || 'false') === 'true';
      const user = await settingsService.get('smtp.user') || process.env.SMTP_USER;
      const password = await settingsService.get('smtp.password') || process.env.SMTP_PASS;

      if (!host || !user) {
        console.error('SMTP not configured - missing host or user');
        this.isConfigured = false;
        return false;
      }

      if (!password) {
        console.error('SMTP not configured - missing password');
        this.isConfigured = false;
        return false;
      }

      this.transporter = nodemailer.createTransport({
        host: host,
        port: port,
        secure: secure,
        auth: {
          user: user,
          pass: password,
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
      } as any);

      this.isConfigured = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize SMTP transporter:', error);
      this.isConfigured = false;
      return false;
    }
  }

  /**
   * Send email directly
   */
  async send(message: EmailMessage): Promise<EmailDeliveryResult> {
    const configured = await this.initializeTransporter();
    if (!configured || !this.transporter) {
      return { success: false, error: 'SMTP not configured' };
    }

    // Try database first, then environment variables, then defaults
    const fromEmail = message.from 
      || await settingsService.get('smtp.from_email') 
      || process.env.SMTP_FROM_EMAIL 
      || process.env.SMTP_USER 
      || 'noreply@yunite.ke';
    const fromName = message.fromName 
      || await settingsService.get('smtp.from_name') 
      || process.env.SMTP_FROM_NAME 
      || 'YUNITE';
    const replyTo = message.replyTo 
      || await settingsService.get('smtp.reply_to') 
      || process.env.SMTP_REPLY_TO 
      || undefined;

    try {
      const info = await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: message.toName ? `"${message.toName}" <${message.to}>` : message.to,
        cc: message.cc?.join(', '),
        bcc: message.bcc?.join(', '),
        subject: message.subject,
        html: message.htmlBody,
        text: message.textBody || message.htmlBody.replace(/<[^>]*>/g, ''),
        replyTo,
        attachments: message.attachments,
      });

      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      console.error('Email send error:', error);
      return { success: false, error: error.message || 'Failed to send email' };
    }
  }

  /**
   * Process email queue
   */
  async processQueue(batchSize: number = 10): Promise<{ processed: number; succeeded: number; failed: number }> {
    const supabase = await createServiceClient();

    const configured = await this.initializeTransporter();
    if (!configured) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    // Get pending emails
    const { data: emails } = await supabase
      .from('email_queue')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('scheduled_for', { ascending: true })
      .limit(batchSize);

    if (!emails?.length) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    let succeeded = 0;
    let failed = 0;

    for (const email of emails) {
      // Mark as processing
      await supabase
        .from('email_queue')
        .update({ 
          status: 'processing',
          processing_started_at: new Date().toISOString(),
        })
        .eq('id', email.id);

      try {
        const result = await this.send({
          to: email.to_email,
          toName: email.to_name || undefined,
          cc: email.cc_email || undefined,
          bcc: email.bcc_email || undefined,
          subject: email.subject,
          htmlBody: email.html_body || email.text_body || '',
          textBody: email.text_body || undefined,
          from: email.from_email || undefined,
          fromName: email.from_name || undefined,
          replyTo: email.reply_to || undefined,
        });

        if (result.success) {
          await supabase
            .from('email_queue')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              smtp_message_id: result.messageId,
            })
            .eq('id', email.id);

          // Update notification status
          if (email.notification_id) {
            await supabase
              .from('notifications')
              .update({
                status: 'delivered',
                delivered_at: new Date().toISOString(),
              })
              .eq('id', email.notification_id);
          }

          // Log delivery
          await this.logDelivery(email, 'sent', result.messageId);
          succeeded++;
        } else {
          await this.handleEmailFailure(email, result.error || 'Unknown error', supabase);
          failed++;
        }
      } catch (error: any) {
        await this.handleEmailFailure(email, error.message || 'Unknown error', supabase);
        failed++;
      }
    }

    return { processed: emails.length, succeeded, failed };
  }

  /**
   * Handle email delivery failure
   */
  private async handleEmailFailure(
    email: any,
    errorMessage: string,
    supabase: any
  ): Promise<void> {
    const maxRetries = email.max_retries || 3;
    const newRetryCount = (email.retry_count || 0) + 1;

    if (newRetryCount >= maxRetries) {
      // Mark as failed
      await supabase
        .from('email_queue')
        .update({
          status: 'failed',
          error_message: errorMessage,
          last_attempt_at: new Date().toISOString(),
          retry_count: newRetryCount,
        })
        .eq('id', email.id);

      // Update notification status
      if (email.notification_id) {
        await supabase
          .from('notifications')
          .update({
            status: 'failed',
            error_message: errorMessage,
            retry_count: newRetryCount,
          })
          .eq('id', email.notification_id);
      }
    } else {
      // Schedule retry
      const retryDelayMinutes = await settingsService.getNumber('notifications.retry_delay_minutes', 30);
      const nextRetry = new Date();
      nextRetry.setMinutes(nextRetry.getMinutes() + retryDelayMinutes);

      await supabase
        .from('email_queue')
        .update({
          status: 'pending',
          error_message: errorMessage,
          last_attempt_at: new Date().toISOString(),
          retry_count: newRetryCount,
          scheduled_for: nextRetry.toISOString(),
        })
        .eq('id', email.id);
    }

    // Log failure
    await this.logDelivery(email, 'failed', undefined, errorMessage);
  }

  /**
   * Log email delivery
   */
  private async logDelivery(
    email: any,
    status: string,
    messageId?: string,
    errorMessage?: string
  ): Promise<void> {
    const supabase = await createServiceClient();

    await supabase.from('notification_delivery_history').insert({
      id: uuidv4(),
      email_queue_id: email.id,
      notification_id: email.notification_id,
      channel: 'email',
      recipient: email.to_email,
      recipient_name: email.to_name,
      subject: email.subject,
      body_preview: (email.html_body || email.text_body || '').substring(0, 200),
      status,
      queued_at: email.created_at,
      sent_at: status === 'sent' ? new Date().toISOString() : undefined,
      failed_at: status === 'failed' ? new Date().toISOString() : undefined,
      smtp_response: messageId,
      error_message: errorMessage,
      tracking_id: messageId,
    });
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    sent: number;
    failed: number;
  }> {
    const supabase = await createServiceClient();

    const [pending, processing, sent, failed] = await Promise.all([
      supabase
        .from('email_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('email_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'processing'),
      supabase
        .from('email_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent'),
      supabase
        .from('email_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed'),
    ]);

    return {
      pending: pending.count || 0,
      processing: processing.count || 0,
      sent: sent.count || 0,
      failed: failed.count || 0,
    };
  }

  /**
   * Retry failed emails
   */
  async retryFailed(emailIds?: string[]): Promise<number> {
    const supabase = await createServiceClient();

    let query = supabase
      .from('email_queue')
      .update({
        status: 'pending',
        error_message: null,
        retry_count: 0,
      })
      .eq('status', 'failed');

    if (emailIds) {
      query = query.in('id', emailIds);
    }

    const { error } = await query;

    if (error) {
      console.error('Failed to retry emails:', error);
      return 0;
    }

    // Process the queue
    const result = await this.processQueue();
    return result.succeeded;
  }

  /**
   * Cancel queued email
   */
  async cancelQueuedEmail(emailId: string): Promise<void> {
    const supabase = await createServiceClient();

    await supabase
      .from('email_queue')
      .update({ status: 'cancelled' })
      .eq('id', emailId)
      .eq('status', 'pending');
  }

  /**
   * Test SMTP connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const configured = await this.initializeTransporter();
      if (!configured || !this.transporter) {
        return { success: false, message: 'SMTP not configured' };
      }

      await this.transporter.verify();
      return { success: true, message: 'SMTP connection successful' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Connection failed' };
    }
  }

  /**
   * Get default email template
   */
  getDefaultEmailTemplate(content: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YUNITE CBO</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; }
    .header { background-color: #1a56db; color: white; padding: 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 20px; }
    .content p { margin-bottom: 15px; }
    .button { display: inline-block; background-color: #1a56db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
    .footer { background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 12px; color: #666; }
    .divider { border-bottom: 1px solid #e5e7eb; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>YUNITE CBO</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="divider"></div>
    <div class="footer">
      <p>This is an automated message from YUNITE CBO.</p>
      <p>Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }
}

export const emailService = new EmailService();
