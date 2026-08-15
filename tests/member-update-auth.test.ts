import { SignJWT } from 'jose';
import { NextRequest } from 'next/server';

const JWT_SECRET = new TextEncoder().encode('test-jwt-secret-at-least-32-chars-long');

async function makeToken(role: string) {
  return new SignJWT({ user_id: 'u-1', email: 'a@b.co', role, session_id: 's-1' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(JWT_SECRET);
}

// The route handlers call createServiceClient() to hit the DB. Stub the
// supabase server module so we can exercise the AUTH boundary (the actual
// bug) without a live database.
jest.mock('@/lib/supabase/server', () => {
  const chain = () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: null, error: null }) }),
      }),
      insert: async () => ({ error: null }),
      upsert: async () => ({ error: null }),
      update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }) }),
    }),
  });
  return {
    createServiceClient: async () => chain(),
    createClient: async () => chain(),
  };
});

// transactionEngine is referenced by GET only; stub it so the module loads.
jest.mock('@/lib/services/transaction.engine', () => ({
  transactionEngine: { calculateAllBalances: async () => ({ savings: 0 }) },
}));

jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

async function buildRequest(
  method: 'PUT' | 'DELETE',
  body: Record<string, unknown>,
  token?: string,
) {
  const req = new NextRequest(`http://localhost/api/members/m-1`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (token) {
    (req.cookies as { set: (n: string, v: string) => void }).set('auth_token', token);
  }
  return req;
}

describe('PUT /api/members/[id] authorization', () => {
  const OLD_SECRET = process.env.SUPABASE_JWT_SECRET;

  beforeAll(() => {
    process.env.SUPABASE_JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
  });
  afterAll(() => {
    if (OLD_SECRET === undefined) delete process.env.SUPABASE_JWT_SECRET;
    else process.env.SUPABASE_JWT_SECRET = OLD_SECRET;
  });

  it('returns 401 Unauthorized when there is no auth_token cookie', async () => {
    const { PUT } = await import('@/app/api/members/[id]/route');
    const req = await buildRequest('PUT', { first_name: 'Jane' });
    const res = await PUT(req, { params: Promise.resolve({ id: 'm-1' }) });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('does NOT reject an authenticated super_admin as Unauthorized', async () => {
    const { PUT } = await import('@/app/api/members/[id]/route');
    const token = await makeToken('super_admin');
    const req = await buildRequest('PUT', { first_name: 'Jane' }, token);
    const res = await PUT(req, { params: Promise.resolve({ id: 'm-1' }) });
    // With the bug, this was 401. The fix authenticates via the custom JWT
    // cookie, so a super_admin must pass the auth gate (status != 401).
    expect(res.status).not.toBe(401);
  });

  it('forbids a viewer from updating a member (403, not 401)', async () => {
    const { PUT } = await import('@/app/api/members/[id]/route');
    const token = await makeToken('viewer');
    const req = await buildRequest('PUT', { first_name: 'Jane' }, token);
    const res = await PUT(req, { params: Promise.resolve({ id: 'm-1' }) });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/members/[id] authorization', () => {
  const OLD_SECRET = process.env.SUPABASE_JWT_SECRET;

  beforeAll(() => {
    process.env.SUPABASE_JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
  });
  afterAll(() => {
    if (OLD_SECRET === undefined) delete process.env.SUPABASE_JWT_SECRET;
    else process.env.SUPABASE_JWT_SECRET = OLD_SECRET;
  });

  it('returns 401 when there is no auth_token cookie', async () => {
    const { DELETE } = await import('@/app/api/members/[id]/route');
    const req = await buildRequest('DELETE', { reason: 'x' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'm-1' }) });
    expect(res.status).toBe(401);
  });

  it('does NOT reject a super_admin as Unauthorized', async () => {
    const { DELETE } = await import('@/app/api/members/[id]/route');
    const token = await makeToken('super_admin');
    const req = await buildRequest('DELETE', { reason: 'x' }, token);
    const res = await DELETE(req, { params: Promise.resolve({ id: 'm-1' }) });
    expect(res.status).not.toBe(401);
  });
});
