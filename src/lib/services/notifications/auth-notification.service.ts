/**
 * AUTH NOTIFICATION SERVICE
 * 
 * Handles login/logout notifications for users and super admins.
 * Sends both in-app and email notifications for security events.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { emailService } from './email.service';

export interface AuthNotificationData {
  userId: string;
  userEmail: string;
  userName: string;
  userRole: string;
  eventType: 'login' | 'logout';
  ipAddress?: string;
  deviceInfo?: {
    browser?: string;
    os?: string;
    device?: string;
    isMobile?: boolean;
  };
  timestamp: Date;
}

export class AuthNotificationService {
  /**
   * Send login notification to user
   */
  async notifyUserLogin(data: AuthNotificationData): Promise<void> {
    const supabase = await createServiceClient();

    // Get user notification preferences
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('notify_on_login, email_notifications, in_app_notifications')
      .eq('user_id', data.userId)
      .single();

    // Default to true if no preferences set
    const shouldNotify = prefs?.notify_on_login ?? true;
    const allowEmail = prefs?.email_notifications ?? true;
    const allowInApp = prefs?.in_app_notifications ?? true;

    if (!shouldNotify) return;

    const deviceDescription = data.deviceInfo 
      ? `${data.deviceInfo.browser || 'Unknown'} on ${data.deviceInfo.os || 'Unknown OS'}`
      : 'Unknown device';
    
    const locationText = data.ipAddress ? ` from ${data.ipAddress}` : '';

    // Create in-app notification
    if (allowInApp) {
      await this.createInAppNotification(
        data.userId,
        'user',
        'Login Notification',
        `Your account was accessed${locationText} using ${deviceDescription}.`,
        'login_activity',
        data.timestamp,
        {
          event_type: 'login',
          device_info: data.deviceInfo,
          ip_address: data.ipAddress,
        }
      );
    }

    // Send email notification
    if (allowEmail) {
      await this.sendLoginEmail(data, deviceDescription);
    }
  }

  /**
   * Send logout notification to user
   */
  async notifyUserLogout(data: AuthNotificationData): Promise<void> {
    const supabase = await createServiceClient();

    // Get user notification preferences
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('notify_on_logout, email_notifications, in_app_notifications')
      .eq('user_id', data.userId)
      .single();

    const shouldNotify = prefs?.notify_on_logout ?? true;
    const allowEmail = prefs?.email_notifications ?? true;
    const allowInApp = prefs?.in_app_notifications ?? true;

    if (!shouldNotify) return;

    // Create in-app notification
    if (allowInApp) {
      await this.createInAppNotification(
        data.userId,
        'user',
        'Logout Notification',
        'You have been successfully logged out of your account.',
        'login_activity',
        data.timestamp,
        { event_type: 'logout' }
      );
    }

    // Send email notification
    if (allowEmail) {
      await this.sendLogoutEmail(data);
    }
  }

  /**
   * Notify super admin of user login
   */
  async notifySuperAdminLogin(data: AuthNotificationData): Promise<void> {
    const supabase = await createServiceClient();

    // Get all super admins
    const { data: superAdmins } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('role', 'super_admin')
      .eq('is_active', true);

    if (!superAdmins?.length) return;

    const deviceDescription = data.deviceInfo 
      ? `${data.deviceInfo.browser || 'Unknown'} on ${data.deviceInfo.os || 'Unknown OS'}`
      : 'Unknown device';

    const formattedTime = data.timestamp.toLocaleString('en-KE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    // Send notification to each super admin
    for (const admin of superAdmins) {
      // Skip if admin is the one who logged in
      if (admin.id === data.userId) continue;

      // Create in-app notification
      await this.createInAppNotification(
        admin.id,
        'user',
        'User Login Alert',
        `${data.userName} (${data.userEmail}) logged in using ${deviceDescription}.`,
        'admin_alert',
        data.timestamp,
        {
          event_type: 'user_login',
          target_user_id: data.userId,
          target_user_name: data.userName,
          target_user_email: data.userEmail,
          target_user_role: data.userRole,
          device_info: data.deviceInfo,
          ip_address: data.ipAddress,
        }
      );

      // Send email
      await this.sendSuperAdminLoginEmail(admin, data, deviceDescription, formattedTime);
    }
  }

  /**
   * Notify super admin of user logout
   */
  async notifySuperAdminLogout(data: AuthNotificationData): Promise<void> {
    const supabase = await createServiceClient();

    // Get all super admins
    const { data: superAdmins } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('role', 'super_admin')
      .eq('is_active', true);

    if (!superAdmins?.length) return;

    const formattedTime = data.timestamp.toLocaleString('en-KE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    // Send notification to each super admin
    for (const admin of superAdmins) {
      // Skip if admin is the one who logged out
      if (admin.id === data.userId) continue;

      // Create in-app notification
      await this.createInAppNotification(
        admin.id,
        'user',
        'User Logout Alert',
        `${data.userName} (${data.userEmail}) logged out.`,
        'admin_alert',
        data.timestamp,
        {
          event_type: 'user_logout',
          target_user_id: data.userId,
          target_user_name: data.userName,
          target_user_email: data.userEmail,
          target_user_role: data.userRole,
        }
      );

      // Send email
      await this.sendSuperAdminLogoutEmail(admin, data, formattedTime);
    }
  }

  // ==================== Private Methods ====================

  private async createInAppNotification(
    recipientId: string,
    recipientType: 'user' | 'member',
    subject: string,
    body: string,
    category: string,
    timestamp: Date,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const supabase = await createServiceClient();

    await supabase.from('notifications').insert({
      id: uuidv4(),
      notification_ref: `NTF-${Date.now()}-${uuidv4().split('-')[0]}`,
      title: subject,
      message: body,
      priority: 'normal',
      recipient_type: recipientType,
      recipient_id: recipientId,
      source_module: 'auth',
      source_action: 'login_activity',
      status: 'sent',
      rendered_variables: metadata || {},
      created_at: timestamp.toISOString(),
    });
  }

  private async sendLoginEmail(data: AuthNotificationData, deviceDescription: string): Promise<void> {
    const ipInfo = data.ipAddress ? `<p><strong>IP Address:</strong> ${data.ipAddress}</p>` : '';
    const timeInfo = data.timestamp.toLocaleString('en-KE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const htmlContent = `
      <div style="padding: 20px; background-color: #f8fafc; border-radius: 8px;">
        <h2 style="color: #1e40af; margin-bottom: 20px;">🔐 Login Confirmation</h2>
        
        <p style="color: #334155; font-size: 16px;">Hello ${data.userName},</p>
        
        <p style="color: #334155; font-size: 16px;">
          Your YUNITE account was successfully accessed:
        </p>
        
        <div style="background-color: white; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #22c55e;">
          <p style="margin: 4px 0;"><strong>Account:</strong> ${data.userEmail}</p>
          <p style="margin: 4px 0;"><strong>Role:</strong> ${this.formatRole(data.userRole)}</p>
          <p style="margin: 4px 0;"><strong>Device:</strong> ${deviceDescription}</p>
          ${ipInfo}
          <p style="margin: 4px 0;"><strong>Time:</strong> ${timeInfo}</p>
        </div>
        
        <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
          If this was you, no further action is required.
        </p>
        
        <p style="color: #dc2626; font-size: 14px; margin-top: 16px;">
          <strong>⚠️ If this wasn't you:</strong> Please contact your administrator immediately and change your password.
        </p>
      </div>
    `;

    await emailService.send({
      to: data.userEmail,
      toName: data.userName,
      subject: `🔐 YUNITE: Login from ${deviceDescription}`,
      htmlBody: emailService.getDefaultEmailTemplate(htmlContent),
    });
  }

  private async sendLogoutEmail(data: AuthNotificationData): Promise<void> {
    const timeInfo = data.timestamp.toLocaleString('en-KE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const htmlContent = `
      <div style="padding: 20px; background-color: #f8fafc; border-radius: 8px;">
        <h2 style="color: #1e40af; margin-bottom: 20px;">👋 Logout Confirmation</h2>
        
        <p style="color: #334155; font-size: 16px;">Hello ${data.userName},</p>
        
        <p style="color: #334155; font-size: 16px;">
          You have been successfully logged out of your YUNITE account.
        </p>
        
        <div style="background-color: white; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #64748b;">
          <p style="margin: 4px 0;"><strong>Account:</strong> ${data.userEmail}</p>
          <p style="margin: 4px 0;"><strong>Logged out at:</strong> ${timeInfo}</p>
        </div>
        
        <p style="color: #334155; font-size: 16px; margin-top: 20px;">
          Thank you for using YUNITE Enterprise Portal.
        </p>
        
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://yunite.example.com'}/login" 
           style="display: inline-block; background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">
          Login Again
        </a>
      </div>
    `;

    await emailService.send({
      to: data.userEmail,
      toName: data.userName,
      subject: '👋 YUNITE: You have been logged out',
      htmlBody: emailService.getDefaultEmailTemplate(htmlContent),
    });
  }

  private async sendSuperAdminLoginEmail(
    admin: { id: string; email: string; full_name: string },
    data: AuthNotificationData,
    deviceDescription: string,
    formattedTime: string
  ): Promise<void> {
    const ipInfo = data.ipAddress ? `<p><strong>IP Address:</strong> ${data.ipAddress}</p>` : '';

    const htmlContent = `
      <div style="padding: 20px; background-color: #fef2f2; border-radius: 8px; border: 1px solid #fecaca;">
        <h2 style="color: #dc2626; margin-bottom: 20px;">⚠️ User Login Alert</h2>
        
        <p style="color: #334155; font-size: 16px;">Hello ${admin.full_name},</p>
        
        <p style="color: #334155; font-size: 16px;">
          A user has logged into the YUNITE system:
        </p>
        
        <div style="background-color: white; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 4px 0;"><strong>User:</strong> ${data.userName}</p>
          <p style="margin: 4px 0;"><strong>Email:</strong> ${data.userEmail}</p>
          <p style="margin: 4px 0;"><strong>Role:</strong> ${this.formatRole(data.userRole)}</p>
          <p style="margin: 4px 0;"><strong>Device:</strong> ${deviceDescription}</p>
          ${ipInfo}
          <p style="margin: 4px 0;"><strong>Time:</strong> ${formattedTime}</p>
        </div>
        
        <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
          You are receiving this notification because you are a Super Administrator.
        </p>
        
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://yunite.example.com'}/dashboard/audit-logs" 
           style="display: inline-block; background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">
          View Audit Logs
        </a>
      </div>
    `;

    await emailService.send({
      to: admin.email,
      toName: admin.full_name,
      subject: `⚠️ YUNITE Alert: ${data.userName} logged in`,
      htmlBody: emailService.getDefaultEmailTemplate(htmlContent),
    });
  }

  private async sendSuperAdminLogoutEmail(
    admin: { id: string; email: string; full_name: string },
    data: AuthNotificationData,
    formattedTime: string
  ): Promise<void> {
    const htmlContent = `
      <div style="padding: 20px; background-color: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
        <h2 style="color: #16a34a; margin-bottom: 20px;">ℹ️ User Logout Notification</h2>
        
        <p style="color: #334155; font-size: 16px;">Hello ${admin.full_name},</p>
        
        <p style="color: #334155; font-size: 16px;">
          A user has logged out of the YUNITE system:
        </p>
        
        <div style="background-color: white; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #22c55e;">
          <p style="margin: 4px 0;"><strong>User:</strong> ${data.userName}</p>
          <p style="margin: 4px 0;"><strong>Email:</strong> ${data.userEmail}</p>
          <p style="margin: 4px 0;"><strong>Role:</strong> ${this.formatRole(data.userRole)}</p>
          <p style="margin: 4px 0;"><strong>Logged out at:</strong> ${formattedTime}</p>
        </div>
        
        <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
          You are receiving this notification because you are a Super Administrator.
        </p>
      </div>
    `;

    await emailService.send({
      to: admin.email,
      toName: admin.full_name,
      subject: `ℹ️ YUNITE: ${data.userName} logged out`,
      htmlBody: emailService.getDefaultEmailTemplate(htmlContent),
    });
  }

  private formatRole(role: string): string {
    const roleMap: Record<string, string> = {
      super_admin: 'Super Administrator',
      admin: 'Administrator',
      staff: 'Staff',
      viewer: 'Viewer',
    };
    return roleMap[role] || role;
  }
}

export const authNotificationService = new AuthNotificationService();
