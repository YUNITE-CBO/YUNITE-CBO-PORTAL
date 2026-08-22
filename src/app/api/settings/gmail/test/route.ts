/**
 * Gmail API Test Connection Endpoint
 * 
 * Tests the Gmail API configuration by:
 * 1. Verifying OAuth2 credentials are present
 * 2. Attempting to obtain an access token
 * 3. Testing API access with a profile request
 * 4. Optionally sending a test email
 * 
 * This endpoint is designed for environments that block direct SMTP connections
 * (such as Render Free tier) and need to verify Gmail API configuration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/services/auth.service';
import { gmailApiAdapter } from '@/lib/services/notifications/gmail-api.adapter';

export const dynamic = 'force-dynamic';

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

    const body = await request.json().catch(() => ({}));
    const { action = 'test', testRecipient } = body;

    console.log(`Gmail API test requested - action: ${action}`);

    // Get configuration status (without exposing secrets)
    const configStatus = gmailApiAdapter.getConfigStatus();

    if (!configStatus.configured) {
      return NextResponse.json({
        success: false,
        error: 'Gmail API not configured',
        message: 'Please configure the following environment variables:\n- GOOGLE_CLIENT_ID\n- GOOGLE_CLIENT_SECRET\n- GOOGLE_REFRESH_TOKEN\n- GOOGLE_SENDER_EMAIL',
        configuration: {
          hasClientId: configStatus.hasClientId,
          hasClientSecret: configStatus.hasClientSecret,
          hasRefreshToken: configStatus.hasRefreshToken,
          hasSenderEmail: configStatus.hasSenderEmail,
          senderEmail: configStatus.senderEmail,
        },
        suggestions: [
          '1. Set up a Google Cloud project at https://console.cloud.google.com',
          '2. Enable the Gmail API',
          '3. Create OAuth2 credentials (Web application type)',
          '4. Generate a refresh token using the OAuth2 flow',
          '5. Add the credentials to your .env file or Render environment variables',
        ],
      }, { status: 400 });
    }

    // Test connection
    if (action === 'test' || action === 'connection') {
      const connectionResult = await gmailApiAdapter.testConnection();
      
      return NextResponse.json({
        success: connectionResult.success,
        message: connectionResult.message,
        details: connectionResult.details,
        configuration: {
          senderEmail: configStatus.senderEmail,
          connectionMethod: configStatus.connectionMethod,
        },
      }, { status: connectionResult.success ? 200 : 400 });
    }

    // Send test email
    if (action === 'send_test') {
      const recipient = testRecipient || session.user.email;
      
      if (!recipient) {
        return NextResponse.json({
          success: false,
          error: 'No recipient specified',
          message: 'Please provide a testRecipient email address in the request body',
        }, { status: 400 });
      }

      const sendResult = await gmailApiAdapter.sendTestEmail(recipient);
      
      if (sendResult.success) {
        return NextResponse.json({
          success: true,
          message: `Test email sent successfully to ${recipient}`,
          messageId: sendResult.messageId,
          details: {
            to: recipient,
            method: 'Gmail API (OAuth2)',
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        return NextResponse.json({
          success: false,
          error: 'Failed to send test email',
          message: sendResult.error,
          errorCode: sendResult.errorCode,
          troubleshooting: [
            'Verify your refresh token is valid and not expired',
            'Check if the Gmail account has sufficient API quota',
            'Ensure the sender email is authorized in your OAuth2 configuration',
            'Check if the recipient email address is valid',
          ],
        }, { status: 400 });
      }
    }

    // Get status
    if (action === 'status') {
      const connectionResult = await gmailApiAdapter.testConnection();
      
      return NextResponse.json({
        success: true,
        status: {
          configured: configStatus.configured,
          connectionMethod: configStatus.connectionMethod,
          senderEmail: configStatus.senderEmail,
          connectionTest: connectionResult.success ? 'passed' : 'failed',
        },
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action',
      message: 'Valid actions are: test, connection, send_test, status',
    }, { status: 400 });

  } catch (error: any) {
    console.error('Gmail API test error:', error);
    return NextResponse.json({
      success: false,
      error: 'Gmail API test failed',
      message: error.message || 'An unexpected error occurred',
    }, { status: 500 });
  }
}

/**
 * GET endpoint to check Gmail API configuration status
 */
export async function GET() {
  try {
    const configStatus = gmailApiAdapter.getConfigStatus();
    
    return NextResponse.json({
      configured: configStatus.configured,
      connectionMethod: configStatus.connectionMethod,
      hasCredentials: {
        clientId: configStatus.hasClientId,
        clientSecret: configStatus.hasClientSecret,
        refreshToken: configStatus.hasRefreshToken,
        senderEmail: configStatus.hasSenderEmail,
      },
      senderEmail: configStatus.senderEmail,
    });
  } catch (error: any) {
    console.error('Gmail API status error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to get Gmail API status',
    }, { status: 500 });
  }
}
