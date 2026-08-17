import { NextRequest } from 'next/server';

// Capture the params the search service receives, so we can assert the GET
// handler forwards the dashboard's `search` query param (the bug was that it
// only read `query`, so the term was dropped and the wrong member returned).
const searchCalls: { query?: string; status?: string }[] = [];

jest.mock('@/lib/services', () => ({
  memberRegistrationService: {
    search: async (params: { query?: string; status?: string; page?: number; limit?: number }) => {
      searchCalls.push({ query: params.query, status: params.status });
      return { members: [], total: 0, page: params.page ?? 1, limit: params.limit ?? 20 };
    },
  },
}));

// Stub the auth barrel so we don't pull the client-side AuthContext.tsx (JSX)
// into a node jest run. Only requirePermission's success path is exercised.
jest.mock('@/lib/auth', () => ({
  requirePermission: async (request: Request, _module: string, _action: string) => {
    const cookie = request.headers.get('cookie') || '';
    const hasAdmin = cookie.includes('auth_token=admin');
    if (!hasAdmin) {
      return { success: false, status: 401, error: 'Unauthorized' };
    }
    return {
      success: true,
      user: { user_id: 'u-1', email: 'a@b.co', role: 'super_admin' },
    };
  },
  unauthorizedResponse: (error: string) =>
    Response.json({ success: false, error }, { status: 401 }),
  forbiddenResponse: (error: string) =>
    Response.json({ success: false, error }, { status: 403 }),
}));

async function buildGetRequest(url: string, authed = true) {
  const req = new NextRequest(url, {
    method: 'GET',
    headers: authed ? { cookie: `auth_token=admin` } : undefined,
  });
  return req;
}

describe('GET /api/members search param forwarding', () => {
  beforeEach(() => {
    searchCalls.length = 0;
  });

  it('forwards the `search` query param to the search service', async () => {
    const { GET } = await import('@/app/api/members/route');
    const req = await buildGetRequest('http://localhost/api/members?search=0742101089');
    const res = await GET(req);
    expect(res.status).not.toBe(401);
    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0].query).toBe('0742101089');
  });

  it('still forwards the legacy `query` param when present', async () => {
    const { GET } = await import('@/app/api/members/route');
    const req = await buildGetRequest('http://localhost/api/members?query=0742101089');
    const res = await GET(req);
    expect(res.status).not.toBe(401);
    expect(searchCalls[0].query).toBe('0742101089');
  });

  it('prefers `query` when both `query` and `search` are provided', async () => {
    const { GET } = await import('@/app/api/members/route');
    const req = await buildGetRequest('http://localhost/api/members?query=aaa&search=bbb');
    await GET(req);
    expect(searchCalls[0].query).toBe('aaa');
  });

  it('does not drop the search term when only `search` is sent', async () => {
    const { GET } = await import('@/app/api/members/route');
    const req = await buildGetRequest('http://localhost/api/members?search=Elvis');
    await GET(req);
    expect(searchCalls[0].query).toBeTruthy();
    expect(searchCalls[0].query).not.toBeUndefined();
  });

  it('returns 401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/members/route');
    const req = await buildGetRequest('http://localhost/api/members?search=Elvis', false);
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(searchCalls).toHaveLength(0);
  });
});
