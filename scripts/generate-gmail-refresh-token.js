/**
 * Gmail API OAuth2 Refresh Token Generator
 * 
 * This script generates a valid OAuth2 refresh token for the Gmail API.
 * Run this script to obtain credentials that work with the Gmail API adapter.
 * 
 * Usage:
 *   node scripts/generate-gmail-refresh-token.js
 * 
 * Prerequisites:
 *   1. Create a project at https://console.cloud.google.com
 *   2. Enable the Gmail API
 *   3. Create OAuth2 credentials (Web application)
 *   4. Set the following environment variables or edit the config below:
 *      - GOOGLE_CLIENT_ID
 *      - GOOGLE_CLIENT_SECRET
 *      - GOOGLE_SENDER_EMAIL
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration from environment variables
const CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  senderEmail: process.env.GOOGLE_SENDER_EMAIL || 'your-sender@gmail.com',
  redirectUri: process.env.OAUTH_REDIRECT_URI || 'http://localhost:3001/oauth/callback',
  scopes: [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose'
  ]
};

// Validate required environment variables
if (!CONFIG.clientId || !CONFIG.clientSecret) {
  console.error('❌ Error: Missing required environment variables');
  console.error('   Please set the following environment variables:');
  console.error('   - GOOGLE_CLIENT_ID');
  console.error('   - GOOGLE_CLIENT_SECRET');
  console.error('');
  console.error('   You can set them in your .env file or run:');
  console.error('   GOOGLE_CLIENT_ID=your_id GOOGLE_CLIENT_SECRET=your_secret node scripts/generate-gmail-refresh-token.js');
  process.exit(1);
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

function generateAuthUrl() {
  const params = new URLSearchParams({
    client_id: CONFIG.clientId,
    redirect_uri: CONFIG.redirectUri,
    response_type: 'code',
    scope: CONFIG.scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent'
  });
  
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  console.log('\n📤 Exchanging authorization code for tokens...');
  
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: CONFIG.clientId,
      client_secret: CONFIG.clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: CONFIG.redirectUri
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }
  
  return await response.json();
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const parsedUrl = url.parse(req.url, true);
      
      if (parsedUrl.pathname === '/oauth/callback') {
        const code = parsedUrl.query.code;
        
        if (code) {
          try {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h2 style="color: #10B981;">✅ Authorization Successful!</h2>
                  <p>You can close this window and return to the terminal.</p>
                  <p>Processing your authorization code...</p>
                </body>
              </html>
            `);
            
            server.close();
            
            // Exchange code for tokens
            const tokens = await exchangeCodeForTokens(code);
            resolve(tokens);
            
          } catch (error) {
            server.close();
            reject(error);
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h2 style="color: #DC2626;">❌ Authorization Failed</h2>
                <p>No authorization code received.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error('No authorization code received'));
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });
    
    server.listen(3001, () => {
      console.log('\n✅ Server started on http://localhost:3001');
    });
    
    server.on('error', reject);
  });
}

function updateEnvFile(refreshToken) {
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }
  
  // Update or add the refresh token
  if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
    envContent = envContent.replace(
      /GOOGLE_REFRESH_TOKEN=.*/,
      `GOOGLE_REFRESH_TOKEN=${refreshToken}`
    );
  } else {
    envContent += `\nGOOGLE_REFRESH_TOKEN=${refreshToken}\n`;
  }
  
  fs.writeFileSync(envPath, envContent);
  console.log('\n✅ Updated .env file with new refresh token');
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   Gmail API OAuth2 Refresh Token Generator                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\n📋 Configuration:');
  console.log(`   Client ID:     ${CONFIG.clientId.substring(0, 20)}...`);
  console.log(`   Sender Email:  ${CONFIG.senderEmail}`);
  console.log(`   Redirect URI:   ${CONFIG.redirectUri}`);
  console.log('\n🔐 Scopes:');
  CONFIG.scopes.forEach(scope => console.log(`   - ${scope}`));
  
  // Generate auth URL
  const authUrl = generateAuthUrl();
  
  console.log('\n📝 Steps to obtain refresh token:\n');
  console.log('   1. Open this URL in your browser:\n');
  console.log(`   ${authUrl}\n`);
  console.log('   2. Sign in with your Google account');
  console.log('   3. Grant permission for the requested scopes');
  console.log('   4. You will be redirected to a local server');
  console.log('   5. The refresh token will be saved to .env\n');
  
  // Try to open browser automatically
  const open = require('child_process').exec;
  
  try {
    if (process.platform === 'darwin') {
      open('open "' + authUrl + '"');
    } else if (process.platform === 'linux') {
      open('xdg-open "' + authUrl + '"');
    } else if (process.platform === 'win32') {
      open('start "" "' + authUrl + '"');
    }
    console.log('   🌐 Browser opened automatically!\n');
  } catch (e) {
    console.log('   ⚠️  Please manually open the URL in your browser.\n');
  }
  
  // Wait for authorization
  console.log('⏳ Waiting for authorization...\n');
  
  try {
    const tokens = await startServer();
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║   ✅ OAuth2 Authorization Successful!                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    
    console.log('\n📄 Token Details:');
    console.log(`   Access Token:  ${tokens.access_token ? '✓ Received (not shown)' : '✗ Not received'}`);
    console.log(`   Token Type:    ${tokens.token_type || 'N/A'}`);
    console.log(`   Expires In:   ${tokens.expires_in || 'N/A'} seconds`);
    console.log(`   Refresh Token: ${tokens.refresh_token ? '✓ Received' : '✗ Not received'}`);
    
    if (tokens.refresh_token) {
      // Save to .env
      updateEnvFile(tokens.refresh_token);
      
      console.log('\n📋 Next Steps:');
      console.log('   1. Your .env file has been updated with the new refresh token');
      console.log('   2. Test the Gmail API:');
      console.log('      npm run dev');
      console.log('      curl http://localhost:3000/api/settings/gmail/test');
      console.log('   3. Send a test email to verify it works');
    } else {
      console.log('\n⚠️  Warning: No refresh token received.');
      console.log('   This may happen if you have already authorized this app.');
      console.log('   Try revoking access in your Google account and try again.');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Make sure the OAuth2 client ID and secret are correct');
    console.log('   2. Check that the redirect URI matches your Google Cloud Console settings');
    console.log('   3. Ensure the Gmail API is enabled in your Google Cloud project');
  }
  
  process.exit(0);
}

main().catch(console.error);
