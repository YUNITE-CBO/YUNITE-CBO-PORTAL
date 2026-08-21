/**
 * GMAIL API ADAPTER - OAuth2-based Gmail API Email Delivery
 * 
 * Provides email delivery through Google's Gmail API using OAuth2 authentication.
 * This adapter is designed for environments that block direct SMTP connections
 * (such as Render Free tier) while maintaining secure email delivery.
 * 
 * Architecture:
 * YUNITE OS → Render Free Backend → HTTPS → Gmail API → info.yunite.ke@gmail.com → Recipient
 * 
 * Security:
 * - OAuth2 authentication (no password storage)
 * - HTTPS-only communication
 * - Environment variable credential management
 * - No SMTP port dependency
 */

import { createServiceClient } from '@/lib/supabase/server';
import { settingsService } from '../settings.service';
import { v4 as uuidv4 } from 'uuid';

export interface GmailApiConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  senderEmail: string;
  senderName?: string;
}

export interface GmailApiMessage {
  to: string;
  toName?: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string; // Base64 encoded
    contentType?: string;
  }>;
}

export interface GmailApiDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

export interface GmailTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
}

const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GMAIL_UPLOAD_URL = 'https://www.googleapis.com/upload/gmail/v1/users/me/messages/send';

/**
 * Encode email to RFC 2822 format with base64url encoding
 */
function encodeEmail(message: GmailApiMessage, senderName: string): { raw: string; headers: Record<string, string> } {
  const toAddress = message.toName ? `"${message.toName}" <${message.to}>` : message.to;
  const fromAddress = senderName ? `"${senderName}" <${message.to}>` : message.to;
  
  let body = `To: ${toAddress}\r\n`;
  body += `From: ${fromAddress}\r\n`;
  body += `Subject: ${message.subject}\r\n`;
  
  if (message.cc && message.cc.length > 0) {
    body += `Cc: ${message.cc.join(', ')}\r\n`;
  }
  
  if (message.bcc && message.bcc.length > 0) {
    body += `Bcc: ${message.bcc.join(', ')}\r\n`;
  }
  
  if (message.replyTo) {
    body += `Reply-To: ${message.replyTo}\r\n`;
  }
  
  body += 'Content-Type: text/html; charset="utf-8"\r\n';
  body += 'MIME-Version: 1.0\r\n';
  body += '\r\n';
  body += message.htmlBody;
  
  // Base64url encode the message
  const encodedBody = Buffer.from(body)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  const headers: Record<string, string> = {
    'To': toAddress,
    'From': fromAddress,
    'Subject': message.subject,
  };
  
  if (message.cc && message.cc.length > 0) {
    headers['Cc'] = message.cc.join(', ');
  }
  
  return { raw: encodedBody, headers };
}

export class GmailApiAdapter {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private isConfigured: boolean = false;
  private config: GmailApiConfig | null = null;

  /**
   * Check if Gmail API is configured
   */
  isGmailApiConfigured(): boolean {
    return !!(
      process.env.GOOGLE_CLIENT_ID ||
      process.env.GOOGLE_CLIENT_SECRET ||
      process.env.GOOGLE_REFRESH_TOKEN ||
      process.env.GOOGLE_SENDER_EMAIL
    );
  }

