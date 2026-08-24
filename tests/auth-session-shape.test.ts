/**
 * Regression: GET /api/auth/session selected a minimal column list that
 * omitted avatar_url / address / emergency_contact_name /
 * emergency_contact_phone. AuthContext, the /profile page, and the dashboard
 * sidebar avatar all hydrate from THIS endpoint, so a photo uploaded through
 * the media engine (mirrored to users.avatar_url) and saved personal info
 * appeared "set but not displayed" after every page load / refreshSession —
 * only the login response (select('*')) carried them.
 *
 * The session route must select AND return the full profile shape.
 */

import { NextRequest } from 'next/server';

export {};

// The route now resolves the JWT secret via getJwtSecret(), which fails
// closed when SUPABASE_JWT_SECRET is unset — the test env must provide one.
process.env.SUPABASE_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

const SINGLE_RESULT = {
  data: {
    id: 'u1',
    email: 'admin@yunite.test',
    full_name: 'Yunite Super Administrator',
    role: 'super_admin',
    phone: '+254700000000',
    avatar_url: 'https://storage.test/yunite-profiles/u1/USER_PHOTO.png?v=3',
    address: 'Nairobi, Kenya',
    emergency_contact_name: 'Jane Doe',
    emergency_contact_phone: '+254711111111',
    is_active: true,
    last_login: null,
    created_at: '2026-01-01T00:00:00Z',
    must_change_password: false,
  },
  error: null,
};

let capturedSelect: string | null = null;

jest.mock('jose', () => ({
  jwtVerify: jest.fn().mockResolvedValue({ payload: { user_id: 'u1' } }),
}));
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn().mockResolvedValue({
    from: () => ({
      select: (cols: string) => {
        capturedSelect = cols;
        return { eq: () => ({ single: () => Promise.resolve(SINGLE_RESULT) }) };
      },
    }),
  }),
}));

function req(withCookie = true) {
  return new NextRequest('https://x.test/api/auth/session', {
    headers: withCookie ? { cookie: 'auth_token=fake-token' } : {},
  });
}

describe('GET /api/auth/session profile shape', () => {
  let route: typeof import('@/app/api/auth/session/route');

  beforeEach(async () => {
    jest.resetModules();
    capturedSelect = null;
    route = await import('@/app/api/auth/session/route');
  });

  it('selects the full profile columns (not the minimal legacy list)', async () => {
    await route.GET(req());
    expect(capturedSelect).toBeTruthy();
    for (const col of [
      'avatar_url',
      'address',
      'emergency_contact_name',
      'emergency_contact_phone',
      'full_name',
      'role',
      'phone',
    ]) {
      expect(capturedSelect).toContain(col);
    }
  });

  it('returns avatar_url, address and emergency contact in the user payload', async () => {
    const res = await route.GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const user = body.data.user;
    expect(user.full_name).toBe('Yunite Super Administrator');
    expect(user.avatar_url).toBe(SINGLE_RESULT.data.avatar_url);
    expect(user.address).toBe('Nairobi, Kenya');
    expect(user.emergency_contact_name).toBe('Jane Doe');
    expect(user.emergency_contact_phone).toBe('+254711111111');
    expect(body.data.isSuperAdmin).toBe(true);
    expect(body.data.isAdmin).toBe(true);
  });

  it('returns 401 without a session cookie', async () => {
    const res = await route.GET(req(false));
    expect(res.status).toBe(401);
  });
});
