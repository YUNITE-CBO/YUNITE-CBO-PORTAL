/**
 * EmailService fail-fast behavior tests.
 *
 * Validates the classification logic that decides whether a delivery failure
 * is a non-retryable configuration error (missing credentials, revoked OAuth
 * token, EAUTH, etc.) vs. a transient failure that should be retried.
 *
 * Configuration errors must fail fast so they don't burn all 3 retry attempts.
 */

import { isConfigurationError } from '@/lib/services/notifications/email.service';

describe('EmailService fail-fast: isConfigurationError', () => {
  const configErrors = [
    'Email service not configured (neither Gmail API nor SMTP available)',
    'Email service not configured: SMTP password is missing',
    'Missing credentials for "PLAIN"',
    'Gmail API not configured - missing required credentials',
    'invalid_grant',
    'unauthorized_client',
    'invalid_client',
    'Error: Missing credentials for "PLAIN" { code: \'EAUTH\', command: \'API\' }',
  ];

  it.each(configErrors)('classifies %p as a non-retryable configuration error', (message) => {
    expect(isConfigurationError(message)).toBe(true);
  });

  const transientErrors = [
    'connect ETIMEDOUT smtp.gmail.com:587',
    'Greeting never received',
    'connect ECONNREFUSED 127.0.0.1:587',
    'Message size exceeded',
    'Recipient address rejected: User unknown',
    'Failed to obtain Gmail access token',
    'Unknown error',
    '',
  ];

  it.each(transientErrors)('classifies %p as a retryable transient error', (message) => {
    expect(isConfigurationError(message)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isConfigurationError('MISSING CREDENTIALS')).toBe(true);
    expect(isConfigurationError('eauth')).toBe(true);
    expect(isConfigurationError('NOT CONFIGURED')).toBe(true);
  });
});
