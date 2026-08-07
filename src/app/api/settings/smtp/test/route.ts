/**
 * SMTP Test Connection API
 * Tests the SMTP configuration by attempting to connect and send a test email
 */

import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { authService } from '@/lib/services/auth.service';

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
    const { host, port, secure, user, password, fromEmail, fromName } = body;

    // Validate required fields
    if (!host || !port || !user || !password) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields: host, port, user, password' 
      }, { status: 400 });
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port),
      secure: secure === true || secure === 'true',
      auth: {
        user,
        pass: password,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });

    // Test connection
    try {
      await transporter.verify();
    } catch (connError: any) {
      return NextResponse.json({
        success: false,
        error: 'Connection failed',
        details: connError.message,
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
    return NextResponse.json({
      success: false,
      error: 'SMTP test failed',
      details: error.message
    }, { status: 500 });
  }
}
