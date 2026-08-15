/**
 * SMTP Test Connection API
 * Tests the SMTP configuration by attempting to connect and send a test email
 * Reads from database settings, with fallback to environment variables
 */

import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { authService } from '@/lib/services/auth.service';
import { settingsService } from '@/lib/services/settings.service';

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await authService.getSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if (!['super_admin', 'admin'].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    
    // Get settings from database, fallback to provided body, then environment variables
    const host = body.host || await settingsService.get('smtp.host') || process.env.SMTP_HOST;
    const port = body.port || await settingsService.get('smtp.port') || process.env.SMTP_PORT || '587';
    const secure = body.secure ?? (await settingsService.get('smtp.secure') || process.env.SMTP_SECURE || 'false') === 'true';
    const user = body.user || await settingsService.get('smtp.user') || process.env.SMTP_USER;
    const password = body.password || await settingsService.get('smtp.password') || process.env.SMTP_PASS;
    const fromEmail = body.fromEmail || await settingsService.get('smtp.from_email') || process.env.SMTP_FROM_EMAIL || user;
    const fromName = body.fromName || await settingsService.get('smtp.from_name') || process.env.SMTP_FROM_NAME || 'YUNITE';

    // Validate required fields
    if (!host) {
      return NextResponse.json({ 
        success: false, 
        error: 'SMTP host is not configured',
        hint: 'Please set smtp.host in database settings or SMTP_HOST environment variable'
      }, { status: 400 });
    }

    if (!user) {
      return NextResponse.json({ 
        success: false, 
        error: 'SMTP user is not configured',
        hint: 'Please set smtp.user in database settings or SMTP_USER environment variable'
      }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ 
        success: false, 
        error: 'SMTP password is not configured',
        hint: 'Please set smtp.password in database settings or SMTP_PASS environment variable'
      }, { status: 400 });
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port),
      secure,
      auth: {
        user,
        pass: password,
      },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 45000,
    });

    console.log(`Testing SMTP connection to ${host}:${port} as ${user ? '[configured]' : '[missing]'}`);

    // Test connection
    try {
      await transporter.verify();
      console.log('SMTP connection verified');
    } catch (connError: any) {
      let helpfulMessage = connError.message;
      
      // Check for common hosting platform blocking issues
      if (connError.message.includes('timeout') || connError.message.includes('ECONNREFUSED')) {
        helpfulMessage = `SMTP connection timeout - Your hosting provider may be blocking outbound SMTP connections.\n\n` +
          `Common solutions:\n` +
          `1. If using Render Free tier - Upgrade to Starter ($7/month)\n` +
          `2. Use SendGrid/Mailgun API instead of SMTP\n` +
          `3. Use AWS SES or Postmark email service\n\n` +
          `Original error: ${connError.message}`;
      }
      
      return NextResponse.json({
        success: false,
        error: 'Connection failed',
        details: helpfulMessage,
        stage: 'connection'
      }, { status: 400 });
    }

    // Send test email
    try {
      const testEmail = fromEmail || user;
      const info = await transporter.sendMail({
        from: fromName ? `"${fromName}" <${testEmail}>` : testEmail,
        to: user,
        subject: 'YUNITE SMTP Test Email',
        html: `
          <div style="padding: 20px; background-color: #f8fafc; border-radius: 8px;">
            <h2 style="color: #10B981; margin-bottom: 20px;">✅ SMTP Test Successful!</h2>
            <p style="color: #334155; font-size: 16px;">
              This is a test email from YUNITE Enterprise Portal.
            </p>
            <div style="background-color: white; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Server:</strong> ${host}</p>
              <p style="margin: 4px 0;"><strong>Port:</strong> ${port}</p>
              <p style="margin: 4px 0;"><strong>Secure:</strong> ${secure ? 'Yes' : 'No'}</p>
              <p style="margin: 4px 0;"><strong>User:</strong> ${user}</p>
            </div>
            <p style="color: #64748b; font-size: 12px;">
              Sent at: ${new Date().toISOString()}
            </p>
          </div>
        `,
        text: `SMTP Test Successful!\n\nServer: ${host}\nPort: ${port}\nSecure: ${secure ? 'Yes' : 'No'}\nUser: ${user}\n\nSent at: ${new Date().toISOString()}`,
      });

      return NextResponse.json({
        success: true,
        message: 'SMTP connection successful! Test email sent.',
        messageId: info.messageId,
        details: {
          stage: 'connection_and_send',
          host,
          port,
          secure,
          user,
        }
      });
    } catch (sendError: any) {
      return NextResponse.json({
        success: false,
        error: 'Connection successful but failed to send test email',
        details: sendError.message,
        stage: 'send'
      }, { status: 400 });
    }

  } catch (error: any) {
    console.error('SMTP test error:', error);
    return NextResponse.json({
      success: false,
      error: 'SMTP test failed',
      details: error.message
    }, { status: 500 });
  }
}
