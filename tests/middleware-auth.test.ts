/**
 * Middleware fail-closed authentication regression tests.
 *
 * Guards the security hardening that removed (a) the hardcoded JWT fallback
 * secret and (b) the blanket "all GET /api/* requests are public" rule.
 * Every /api/* route must require a valid session cookie unless it is on the
 * explicit public allowlist, and a token signed with the old public fallback
 * secret must never be accepted.
 *
 * Runs without a database or live server: the middleware only verifies the
 * JWT signature (it does not touch the DB).
 */

import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { middleware } from '@/middleware';
import { getJwtSecret } from '@/lib/auth/jwt-secret';

const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';
// The insecure fallback that used to ship in the source code. A token signed
// with it must be rejected even though it is structurally valid.
const OLD_PUBLIC_FALLBACK = 'your-secret-key-at-least-32-chars';

function req(pathname: string, cookie?: string, method = 'GET'): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(`https://yunite.test${pathname}`, { method, headers });
}

async function signWith(secret: string): Promise<string> {
  return new SignJWT({ user_id: 'u1', email: 'a@b.c', role: 'super_admin', session_id: 's1' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

function isPassThrough(res: NextResponse): boolean {
  // NextResponse.next() carries the x-middleware-next signal header.
  return res.status === 200 && res.headers.get('x-middleware-next') === '1';
}

describe('middleware authentication boundaries', () => {
  const OLD_ENV = process.env.SUPABASE_JWT_SECRET;

  beforeAll(() => {
    process.env.SUPABASE_JWT_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    process.env.SUPABASE_JWT_SECRET = OLD_ENV;
  });

  it('rejects an unauthenticated GET to a member-data API route', async () => {
    const res = await middleware(req('/api/members'));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Authentication required');
  });

  it('rejects unauthenticated GETs to other previously-public data routes', async () => {
    for (const path of ['/api/transactions', '/api/loans', '/api/fines', '/api/settings', '/api/audit', '/api/dashboard']) {
      const res = await middleware(req(path));
      expect(res.status).toBe(401);
    }
  });

  it('rejects a token signed with the old public fallback secret', async () => {
    const forged = await signWith(OLD_PUBLIC_FALLBACK);
    const res = await middleware(req('/api/members', `auth_token=${forged}`));
    expect(res.status).toBe(401);
  });

  it('accepts a token signed with the configured secret', async () => {
    const valid = await signWith(TEST_SECRET);
    const res = await middleware(req('/api/members', `auth_token=${valid}`));
    expect(isPassThrough(res)).toBe(true);
  });

  it('keeps the public document verification route reachable without a session', async () => {
    const res = await middleware(req('/api/reports/verify/YP-DOC/FIN/2026/ABC'));
    expect(isPassThrough(res)).toBe(true);
  });

  it('does NOT treat /api/reports as public (only the verify subpath is)', async () => {
    for (const path of ['/api/reports', '/api/reports/generate', '/api/reports/history']) {
      const res = await middleware(req(path));
      expect(res.status).toBe(401);
    }
  });

  it('keeps the other intentional public paths reachable without a session', async () => {
    for (const path of [
      '/api/health',
      '/api/auth/login',
      '/api/member-registration-submissions',
      '/api/member-registration-submissions/lookup',
      '/api/cron/automation',
      '/api/cron/ai-investigations',
    ]) {
      const res = await middleware(req(path, undefined, 'POST'));
      expect(isPassThrough(res)).toBe(true);
    }
  });

  it('lets /api/v1/* through to the gateway without a session cookie', async () => {
    const res = await middleware(req('/api/v1/members'));
    expect(isPassThrough(res)).toBe(true);
  });

  it('does not block non-API page routes', async () => {
    const res = await middleware(req('/dashboard/members'));
    expect(isPassThrough(res)).toBe(true);
  });
});

describe('getJwtSecret', () => {
  const OLD_ENV = process.env.SUPABASE_JWT_SECRET;
  afterEach(() => {
    process.env.SUPABASE_JWT_SECRET = OLD_ENV;
  });

  it('throws when the secret is missing', () => {
    delete process.env.SUPABASE_JWT_SECRET;
    expect(() => getJwtSecret()).toThrow(/SUPABASE_JWT_SECRET/);
  });

  it('throws when the secret is shorter than 32 characters', () => {
    process.env.SUPABASE_JWT_SECRET = 'short-secret';
    expect(() => getJwtSecret()).toThrow(/SUPABASE_JWT_SECRET/);
  });

  it('returns the encoded secret when properly configured', () => {
    process.env.SUPABASE_JWT_SECRET = TEST_SECRET;
    const secret = getJwtSecret();
    expect(secret).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(secret)).toBe(TEST_SECRET);
  });
});
