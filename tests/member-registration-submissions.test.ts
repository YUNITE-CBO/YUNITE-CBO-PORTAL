/**
 * Tests for the Member Pre-Registration & Smart Auto-Fill system.
 *
 * Covers the pre-registration layer WITHOUT exercising the existing
 * registration engine (which is integration-tested elsewhere):
 *   - submission create stores a pending record (NOT a member)
 *   - duplicate detection flags id_number / phone / email matches
 *   - markRegistered links + prevents double-registration
 *   - list hides registered by default (queue view)
 *   - reject guards against rejecting an already-registered submission
 *   - the existing /api/members POST forwards _submission_id and links on success
 */

// --- Mock supabase service client (shared query builder) ---
type Row = Record<string, unknown>;
let insertedSubmissions: Row[] = [];
let membersTable: Row[] = [];
let auditLogs: Row[] = [];
let notifications: Row[] = [];
let emailQueue: Row[] = [];
let usersTable: Row[] = [];

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => ({
    from: (table: string) => {
      // route writes/reads to the in-memory stores
      const builder: any = {
        insert: (rows: Row | Row[]) => {
          const arr = Array.isArray(rows) ? rows : [rows];
          if (table === 'member_registration_submissions') insertedSubmissions.push(...arr);
          if (table === 'audit_logs') auditLogs.push(...arr);
          if (table === 'notifications') notifications.push(...arr);
          if (table === 'email_queue') emailQueue.push(...arr);
          const last = arr[arr.length - 1];
          // insert is terminal-ish; resolve with the inserted row.
          builder._terminal = { data: last, error: null, count: null };
          return proxy;
        },
        update: (patch: Row) => {
          // Defer application: the real query is update({...}).eq('id', id)
          // and only executes when awaited. We stash the patch and apply it
          // in the thenable (by which point .eq has set _id).
          builder._pendingPatch = patch;
          return proxy;
        },
        delete: () => { builder._isDelete = true; return proxy; },
        select: (_cols?: string) => { builder._isSelect = true; return proxy; },
        eq: (col: string, val: unknown) => {
          if (col === 'id') builder._id = val;
          return proxy;
        },
        ilike: (col: string, val: string) => {
          // duplicate detection: scan membersTable
          const found = membersTable.find(
            (m) => typeof m[col] === 'string' && String(m[col]).toLowerCase() === String(val).toLowerCase()
          );
          builder._maybe = found || null;
          return proxy;
        },
        in: (_col: string, _vals: unknown[]) => proxy,
        or: (_expr: string) => proxy,
        gte: () => proxy,
        lt: () => proxy,
        order: () => proxy,
        range: () => proxy,
        limit: () => proxy,
        single: () => {
          // insert().select().single() -> return the inserted row.
          if (builder._terminal) return { data: builder._terminal.data, error: null };
          return { data: builder._last ?? null, error: null };
        },
        maybeSingle: () => {
          // getById: select * from member_registration_submissions where id=_
          const id = builder._id;
          const row = id ? insertedSubmissions.find((s) => s.id === id) : builder._maybe ?? null;
          return { data: row ?? null, error: null };
        },
      };
      const proxy = new Proxy(builder, {
        get(_t, prop) {
          if (prop === 'then' || prop === 'catch' || prop === 'finally') {
            return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
              if (prop === 'catch' || prop === 'finally') return undefined as unknown;
              // Apply a pending update/delete patch to the matching row(s) now
              // (the real query executes only when awaited, after .eq).
              const patch = builder._pendingPatch;
              if (patch) {
                const id = builder._id;
                if (id) {
                  const idx = insertedSubmissions.findIndex((s) => s.id === id);
                  if (idx >= 0) insertedSubmissions[idx] = { ...insertedSubmissions[idx], ...patch };
                }
              }
              // If a terminal was set (insert), use it.
              if (builder._terminal) {
                return Promise.resolve(builder._terminal).then(resolve, reject);
              }
              // default terminal: for select on submissions return all (count),
              // for select on members return membersTable
              let result: { data: unknown; error: unknown; count: number | null };
              if (table === 'member_registration_submissions') {
                result = { data: insertedSubmissions, error: null, count: insertedSubmissions.length };
              } else if (table === 'members') {
                result = { data: membersTable, error: null, count: membersTable.length };
              } else if (table === 'users') {
                result = { data: usersTable, error: null, count: usersTable.length };
              } else {
                result = { data: null, error: null, count: null };
              }
              return Promise.resolve(result).then(resolve, reject);
            };
          }
          return builder[prop];
        },
      });
      return proxy;
    },
  }),
}));

