# Gmail API Setup Guide

This guide explains how to set up Gmail API credentials for YUNITE OS.

## The Problem

Render Free tier blocks outbound SMTP connections on port 587. YUNITE OS uses Gmail API via OAuth2 to send emails through HTTPS instead of SMTP.

## Architecture

```
YUNITE OS → Render Free Backend → HTTPS → Gmail API → info.yunite.ke@gmail.com → Recipient
```

## Prerequisites

1. A Google account with Gmail
2. Access to Google Cloud Console (free)

## Step 1: Create/Configure Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable the **Gmail API**:
   - Go to "APIs & Services" → "Library"
   - Search for "Gmail API"
   - Click "Enable"

## Step 2: Create OAuth2 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: **Web application**
4. Name: `YUNITE Gmail API`
5. **Authorized redirect URIs**: Add `http://localhost:3001/oauth/callback`
6. Click "Create"
7. Copy the **Client ID** and **Client Secret**

## Step 3: Generate Refresh Token

### Option A: Using the Token Generator Script (Recommended)

```bash
cd /workspace/project/YUNITE-CBO-PORTAL
node scripts/generate-gmail-refresh-token.js
```

The script will:
1. Start a local server on port 3001
2. Open a browser window for Google authorization
3. Save the refresh token to `.env` automatically

### Option B: Using Google OAuth2 Playground

1. Go to [OAuth2 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in the top right
3. Check "Use your own OAuth credentials"
4. Enter your **Client ID** and **Client Secret**
5. In the left sidebar, expand "Gmail API v1"
6. Select `https://www.googleapis.com/auth/gmail.send`
7. Click "Authorize APIs"
8. Sign in with your Google account and grant permission
9. Click "Exchange authorization code for tokens"
10. Copy the **refresh_token**

## Step 4: Configure Environment Variables

Add these to your `.env` file:

```bash
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REFRESH_TOKEN=your_refresh_token
GOOGLE_SENDER_EMAIL=info.yunite.ke@gmail.com
GOOGLE_SENDER_NAME=YUNITE CBO
```

For **Render deployment**, add these as Environment Variables in the Render dashboard.

## Step 5: Test the Integration

### Quick Test (No Authentication Required)

```bash
node scripts/test-gmail-api-direct.js
```

### API Test (Requires Admin Login)

```bash
# Start the server
npm run dev

# Check configuration status (GET - public)
curl http://localhost:3000/api/settings/gmail/test

# Test connection (POST - requires admin auth)
curl -X POST http://localhost:3000/api/settings/gmail/test \
  -H "Content-Type: application/json" \
  -H "Cookie: auth_token=<your_token>" \
  -d '{"action":"connection"}'
```

## Troubleshooting

### Error: `invalid_grant`

**Cause**: The refresh token is invalid, expired, or revoked.

**Solutions**:
1. Generate a new refresh token
2. Make sure the refresh token was issued for the same client ID
3. Check if the token has the correct scopes

### Error: `redirect_uri_mismatch`

**Cause**: The redirect URI in your code doesn't match the registered URI.

**Solutions**:
1. Add `http://localhost:3001/oauth/callback` to authorized redirect URIs in Google Cloud Console
2. Or use OAuth2 Playground which has pre-configured redirect URIs

### Error: `Access not configured`

**Cause**: Gmail API is not enabled for the project.

**Solution**: Enable Gmail API in Google Cloud Console → APIs & Services → Library

### SMTP Fallback

If Gmail API is not configured, YUNITE will automatically fall back to SMTP (if SMTP credentials are available).

## Security Notes

- ✅ Never commit credentials to GitHub
- ✅ Use environment variables, not hardcoded values
- ✅ OAuth2 uses refresh tokens, not passwords
- ✅ Credentials are only stored server-side
- ✅ No credentials are exposed in API responses or logs

## Files Involved

- `src/lib/services/notifications/gmail-api.adapter.ts` - Gmail API adapter
- `src/lib/services/notifications/email.service.ts` - Unified email service
- `src/app/api/settings/gmail/test/route.ts` - Test endpoint
- `scripts/generate-gmail-refresh-token.js` - Token generator
- `scripts/test-gmail-api-direct.js` - Direct test script

## Environment Variables Summary

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_CLIENT_ID` | OAuth2 Client ID | Yes |
| `GOOGLE_CLIENT_SECRET` | OAuth2 Client Secret | Yes |
| `GOOGLE_REFRESH_TOKEN` | OAuth2 Refresh Token | Yes |
| `GOOGLE_SENDER_EMAIL` | Email address to send from | Yes |
| `GOOGLE_SENDER_NAME` | Display name for sender | No (default: YUNITE) |
