/**
 * SECURITY HARDENING REGRESSION TESTS (2026-08-26)
 *
 * Guards the six critical findings from the security audit:
 *  1. No live credentials in tracked docs/tests (static source assertions)
 *  2. POST /api/settings/reset-data requires a verified super_admin session
 *  3. POST /api/settings/database-reset derives identity from the session
 *     (body user_id is NOT trusted) + level 3 requires the real password
 *  4. POST /api/transactions/reverse requires transactions.reverse (admin+)
 *  5. /api/notifications/email requires notifications.send_email (admin+)
 *  6. Public member lookup returns minimized PII and is rate-limited
 *
 * Plus: PostgREST .or() filter-injection sanitizer + legacy-route rate limits.
 */

import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import bcrypt from 'bcryptjs';

export {};

process.env.SUPABASE_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

// ---------------------------------------------------------------------------
// Auth mock: the cookie token string selects the role.
// ---------------------------------------------------------------------------
const TOKEN_ROLES: Record<string, { user_id: string; email: string; role: string }> = {
  'token-super': { user_id: 'u-super', email: 'super@yunite.test', role: 'super_admin' },
  'token-admin': { user_id: 'u-admin', email: 'admin@yunite.test', role: 'admin' },
  'token-staff': { user_id: 'u-staff', email: 'staff@yunite.test', role: 'staff' },
  'token-viewer': { user_id: 'u-viewer', email: 'viewer@yunite.test', role: 'viewer' },
};

jest.mock('jose', () => ({
  jwtVerify: jest.fn(async (token: string) => {
    const payload = TOKEN_ROLES[token];
    if (!payload) throw new Error('invalid token');
    return { payload };
  }),
}));

// ---------------------------------------------------------------------------
// Supabase mock: generic query layer good enough for the guarded routes.
// ---------------------------------------------------------------------------
const passwordHash = bcrypt.hashSync('correct-horse', 4);
let auditInserts: any[] = [];
let deletedTables: string[] = [];

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(async () => ({
    from: (table: string) => {
      const api: any = {
        select: () => api,
        eq: () => api,
        single: async () => {
          if (table === 'users') return { data: { password_hash: passwordHash }, error: null };
          return { data: null, error: null };
        },
        insert: async (rows: any) => {
          if (table === 'audit_logs') auditInserts.push(...(Array.isArray(rows) ? rows : [rows]));
          return { data: null, error: null };
        },
        delete: () => ({
          neq: async () => {
            deletedTables.push(table);
            return { error: null };
          },
        }),
      };
      return api;
    },
  })),
}));

jest.mock('@/lib/services/database-admin/database-reset.service', () => ({
  databaseResetService: {
    executeReset: jest.fn(async (config: any) => ({
      id: 'report-1',
      status: 'completed',
      reset_level: config.level,
      stats: {},
      system_state: {},
      validation_passed: true,
      validation_errors: [],
      archived: [],
      archive_id: null,
      completed_at: new Date().toISOString(),
      phases_completed: 5,
    })),
    getDatabaseStats: jest.fn(async () => ({})),
    getSystemState: jest.fn(async () => ({})),
    getResetLevelConfig: jest.fn(() => ({
      name: 'L', description: 'D', tables_to_delete: [], preserve_tables: [],
    })),
  },
}));

jest.mock('@/lib/services', () => ({
  transactionEngine: {
    reverse: jest.fn(async () => ({ reversal: { id: 'rev-1' }, balances: {} })),
  },
}));

jest.mock('@/lib/services/notifications', () => ({
  emailService: {
    getQueueStats: jest.fn(async () => ({ pending: 1, processing: 0, sent: 5, failed: 0 })),
    testConnection: jest.fn(async () => ({ success: true, message: 'ok' })),
    send: jest.fn(async () => ({ success: true, messageId: 'm-1' })),
    processQueue: jest.fn(async () => ({ processed: 0 })),
    retryFailed: jest.fn(async () => 0),
  },
}));

jest.mock('@/lib/services/member-registration-submission.service', () => ({
  memberRegistrationSubmissionService: {
    lookupExistingMember: jest.fn(async ({ phone }: any) =>
      phone === '0712000000'
        ? {
            id: 'm-1', member_number: 'YUN-0001', status: 'active',
            first_name: 'Jane', last_name: 'Doe', email: 'jane@x.com',
            phone: '0712000000', id_number: '99887766', kra_pin: 'A009999',
            date_of_birth: '1990-01-01', gender: 'female', marital_status: 'single',
            nationality: 'Kenyan', physical_address: 'Nairobi', postal_address: '00100',
            occupation: 'Teacher', employer: 'School', employer_address: 'Nbi',
            next_of_kin_name: 'Kin', next_of_kin_phone: '0700', next_of_kin_relationship: 'Sister',
            emergency_contact_name: 'Em', emergency_contact_phone: '0711',
            emergency_contact_relationship: 'Brother',
          }
        : null
    ),
  },
}));