  /**
   * Initialize Gmail API configuration
   */
  private async initialize(): Promise<boolean> {
    if (this.config && this.isConfigured) {
      return true;
    }

    try {
      // Admin opt-out from Settings -> Integrations. An absent setting row
      // (null) means enabled, preserving behavior on a not-yet-migrated DB.
      const enabled = await settingsService.get('integrations.gmail_api_enabled');
      if (enabled !== null && enabled.trim() !== 'true') {
        this.isConfigured = false;
        return false;
      }

      // Try environment variables first (primary for production)
      // Then fallback to database settings
      let clientId: string | undefined | null = process.env.GOOGLE_CLIENT_ID;
      let clientSecret: string | undefined | null = process.env.GOOGLE_CLIENT_SECRET;
      let refreshToken: string | undefined | null = process.env.GOOGLE_REFRESH_TOKEN;
      let senderEmail: string | undefined | null = process.env.GOOGLE_SENDER_EMAIL;
      let senderName: string | undefined | null = process.env.GOOGLE_SENDER_NAME;

      // Fallback to database settings if env vars are not set
      if (!clientId) clientId = await settingsService.get('gmail.client_id');
      if (!clientSecret) clientSecret = await settingsService.get('gmail.client_secret');
      if (!refreshToken) refreshToken = await settingsService.get('gmail.refresh_token');
      if (!senderEmail) senderEmail = await settingsService.get('gmail.sender_email');
      if (!senderName) senderName = await settingsService.get('gmail.sender_name');

      if (!clientId || !clientSecret || !refreshToken || !senderEmail) {
        console.error('Gmail API not configured - missing required credentials');
        this.isConfigured = false;
        return false;
      }

      this.config = {
        clientId,
        clientSecret,
        refreshToken,
        senderEmail,
        senderName: senderName || 'YUNITE',
      };

      this.isConfigured = true;
      console.log('Gmail API adapter initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Gmail API adapter:', error);
      this.isConfigured = false;
      return false;
    }
  }