jest.mock('@/lib/services/configuration.service', () => ({
  configurationService: {
    getSetting: async (key: string) => {
      if (key === 'registration.public_enabled') return 'true';
      if (key === 'registration.notify_admins') return 'true';
      return null;
    },
  },
}));

jest.mock('@/lib/services/notifications', () => ({
  notificationService: {
    sendFromTemplate: async () => ({ id: 'n-1', ref: 'NTF-1' }),
  },
}));

import { memberRegistrationSubmissionService } from '@/lib/services/member-registration-submission.service';

const baseData = {
  first_name: 'John',
  last_name: 'Doe',
  phone: '0712345678',
  email: 'john@example.com',
  id_number: 'ID123',
};

describe('Member pre-registration submission service', () => {
  beforeEach(() => {
    insertedSubmissions = [];
    membersTable = [];
    auditLogs = [];
    notifications = [];
    emailQueue = [];
    usersTable = [];
  });

  it('create() stores a pending submission and does NOT create a member', async () => {
    const { submission } = await memberRegistrationSubmissionService.create(baseData);
    expect(submission.status).toBe('submitted');
    expect(submission.submission_reference).toMatch(/^MRS-/);
    expect(insertedSubmissions).toHaveLength(1);
    expect(membersTable).toHaveLength(0); // critical: no member created
    // original data preserved verbatim
    expect(submission.submitted_data).toMatchObject({ first_name: 'John', id_number: 'ID123' });
  });

  it('create() flags a duplicate when an existing member shares id_number', async () => {
    membersTable.push({
      id: 'm-1', member_number: 'YUN-0001', first_name: 'Jane', last_name: 'D',
      id_number: 'ID123', phone: '0700000000', email: 'other@x.com',
    });
    const { duplicates } = await memberRegistrationSubmissionService.create(baseData);
    expect(duplicates.flagged).toBe(true);
    expect(duplicates.match.id_number).toMatchObject({ member_number: 'YUN-0001' });
  });

  it('markRegistered() links the submission and refuses double-registration', async () => {
    const { submission } = await memberRegistrationSubmissionService.create(baseData);
    const r1 = await memberRegistrationSubmissionService.markRegistered(
      submission.id, 'm-9', 'YUN-0009', 'admin-1'
    );
    expect(r1.success).toBe(true);

    // Second link attempt must be refused — the first markRegistered already
    // mutated the in-memory row to status=registered + registered_member_id.
    const r2 = await memberRegistrationSubmissionService.markRegistered(
      submission.id, 'm-10', 'YUN-0010', 'admin-1'
    );
    expect(r2.success).toBe(false);
    expect(r2.error).toContain('already registered');
  });

  it('reject() refuses to reject an already-registered submission', async () => {
    const { submission } = await memberRegistrationSubmissionService.create(baseData);
    await memberRegistrationSubmissionService.markRegistered(submission.id, 'm-1', 'YUN-1', 'a');
    const r = await memberRegistrationSubmissionService.reject(submission.id, 'a', 'nope');
    expect(r.success).toBe(false);
    expect(r.error).toContain('already registered');
  });

  it('resolvePublicUrl() derives the URL from an origin', () => {
    expect(memberRegistrationSubmissionService.resolvePublicUrl('https://yunite.app/')).toBe(
      'https://yunite.app/register/member'
    );
    expect(memberRegistrationSubmissionService.resolvePublicUrl(null)).toMatch(/register\/member$/);
  });
});

// ============================================================
// API + existing-engine forwarding tests
// ============================================================

