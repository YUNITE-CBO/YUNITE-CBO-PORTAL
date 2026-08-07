/**
 * Direct Gmail API Test Script
 * 
 * This script tests the Gmail API adapter directly without requiring
 * the Next.js server or admin authentication.
 * 
 * Usage:
 *   node scripts/test-gmail-api-direct.js
 * 
 * Environment variables (from .env):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REFRESH_TOKEN
 *   GOOGLE_SENDER_EMAIL
 *   GOOGLE_SENDER_NAME
 */

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GMAIL_PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';

async function testGmailApi() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   Gmail API Direct Test                                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Check configuration
  const config = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    senderEmail: process.env.GOOGLE_SENDER_EMAIL,
    senderName: process.env.GOOGLE_SENDER_NAME || 'YUNITE'
  };

  console.log('📋 Configuration Check:');
  console.log(`   Client ID:      ${config.clientId ? '✓ Set' : '✗ Missing'}`);
  console.log(`   Client Secret:  ${config.clientSecret ? '✓ Set' : '✗ Missing'}`);
  console.log(`   Refresh Token:  ${config.refreshToken ? '✓ Set' : '✗ Missing'}`);
  console.log(`   Sender Email:   ${config.senderEmail || '✗ Missing'}`);
  console.log('');

  if (!config.clientId || !config.clientSecret || !config.refreshToken || !config.senderEmail) {
    console.log('❌ Configuration incomplete. Please set all required environment variables.\n');
    return;
  }

  // Test 1: Get Access Token
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test 1: OAuth2 Token Exchange');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  let accessToken;
  try {
    const tokenResponse = await fetch(GMAIL_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: 'refresh_token'
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.log(`❌ OAuth2 Error: ${tokenData.error}`);
      console.log(`   Description: ${tokenData.error_description || 'No description'}`);
      
      if (tokenData.error === 'invalid_grant') {
        console.log('\n⚠️  The refresh token is invalid or expired.');
        console.log('   Please generate a new refresh token using:');
        console.log('   node scripts/generate-gmail-refresh-token.js');
      }
      return;
    }

    accessToken = tokenData.access_token;
    console.log('✅ OAuth2 Token Exchange: Success');
    console.log(`   Token Type: ${tokenData.token_type}`);
    console.log(`   Expires In: ${tokenData.expires_in} seconds`);
    console.log(`   Access Token: ${accessToken.substring(0, 20)}...`);
  } catch (error) {
    console.log(`❌ OAuth2 Token Exchange: Failed`);
    console.log(`   Error: ${error.message}`);
    return;
  }

  // Test 2: Get Gmail Profile
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test 2: Gmail API Profile Access');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    const profileResponse = await fetch(GMAIL_PROFILE_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text();
      console.log(`❌ Gmail Profile Access: Failed`);
      console.log(`   HTTP Status: ${profileResponse.status}`);
      console.log(`   Error: ${errorText}`);
      return;
    }

    const profile = await profileResponse.json();
    console.log('✅ Gmail Profile Access: Success');
    console.log(`   Email Address: ${profile.emailAddress}`);
    console.log(`   Messages Total: ${profile.messagesTotal}`);
    console.log(`   Threads Total: ${profile.threadsTotal}`);
  } catch (error) {
    console.log(`❌ Gmail Profile Access: Failed`);
    console.log(`   Error: ${error.message}`);
    return;
  }

  // Test 3: Send Test Email
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test 3: Send Test Email');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // Create email message
    const toAddress = config.senderEmail;
    const subject = 'YUNITE Gmail API Test Email';
    const htmlBody = `
      <div style="padding: 20px; background-color: #f8fafc; border-radius: 8px; font-family: Arial, sans-serif;">
        <h2 style="color: #10B981; margin-bottom: 20px;">✅ Gmail API Test Successful!</h2>
        <p style="color: #334155; font-size: 16px;">
          This is a test email sent via Gmail API from YUNITE Enterprise Portal.
        </p>
        <div style="background-color: white; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #e5e7eb;">
          <p style="margin: 4px 0;"><strong>From:</strong> ${config.senderName} &lt;${config.senderEmail}&gt;</p>
          <p style="margin: 4px 0;"><strong>To:</strong> ${toAddress}</p>
          <p style="margin: 4px 0;"><strong>Method:</strong> Gmail API (OAuth2)</p>
          <p style="margin: 4px 0;"><strong>Time:</strong> ${new Date().toISOString()}</p>
        </div>
        <p style="color: #64748b; font-size: 12px;">
          If you received this email, the Gmail API integration is working correctly.
        </p>
      </div>
    `;

    // Encode email to RFC 2822 format
    let emailContent = `To: ${toAddress}\r\n`;
    emailContent += `From: "${config.senderName}" <${config.senderEmail}>\r\n`;
    emailContent += `Subject: ${subject}\r\n`;
    emailContent += 'Content-Type: text/html; charset="utf-8"\r\n';
    emailContent += 'MIME-Version: 1.0\r\n';
    emailContent += '\r\n';
    emailContent += htmlBody;

    const encodedEmail = Buffer.from(emailContent)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send email
    const sendResponse = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: encodedEmail })
    });

    if (!sendResponse.ok) {
      const errorBody = await sendResponse.text();
      console.log(`❌ Send Email: Failed`);
      console.log(`   HTTP Status: ${sendResponse.status}`);
      console.log(`   Error: ${errorBody}`);
      return;
    }

    const result = await sendResponse.json();
    console.log('✅ Send Email: Success');
    console.log(`   Message ID: ${result.id}`);
    console.log(`   To: ${toAddress}`);
    console.log(`   Subject: ${subject}`);
  } catch (error) {
    console.log(`❌ Send Email: Failed`);
    console.log(`   Error: ${error.message}`);
    return;
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║   ✅ All Tests Passed! Gmail API is Working                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\n📋 Summary:');
  console.log('   ✓ OAuth2 authentication working');
  console.log('   ✓ Gmail API access verified');
  console.log('   ✓ Email sending confirmed');
  console.log('\n🚀 The Gmail API integration is ready for use!');
  console.log('   Update your .env file if needed, then restart the application.');
}

// Run tests
testGmailApi().catch(error => {
  console.error('\n❌ Unexpected Error:', error.message);
  process.exit(1);
});