  /**
   * Get OAuth2 access token using refresh token
   */
  private async getAccessToken(): Promise<string | null> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.config) {
      await this.initialize();
    }

    if (!this.config) {
      return null;
    }

    try {
      const response = await fetch(GMAIL_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to get Gmail access token:', response.status, errorText);
        return null;
      }

      const data: GmailTokenResponse = await response.json();
      
      this.accessToken = data.access_token;
      // Set expiry 5 minutes before actual expiry for safety margin
      this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
      
      return this.accessToken;
    } catch (error) {
      console.error('Error getting Gmail access token:', error);
      return null;
    }
  }

  /**
   * Send email via Gmail API
   */
  async send(message: GmailApiMessage): Promise<GmailApiDeliveryResult> {
    if (!await this.initialize()) {
      return { 
        success: false, 
        error: 'Gmail API not configured',
        errorCode: 'NOT_CONFIGURED'
      };
    }

    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      return { 
        success: false, 
        error: 'Failed to obtain Gmail access token',
        errorCode: 'AUTH_FAILED'
      };
    }

    const { raw } = encodeEmail(message, this.config!.senderName ?? 'YUNITE');

    try {
      const response = await fetch(GMAIL_SEND_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `Gmail API error: ${response.status}`;
        
        try {
          const errorData = JSON.parse(errorBody);
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          }
        } catch {
          // Use default error message
        }

        console.error('Gmail API send error:', response.status, errorMessage);
        
        // Handle specific error codes
        if (response.status === 401) {
          // Clear cached token and retry once
          this.accessToken = null;
          this.tokenExpiry = 0;
          
          const retryToken = await this.getAccessToken();
          if (retryToken) {
            return this.send(message);
          }
        }

        return { 
          success: false, 
          error: errorMessage,
          errorCode: `HTTP_${response.status}`
        };
      }

      const result = await response.json();
      console.log('Email sent via Gmail API:', result.id);
      
      return {
        success: true,
        messageId: result.id,
      };
    } catch (error: any) {
      console.error('Gmail API send exception:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to send email via Gmail API',
        errorCode: 'EXCEPTION'
      };
    }
  }

  /**
   * Test Gmail API connection
   */
  async testConnection(): Promise<{ success: boolean; message: string; details?: Record<string, unknown> }> {
    if (!await this.initialize()) {
      return {
        success: false,
        message: 'Gmail API not configured - missing credentials',
      };
    }

    // Test token retrieval
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      return {
        success: false,
        message: 'Failed to obtain access token from Gmail API',
        details: {
          stage: 'authentication',
          hasClientId: !!this.config?.clientId,
          hasClientSecret: !!this.config?.clientSecret,
          hasRefreshToken: !!this.config?.refreshToken,
          senderEmail: this.config?.senderEmail,
        },
      };
    }

    // Test API access with a profile request
    try {
      const profileResponse = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/profile',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (profileResponse.ok) {
        const profile = await profileResponse.json();
        return {
          success: true,
          message: 'Gmail API connection successful',
          details: {
            emailAddress: profile.emailAddress,
            messagesTotal: profile.messagesTotal,
            threadsTotal: profile.threadsTotal,
          },
        };
      } else {
        const errorText = await profileResponse.text();
        return {
          success: false,
          message: `Gmail API profile check failed: ${profileResponse.status}`,
          details: { error: errorText },
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Gmail API connection test failed: ${error.message}`,
      };
    }
  }

  /**
   * Send test email to verify full flow
   */
  async sendTestEmail(testRecipient: string): Promise<GmailApiDeliveryResult> {
    if (!await this.initialize()) {
      return {
        success: false,
        error: 'Gmail API not configured',
        errorCode: 'NOT_CONFIGURED'
      };
    }

    return this.send({
      to: testRecipient,
      toName: 'YUNITE Test User',
      subject: 'YUNITE Gmail API Test Email',
      htmlBody: `
        <div style="padding: 20px; background-color: #f8fafc; border-radius: 8px;">
          <h2 style="color: #10B981; margin-bottom: 20px;">✅ Gmail API Test Successful!</h2>
          <p style="color: #334155; font-size: 16px;">
            This is a test email sent via Gmail API from YUNITE Enterprise Portal.
          </p>
          <div style="background-color: white; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>From:</strong> ${this.config?.senderEmail}</p>
            <p style="margin: 4px 0;"><strong>To:</strong> ${testRecipient}</p>
            <p style="margin: 4px 0;"><strong>Method:</strong> Gmail API (OAuth2)</p>
            <p style="margin: 4px 0;"><strong>Time:</strong> ${new Date().toISOString()}</p>
          </div>
          <p style="color: #64748b; font-size: 12px;">
            If you received this email, the Gmail API integration is working correctly.
          </p>
        </div>
      `,
      textBody: `Gmail API Test Successful!\n\nFrom: ${this.config?.senderEmail}\nTo: ${testRecipient}\nMethod: Gmail API (OAuth2)\nTime: ${new Date().toISOString()}\n\nIf you received this email, the Gmail API integration is working correctly.`,
    });
  }

  /**
   * Get current configuration status (without exposing secrets)
   */
  getConfigStatus(): {
    configured: boolean;
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasRefreshToken: boolean;
    hasSenderEmail: boolean;
    senderEmail: string | null;
    connectionMethod: 'gmail_api' | 'smtp' | 'not_configured';
  } {
    const hasClientId = !!(process.env.GOOGLE_CLIENT_ID);
    const hasClientSecret = !!(process.env.GOOGLE_CLIENT_SECRET);
    const hasRefreshToken = !!(process.env.GOOGLE_REFRESH_TOKEN);
    const hasSenderEmail = !!(process.env.GOOGLE_SENDER_EMAIL);

    const isConfigured = hasClientId && hasClientSecret && hasRefreshToken && hasSenderEmail;

    return {
      configured: isConfigured,
      hasClientId,
      hasClientSecret,
      hasRefreshToken,
      hasSenderEmail,
      senderEmail: process.env.GOOGLE_SENDER_EMAIL || null,
      connectionMethod: isConfigured ? 'gmail_api' : 'smtp',
    };
  }

  /**
   * Clear cached token (for testing or forced re-auth)
   */
  clearTokenCache(): void {
    this.accessToken = null;
    this.tokenExpiry = 0;
  }
}

export const gmailApiAdapter = new GmailApiAdapter();
