/**
 * Email delivery channel selection & fallback tests.
 *
 * Guards the permanent fixes for the failed-notifications backlog:
 * 1. isGmailApiConfigured() requires the COMPLETE credential set (AND logic) —
 *    a single stray GOOGLE_* env var must not route delivery to an
 *    unconfigured Gmail API.
 * 2. encodeEmail() sets the From header to the SENDER address (a previous bug
 *    put the recipient in From, which Gmail rejects on every send).
 * 3. EmailService.send() uses Gmail API first and falls back to SMTP on any
 *    Gmail failure (and vice versa never silently drops the email).
 *
 * Channel calls are spied (not mocked with fake implementations of business
 * logic): real Gmail/SMTP delivery needs network + credentials, so the test
 * verifies the routing/fallback decision, which is the logic being fixed.
 */

import { gmailApiAdapter, encodeEmail } from '@/lib/services/notifications/gmail-api.adapter';
import { emailService } from '@/lib/services/notifications/email.service';

const GOOGLE_ENV_KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'GOOGLE_SENDER_EMAIL',
] as const;

describe('GmailApiAdapter.isGmailApiConfigured', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of GOOGLE_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of GOOGLE_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it('returns false when no Google credentials are set', () => {
    expect(gmailApiAdapter.isGmailApiConfigured()).toBe(false);
  });

  it('returns false when only ONE stray env var is set (the 38-failure root cause)', () => {
    process.env.GOOGLE_SENDER_EMAIL = 'info@example.com';
    expect(gmailApiAdapter.isGmailApiConfigured()).toBe(false);
  });

  it.each([0, 1, 2, 3])('returns false when exactly one credential is missing (index %i)', (missingIdx) => {
    GOOGLE_ENV_KEYS.forEach((key, idx) => {
      if (idx !== missingIdx) process.env[key] = 'value';
    });
    expect(gmailApiAdapter.isGmailApiConfigured()).toBe(false);
  });

  it('returns true only when ALL four credentials are set', () => {
    for (const key of GOOGLE_ENV_KEYS) process.env[key] = 'value';
    expect(gmailApiAdapter.isGmailApiConfigured()).toBe(true);
  });
});

describe('encodeEmail From header', () => {
  function decodeRaw(raw: string): string {
    const base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  }

  it('uses the sender address in From, never the recipient', () => {
    const { raw, headers } = encodeEmail(
      { to: 'member@example.com', toName: 'Test Member', subject: 'Hi', htmlBody: '<p>Hello</p>' },
      'YUNITE',
      'info.yunite.ke@gmail.com'
    );

    expect(headers['From']).toContain('info.yunite.ke@gmail.com');
    expect(headers['From']).not.toContain('member@example.com');

    const decoded = decodeRaw(raw);
    expect(decoded).toContain('From: "YUNITE" <info.yunite.ke@gmail.com>');
    expect(decoded).toContain('To: "Test Member" <member@example.com>');
    expect(decoded).toContain('Subject: Hi');
    expect(decoded).not.toMatch(/From:.*member@example\.com/);
  });

  it('produces valid base64url (no +, /, or = padding)', () => {
    const { raw } = encodeEmail(
      { to: 'a@b.co', subject: 'S', htmlBody: '<p>+/> padding test</p>' },
      'YUNITE',
      'sender@example.com'
    );
    expect(raw).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});

describe('EmailService.send channel routing', () => {
  const message = { to: 'member@example.com', subject: 'Test', htmlBody: '<p>Hi</p>' };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends via Gmail API when available and successful (SMTP untouched)', async () => {
    jest.spyOn(gmailApiAdapter, 'isAvailable').mockResolvedValue(true);
    jest.spyOn(gmailApiAdapter, 'send').mockResolvedValue({ success: true, messageId: 'gmail-123' });
    const smtpSpy = jest.spyOn(emailService as any, 'sendViaSmtp');

    const result = await emailService.send(message);

    expect(result.success).toBe(true);
    expect(result.method).toBe('gmail_api');
    expect(result.messageId).toBe('gmail-123');
    expect(smtpSpy).not.toHaveBeenCalled();
  });

  it('falls back to SMTP when Gmail API delivery fails', async () => {
    jest.spyOn(gmailApiAdapter, 'isAvailable').mockResolvedValue(true);
    jest.spyOn(gmailApiAdapter, 'send').mockResolvedValue({
      success: false,
      error: 'Gmail API error: 429 quota exceeded',
      errorCode: 'HTTP_429',
    });
    const smtpSpy = jest
      .spyOn(emailService as any, 'sendViaSmtp')
      .mockResolvedValue({ success: true, messageId: 'smtp-456', method: 'smtp' });

    const result = await emailService.send(message);

    expect(smtpSpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.method).toBe('smtp');
  });

  it('falls back to SMTP when Gmail API is not configured (partial env vars)', async () => {
    jest.spyOn(gmailApiAdapter, 'isAvailable').mockResolvedValue(false);
    const gmailSendSpy = jest.spyOn(gmailApiAdapter, 'send');
    const smtpSpy = jest
      .spyOn(emailService as any, 'sendViaSmtp')
      .mockResolvedValue({ success: true, messageId: 'smtp-789', method: 'smtp' });

    const result = await emailService.send(message);

    expect(gmailSendSpy).not.toHaveBeenCalled();
    expect(smtpSpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('reports combined error and stays retryable when Gmail fails transiently and SMTP is unconfigured', async () => {
    jest.spyOn(gmailApiAdapter, 'isAvailable').mockResolvedValue(true);
    jest.spyOn(gmailApiAdapter, 'send').mockResolvedValue({
      success: false,
      error: 'Gmail API error: 500 backend error',
      errorCode: 'HTTP_500',
    });
    jest.spyOn(emailService as any, 'sendViaSmtp').mockResolvedValue({
      success: false,
      error: 'Email service not configured: SMTP password is missing',
      method: 'smtp',
      nonRetryable: true,
    });

    const result = await emailService.send(message);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Gmail API');
    expect(result.error).toContain('SMTP');
    // Transient Gmail failure must not be marked non-retryable just because
    // SMTP is unconfigured — the next tick may deliver via Gmail.
    expect(result.nonRetryable).toBe(false);
  });

  it('is non-retryable only when BOTH channels fail with configuration errors', async () => {
    jest.spyOn(gmailApiAdapter, 'isAvailable').mockResolvedValue(true);
    jest.spyOn(gmailApiAdapter, 'send').mockResolvedValue({
      success: false,
      error: 'invalid_grant',
      errorCode: 'AUTH_FAILED',
    });
    jest.spyOn(emailService as any, 'sendViaSmtp').mockResolvedValue({
      success: false,
      error: 'Email service not configured: SMTP password is missing',
      method: 'smtp',
      nonRetryable: true,
    });

    const result = await emailService.send(message);

    expect(result.success).toBe(false);
    expect(result.nonRetryable).toBe(true);
  });
});