jest.mock('@/lib/services/auth.service', () => ({
  authService: {
    login: jest.fn(async () => ({ success: false })),
  },
  parseDeviceInfo: jest.fn(() => ({})),
}));

jest.mock('@/lib/services/notifications/auth-notification.service', () => ({
  authNotificationService: {
    notifyUserLogin: jest.fn(),
    notifyAdminsOfLogin: jest.fn(),
  },
}));

function req(url: string, opts: { token?: string; method?: string; body?: any; ip?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.cookie = `auth_token=${opts.token}`;
  if (opts.ip) headers['x-forwarded-for'] = opts.ip;
  return new NextRequest(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

beforeEach(() => {
  auditInserts = [];
  deletedTables = [];
  require('@/lib/api/simple-rate-limit')._resetSimpleRateLimit();
});

// ===========================================================================
// 1. Credentials must never live in tracked files
// ===========================================================================
describe('credential hygiene', () => {
  it('tracked docs/tests contain none of the previously leaked credential values', () => {
    const files = [
      'docs/FORENSIC_SYSTEMS_AUDIT_REPORT.md',
      'docs/DEVELOPER_INSTRUCTIONS.md',
      'tests/auth.test.ts',
      'tests/integration.test.ts',
    ];
    const leakedPatterns = ['Yuniteke2026', 'TtO8PKoOPadVAMJnCaUiAxk0zot8W1Z0', 'yuxh yrfi', 'sbp_d4e6df28'];
    for (const f of files) {
      const content = readFileSync(join(__dirname, '..', f), 'utf8');
      for (const p of leakedPatterns) {
        expect(content.includes(p)).toBe(false);
      }
    }
  });
});

// ===========================================================================
// 2. POST /api/settings/reset-data
// ===========================================================================
describe('POST /api/settings/reset-data authorization', () => {
  it('rejects unauthenticated callers (401)', async () => {
    const { POST } = await import('@/app/api/settings/reset-data/route');
    const res = await POST(req('http://x/api/settings/reset-data', { method: 'POST', body: { confirm_reset: true } }));
    expect(res.status).toBe(401);
  });

  it.each(['token-viewer', 'token-staff', 'token-admin'])('rejects %s (403) — even with confirm_reset', async (token) => {
    const { POST } = await import('@/app/api/settings/reset-data/route');
    const res = await POST(req('http://x/api/settings/reset-data', { method: 'POST', token, body: { confirm_reset: true } }));
    expect(res.status).toBe(403);
    expect(deletedTables).toHaveLength(0);
  });

  it('super_admin without confirmation gets 400 (auth passed, nothing deleted)', async () => {
    const { POST } = await import('@/app/api/settings/reset-data/route');
    const res = await POST(req('http://x/api/settings/reset-data', { method: 'POST', token: 'token-super', body: {} }));
    expect(res.status).toBe(400);
    expect(deletedTables).toHaveLength(0);
  });

  it('super_admin + confirmation succeeds and audits the SESSION user, not a body user_id', async () => {
    const { POST } = await import('@/app/api/settings/reset-data/route');
    const res = await POST(req('http://x/api/settings/reset-data', {
      method: 'POST', token: 'token-super',
      body: { confirm_reset: true, user_id: 'attacker-controlled-id' },
    }));
    expect(res.status).toBe(200);
    expect(deletedTables).toContain('transactions');
    const started = auditInserts.find((r) => r.action === 'system.data_reset_started');
    expect(started.user_id).toBe('u-super');
  });

  it('GET stats requires admin+', async () => {
    const { GET } = await import('@/app/api/settings/reset-data/route');
    expect((await GET(req('http://x/api/settings/reset-data', { token: 'token-viewer' }))).status).toBe(403);
    expect((await GET(req('http://x/api/settings/reset-data', { token: 'token-admin' }))).status).toBe(200);
  });
});

// ===========================================================================
// 3. POST /api/settings/database-reset
// ===========================================================================
describe('POST /api/settings/database-reset authorization', () => {
  const validBody = {
    level: 'level_1_financial',
    confirmation_phrase: 'RESET YUNITE DATABASE',
    backup_verified: true,
  };

  it('a viewer claiming a super_admin body user_id is rejected BEFORE any DB check (spoof closed)', async () => {
    const { POST } = await import('@/app/api/settings/database-reset/route');
    const res = await POST(req('http://x/api/settings/database-reset', {
      method: 'POST', token: 'token-viewer',
      body: { ...validBody, user_id: 'u-super' },
    }));
    expect(res.status).toBe(403);
  });

  it('super_admin executes with identity from the session (body user_id ignored)', async () => {
    const { POST } = await import('@/app/api/settings/database-reset/route');
    const { databaseResetService } = await import('@/lib/services/database-admin/database-reset.service');
    const res = await POST(req('http://x/api/settings/database-reset', {
      method: 'POST', token: 'token-super',
      body: { ...validBody, user_id: 'attacker-id' },
    }));
    expect(res.status).toBe(200);
    expect((databaseResetService.executeReset as jest.Mock).mock.calls[0][0].user_id).toBe('u-super');
  });

  it('level 3 without a password is refused (requires_password)', async () => {
    const { POST } = await import('@/app/api/settings/database-reset/route');
    const res = await POST(req('http://x/api/settings/database-reset', {
      method: 'POST', token: 'token-super',
      body: { ...validBody, level: 'level_3_organization', password_verified: true },
    }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.requires_password).toBe(true);
  });

  it('level 3 with a WRONG password is refused — the old password_verified flag does not help', async () => {
    const { POST } = await import('@/app/api/settings/database-reset/route');
    const res = await POST(req('http://x/api/settings/database-reset', {
      method: 'POST', token: 'token-super',
      body: { ...validBody, level: 'level_3_organization', password: 'wrong', password_verified: true },
    }));
    expect(res.status).toBe(403);
  });

  it('level 3 with the CORRECT password proceeds', async () => {
    const { POST } = await import('@/app/api/settings/database-reset/route');
    const res = await POST(req('http://x/api/settings/database-reset', {
      method: 'POST', token: 'token-super',
      body: { ...validBody, level: 'level_3_organization', password: 'correct-horse' },
    }));
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// 4. POST /api/transactions/reverse
// ===========================================================================
describe('POST /api/transactions/reverse authorization', () => {
  it('rejects unauthenticated callers (401)', async () => {
    const { POST } = await import('@/app/api/transactions/reverse/route');
    const res = await POST(req('http://x/api/transactions/reverse', { method: 'POST', body: { transaction_id: 't', reason: 'abc' } }));
    expect(res.status).toBe(401);
  });

  it.each(['token-viewer', 'token-staff'])('rejects %s (403)', async (token) => {
    const { POST } = await import('@/app/api/transactions/reverse/route');
    const res = await POST(req('http://x/api/transactions/reverse', { method: 'POST', token, body: { transaction_id: 't', reason: 'abc' } }));
    expect(res.status).toBe(403);
  });

  it('admin reaches validation (400 on missing transaction_id proves the guard passed)', async () => {
    const { POST } = await import('@/app/api/transactions/reverse/route');
    const res = await POST(req('http://x/api/transactions/reverse', { method: 'POST', token: 'token-admin', body: { reason: 'abc' } }));
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 5. /api/notifications/email
// ===========================================================================
describe('/api/notifications/email authorization', () => {
  it('rejects the arbitrary-send action for staff/viewer (403)', async () => {
    const { POST } = await import('@/app/api/notifications/email/route');
    for (const token of ['token-staff', 'token-viewer']) {
      const res = await POST(req('http://x/api/notifications/email', {
        method: 'POST', token,
        body: { to: 'victim@example.com', subject: 'phish', htmlBody: '<b>click</b>' },
      }));
      expect(res.status).toBe(403);
    }
  });

  it('rejects unauthenticated stats access (401) and viewer stats access (403)', async () => {
    const { GET } = await import('@/app/api/notifications/email/route');
    expect((await GET(req('http://x/api/notifications/email?action=stats'))).status).toBe(401);
    expect((await GET(req('http://x/api/notifications/email?action=stats', { token: 'token-viewer' }))).status).toBe(403);
  });

  it('admin can read stats and send', async () => {
    const { GET, POST } = await import('@/app/api/notifications/email/route');
    expect((await GET(req('http://x/api/notifications/email?action=stats', { token: 'token-admin' }))).status).toBe(200);
    const res = await POST(req('http://x/api/notifications/email', {
      method: 'POST', token: 'token-admin',
      body: { to: 'member@example.com', subject: 'Hi', htmlBody: '<p>Body</p>' },
    }));
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// 6. Public member lookup: minimized PII + rate limiting
// ===========================================================================
describe('GET /api/member-registration-submissions/lookup', () => {
  it('returns ONLY minimized identity fields — never KRA PIN / ID / DOB / next-of-kin', async () => {
    const { GET } = await import('@/app/api/member-registration-submissions/lookup/route');
    const res = await GET(req('http://x/api/member-registration-submissions/lookup?phone=0712000000', { ip: '10.0.0.1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.exists).toBe(true);
    expect(Object.keys(json.data.member).sort()).toEqual(
      ['first_name', 'id', 'last_name', 'member_number', 'status'].sort()
    );
    const raw = JSON.stringify(json.data.member);
    for (const sensitive of ['99887766', 'A009999', '1990-01-01', 'Kin', 'jane@x.com', 'Nairobi']) {
      expect(raw).not.toContain(sensitive);
    }
  });

  it('rate-limits enumeration: the 11th lookup in a minute gets 429', async () => {
    const { GET } = await import('@/app/api/member-registration-submissions/lookup/route');
    let last: Response | null = null;
    for (let i = 0; i < 11; i++) {
      last = await GET(req(`http://x/api/member-registration-submissions/lookup?phone=071200000${i}`, { ip: '10.9.9.9' }));
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get('Retry-After')).toBeTruthy();
  });
});

// ===========================================================================
// Legacy-route rate limits
// ===========================================================================
describe('legacy route rate limiting', () => {
  it('login is limited per IP (21st attempt in a minute → 429)', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    let last: Response | null = null;
    for (let i = 0; i < 21; i++) {
      last = await POST(req('http://x/api/auth/login', { method: 'POST', ip: '10.1.1.1', body: { email: 'a@b.c', password: 'x' } }));
    }
    expect(last!.status).toBe(429);
  });

  it('public registration POST is limited per IP (6th submission in a minute → 429)', async () => {
    const { checkSimpleRateLimit } = await import('@/lib/api/simple-rate-limit');
    for (let i = 0; i < 5; i++) {
      expect(checkSimpleRateLimit('member-registration:10.2.2.2', 5, 60_000).allowed).toBe(true);
    }
    expect(checkSimpleRateLimit('member-registration:10.2.2.2', 5, 60_000).allowed).toBe(false);
  });

  it('different IPs have independent buckets', async () => {
    const { checkSimpleRateLimit } = await import('@/lib/api/simple-rate-limit');
    checkSimpleRateLimit('k:a', 1, 60_000);
    expect(checkSimpleRateLimit('k:a', 1, 60_000).allowed).toBe(false);
    expect(checkSimpleRateLimit('k:b', 1, 60_000).allowed).toBe(true);
  });
});

// ===========================================================================
// PostgREST filter-string injection
// ===========================================================================
describe('escapeOrFilterValue', () => {
  it('strips PostgREST logic metacharacters that could break out of an or() group', async () => {
    const { escapeOrFilterValue } = await import('@/lib/utils/postgrest');
    const malicious = 'x%,id.neq.00000000-0000-0000-0000-000000000000,(role.eq.super_admin)';
    const out = escapeOrFilterValue(malicious);
    expect(out).not.toMatch(/[(),."'\\]/);
    expect(out).toBe('x%idneq00000000-0000-0000-0000-000000000000roleeqsuper_admin');
  });

  it('keeps normal search input intact', async () => {
    const { escapeOrFilterValue } = await import('@/lib/utils/postgrest');
    expect(escapeOrFilterValue('Jane Doe')).toBe('Jane Doe');
    expect(escapeOrFilterValue('0712-345')).toBe('0712-345');
    expect(escapeOrFilterValue('')).toBe('');
  });
});

// ===========================================================================
// Static source guards — the body-trust pattern must not come back
// ===========================================================================
describe('route source static guards', () => {
  it('database-reset never reads identity from the request body', () => {
    const src = readFileSync(join(__dirname, '..', 'src/app/api/settings/database-reset/route.ts'), 'utf8');
    expect(src).toContain('requireSuperAdmin');
    expect(src).not.toContain('body.user_id');
    expect(src).not.toContain('body.password_verified');
  });

  it('reset-data and reverse derive the actor from the session', () => {
    const reset = readFileSync(join(__dirname, '..', 'src/app/api/settings/reset-data/route.ts'), 'utf8');
    expect(reset).toContain('requireSuperAdmin');
    const reverse = readFileSync(join(__dirname, '..', 'src/app/api/transactions/reverse/route.ts'), 'utf8');
    expect(reverse).toContain("requirePermission(request, 'transactions', 'reverse')");
    expect(reverse).not.toContain('body.user_id');
  });

  it('search services sanitize before interpolating into .or()', () => {
    const member = readFileSync(join(__dirname, '..', 'src/lib/services/member-registration.service.ts'), 'utf8');
    expect(member).toContain('escapeOrFilterValue(params.query)');
    const docs = readFileSync(join(__dirname, '..', 'src/lib/services/documents/search.service.ts'), 'utf8');
    expect(docs).toContain('escapeOrFilterValue(name)');
  });
});
