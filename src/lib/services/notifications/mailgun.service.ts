/**
 * MAILGUN EMAIL SERVICE
 * REST API based email delivery - works on all hosting platforms
 */

import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { settingsService } from '../settings.service';

export interface MailgunMessage {
  to: string;
  toName?: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
}

export interface MailgunDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class MailgunEmailService {
  private client: any = null;
  private domain: string | null = null;
  private isConfigured: boolean = false;

  /**
   * Initialize Mailgun client
   */
  private async initialize(): Promise<boolean> {
    if (this.client && this.isConfigured) return true;

    try {
      const apiKey = await settingsService.get('mailgun.api_key') || process.env.MAILGUN_API_KEY;
      const domain = await settingsService.get('mailgun.domain') || process.env.MAILGUN_DOMAIN;

      if (!apiKey || !domain) {
        console.error('Mailgun not configured - missing api_key or domain');
        this.isConfigured = false;
        return false;
      }

      const mailgun = new Mailgun(formData);
      this.client = mailgun.client({ username: 'api', key: apiKey });
      this.domain = domain;
      this.isConfigured = true;

      console.log('Mailgun initialized with domain:', domain);
      return true;
    } catch (error) {
      console.error('Failed to initialize Mailgun:', error);
      this.isConfigured = false;
      return false;
    }
  }

  /**
   * Send email via Mailgun API
   */
  async send(message: MailgunMessage): Promise<MailgunDeliveryResult> {
    const configured = await this.initialize();
    if (!configured || !this.client || !this.domain) {
      return { success: false, error: 'Mailgun not configured' };
    }

    const fromEmail = message.from 
      || await settingsService.get('mailgun.from_email') 
      || process.env.MAILGUN_FROM_EMAIL 
      || 'noreply@yunite.ke';
    const fromName = message.fromName 
      || await settingsService.get('mailgun.from_name') 
      || process.env.MAILGUN_FROM_NAME 
      || 'YUNITE';
    const replyTo = message.replyTo 
      || await settingsService.get('mailgun.reply_to') 
      || process.env.MAILGUN_REPLY_TO 
      || undefined;

    try {
      const from = `"${fromName}" <${fromEmail}>`;
      const to = message.toName 
        ? `"${message.toName}" <${message.to}>` 
        : message.to;

      const data: any = {
        from,
        to,
        subject: message.subject,
        html: message.html,
        text: message.text || message.html.replace(/<[^>]*>/g, ''),
      };

      if (message.cc?.length) {
        data.cc = message.cc.join(', ');
      }
      if (message.bcc?.length) {
        data.bcc = message.bcc.join(', ');
      }
      if (replyTo) {
        data['h:Reply-To'] = replyTo;
      }

      const result = await this.client.messages.create(this.domain, data);
      
      console.log('Mailgun email sent:', result.id);
      return { success: true, messageId: result.id };
    } catch (error: any) {
      console.error('Mailgun send error:', error);
      return { success: false, error: error.message || 'Failed to send email via Mailgun' };
    }
  }

  /**
   * Test Mailgun connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const configured = await this.initialize();
    if (!configured) {
      return { success: false, message: 'Mailgun not configured' };
    }

    try {
      // Try to send a test email to self
      const testEmail = await settingsService.get('mailgun.from_email') 
        || process.env.MAILGUN_FROM_EMAIL 
        || 'test@example.com';
      
      const result = await this.send({
        to: testEmail,
        subject: 'YUNITE Mailgun Test Email',
        html: '<h1>Test Successful!</h1><p>This is a test email from YUNITE via Mailgun.</p>',
      });

      if (result.success) {
        return { success: true, message: `Mailgun connected! Test email sent to ${testEmail}` };
      } else {
        return { success: false, message: result.error || 'Failed to send test email' };
      }
    } catch (error: any) {
      return { success: false, message: error.message || 'Connection test failed' };
    }
  }

  /**
   * Check if Mailgun is configured
   */
  async isMailgunConfigured(): Promise<boolean> {
    const apiKey = await settingsService.get('mailgun.api_key') || process.env.MAILGUN_API_KEY;
    const domain = await settingsService.get('mailgun.domain') || process.env.MAILGUN_DOMAIN;
    return !!(apiKey && domain);
  }
}

export const mailgunEmailService = new MailgunEmailService();