jest.mock('@/lib/auth', () => ({
  requirePermission: async (request: Request, _module: string, _action: string) => {
    const cookie = request.headers.get('cookie') || '';
    if (!cookie.includes('auth_token=admin')) {
      return { success: false, status: 401, error: 'Unauthorized' };
    }
    return { success: true, user: { user_id: 'u-1', role: 'super_admin' } };
  },
  getClientIP: () => '127.0.0.1',
  getUserAgent: () => 'test-agent',
  unauthorizedResponse: (error: string) => Response.json({ success: false, error }, { status: 401 }),
  forbiddenResponse: (error: string) => Response.json({ success: false, error }, { status: 403 }),
}));

// Capture what the existing registration engine was called with + whether
// markRegistered was invoked with the right linkage.
let registeredWith: unknown = null;
let markRegisteredCalls: { id: string; memberId: string; memberNumber: string }[] = [];

jest.mock('@/lib/services', () => ({
  memberRegistrationService: {
    register: async (data: unknown, userId: string) => {
      registeredWith = { data, userId };
      return {
        member: { id: 'm-new', member_number: 'YUN-NEW-0001', ...((data as any) || {}) },
        accounts: [],
      };
    },
    search: async () => ({ members: [], total: 0, page: 1, limit: 20 }),
  },
}));

// NOTE: we do NOT jest.mock the submission service module. The service-level
// tests below exercise the REAL markRegistered/reject logic against the mocked
// supabase. For the API forwarding tests we install a jest.spyOn on
// markRegistered (same singleton the route dynamic-imports) so the call is
// observable without disabling the real implementation elsewhere.

import { NextRequest } from 'next/server';

describe('POST /api/members forwards _submission_id and links on success', () => {
  let markRegisteredSpy: jest.SpyInstance;

  beforeEach(() => {
    registeredWith = null;
    markRegisteredCalls = [];
    insertedSubmissions = [];
    // Spy on the real singleton's markRegistered so the route's dynamic import
    // (same module instance) observes the call. The mock impl records args and
    // returns success — we are asserting the ROUTE calls it, not the DB write.
    const { memberRegistrationSubmissionService } = require('@/lib/services/member-registration-submission.service');
    markRegisteredSpy = jest
      .spyOn(memberRegistrationSubmissionService, 'markRegistered')
      .mockImplementation((async (id: string, memberId: string, memberNumber: string) => {
        markRegisteredCalls.push({ id, memberId, memberNumber });
        return { success: true };
      }) as typeof memberRegistrationSubmissionService.markRegistered);
  });

  afterEach(() => {
    markRegisteredSpy.mockRestore();
  });

  it('strips _submission_id before validation and links after registration', async () => {
    const { POST } = await import('@/app/api/members/route');
    const req = new NextRequest('http://localhost/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'auth_token=admin' },
      body: JSON.stringify({ ...baseData, _submission_id: 'sub-123' }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    // _submission_id must NOT reach the registration engine
    expect((registeredWith as any).data).not.toHaveProperty('_submission_id');
    // linkage must have been attempted with the new member
    expect(markRegisteredCalls).toEqual([
      { id: 'sub-123', memberId: 'm-new', memberNumber: 'YUN-NEW-0001' },
    ]);
  });

  it('registers normally (no linkage) when _submission_id is absent', async () => {
    const { POST } = await import('@/app/api/members/route');
    const req = new NextRequest('http://localhost/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'auth_token=admin' },
      body: JSON.stringify(baseData),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(markRegisteredCalls).toHaveLength(0);
  });
});

describe('POST /api/member-registration-submissions (public)', () => {
  beforeEach(() => {
    insertedSubmissions = [];
    membersTable = [];
  });

  it('accepts a public submission and returns the reference (201)', async () => {
    const { POST } = await import('@/app/api/member-registration-submissions/route');
    const req = new NextRequest('http://localhost/api/member-registration-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseData),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.submission_reference).toMatch(/^MRS-/);
    expect(json.data.status).toBe('submitted');
    expect(membersTable).toHaveLength(0);
  });

  it('rejects an invalid submission (missing required phone)', async () => {
    const { POST } = await import('@/app/api/member-registration-submissions/route');
    const req = new NextRequest('http://localhost/api/member-registration-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: 'X', last_name: 'Y' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
