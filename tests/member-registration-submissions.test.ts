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
let templatesTable: Row[] = [];

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
          builder._eqs = { ...(builder._eqs || {}), [col]: val };
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
          // Template lookup: notification_templates by template_code.
          if (table === 'notification_templates') {
            const code = builder._eqs?.template_code;
            const active = builder._eqs?.is_active;
            const row = templatesTable.find(
              (t) => t.template_code === code && (active === undefined || t.is_active === active)
            );
            return { data: row ?? null, error: null };
          }
          // getById-style single-row fetch; pick the store by table name so
          // member lookups and submission lookups both resolve.
          const id = builder._id;
          const store = table === 'members' ? membersTable : insertedSubmissions;
          const row = id ? store.find((s) => s.id === id) : builder._maybe ?? null;
          return { data: row ?? null, error: null };
        },
      };
      const proxy = new Proxy(builder, {
        get(_t, prop) {
          if (prop === 'then' || prop === 'catch' || prop === 'finally') {
            return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
              if (prop === 'catch' || prop === 'finally') return undefined as unknown;
              // Apply a pending update/delete patch to the matching row(s) now
              // (the real query executes only when awaited, after .eq). Pick
              // the store by table name so member updates land in membersTable.
              const patch = builder._pendingPatch;
              if (patch) {
                const id = builder._id;
                if (id) {
                  const store = table === 'members' ? membersTable : insertedSubmissions;
                  const idx = store.findIndex((s) => s.id === id);
                  if (idx >= 0) store[idx] = { ...store[idx], ...patch };
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

let processQueueCalls = 0;
jest.mock('@/lib/services/notifications', () => ({
  notificationService: {
    sendFromTemplate: async () => ({ id: 'n-1', ref: 'NTF-1' }),
  },
  emailService: {
    processQueue: async () => {
      processQueueCalls += 1;
      return { processed: 0, succeeded: 0, failed: 0 };
    },
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
    templatesTable = [];
    processQueueCalls = 0;
    // The public POST route is rate-limited per IP; clear buckets so tests
    // never trip the limiter across cases sharing the 'unknown' IP key.
    require('@/lib/api/simple-rate-limit')._resetSimpleRateLimit();
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

  it('create() rejects a register submission when the id_number already exists (DuplicateMemberError)', async () => {
    membersTable.push({
      id: 'm-1', member_number: 'YUN-0001', first_name: 'Jane', last_name: 'D',
      id_number: 'ID123', phone: '0700000000', email: 'other@x.com',
    });
    await expect(memberRegistrationSubmissionService.create(baseData)).rejects.toThrow(/already exists/);
    // No submission row must have been created.
    expect(insertedSubmissions).toHaveLength(0);
  });

  it('create() rejects a register submission when the phone already exists', async () => {
    membersTable.push({
      id: 'm-1', member_number: 'YUN-0001', first_name: 'Jane', last_name: 'D',
      id_number: 'OTHER-ID', phone: '0712345678', email: 'other@x.com',
    });
    await expect(memberRegistrationSubmissionService.create(baseData)).rejects.toThrow(/phone/);
    expect(insertedSubmissions).toHaveLength(0);
  });

  it('create() only FLAGS an email-only match without rejecting', async () => {
    membersTable.push({
      id: 'm-1', member_number: 'YUN-0001', first_name: 'Jane', last_name: 'D',
      id_number: 'OTHER-ID', phone: '0700000000', email: 'john@example.com',
    });
    const { submission, duplicates } = await memberRegistrationSubmissionService.create(baseData);
    expect(submission.intent).toBe('register');
    expect(duplicates.flagged).toBe(true);
    expect(duplicates.match.email).toMatchObject({ member_number: 'YUN-0001' });
    expect(insertedSubmissions).toHaveLength(1);
  });

  it('create() with intent=update links the submission to the existing member', async () => {
    membersTable.push({
      id: 'm-1', member_number: 'YUN-0001', first_name: 'Jane', last_name: 'D',
      id_number: 'ID123', phone: '0700000000', email: 'other@x.com',
    });
    const { submission } = await memberRegistrationSubmissionService.create(baseData, {
      intent: 'update',
    });
    expect(submission.intent).toBe('update');
    expect(submission.existing_member_id).toBe('m-1');
    expect(submission.status).toBe('submitted');
  });

  it('create() with intent=update refuses when no member matches', async () => {
    await expect(
      memberRegistrationSubmissionService.create(baseData, { intent: 'update' })
    ).rejects.toThrow(/No existing member/);
    expect(insertedSubmissions).toHaveLength(0);
  });

  it('lookupExistingMember() finds by id_number, falls back to phone, else null', async () => {
    membersTable.push({
      id: 'm-1', member_number: 'YUN-0001', first_name: 'Jane', last_name: 'D',
      id_number: 'ID123', phone: '0712345678', email: 'other@x.com',
    });
    const byId = await memberRegistrationSubmissionService.lookupExistingMember({ id_number: 'id123' });
    expect(byId).not.toBeNull();
    const byPhone = await memberRegistrationSubmissionService.lookupExistingMember({ phone: '0712345678' });
    expect(byPhone).not.toBeNull();
    const none = await memberRegistrationSubmissionService.lookupExistingMember({ id_number: 'NOPE' });
    expect(none).toBeNull();
  });

  it('applyUpdate() writes submitted fields onto the linked member and closes the submission', async () => {
    membersTable.push({
      id: 'm-1', member_number: 'YUN-0001', first_name: 'John', last_name: 'Doe',
      id_number: 'ID123', phone: '0712345678', email: 'old@x.com',
    });
    // create an update submission that changes the email
    const { submission } = await memberRegistrationSubmissionService.create(
      { ...baseData, email: 'new@x.com' },
      { intent: 'update', existingMemberId: 'm-1' }
    );

    const result = await memberRegistrationSubmissionService.applyUpdate(submission.id, 'admin-1');
    expect(result.success).toBe(true);
    expect(result.member?.member_number).toBe('YUN-0001');

    // member row updated, other fields untouched
    expect(membersTable[0].email).toBe('new@x.com');
    expect(membersTable[0].phone).toBe('0712345678');

    // submission closed + linked; applying twice is refused
    const closed = insertedSubmissions.find((s) => s.id === submission.id)!;
    expect(closed.status).toBe('registered');
    expect(closed.registered_member_id).toBe('m-1');
    const again = await memberRegistrationSubmissionService.applyUpdate(submission.id, 'admin-1');
    expect(again.success).toBe(false);
  });

  it('applyUpdate() refuses a register-intent submission', async () => {
    const { submission } = await memberRegistrationSubmissionService.create(baseData);
    const result = await memberRegistrationSubmissionService.applyUpdate(submission.id, 'admin-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/update submissions/);
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

  it('create() queues an acknowledgement email to the applicant (submission received)', async () => {
    const { submission } = await memberRegistrationSubmissionService.create(baseData);

    // A 'system' notification addressed to the applicant email exists...
    const notification = notifications.find((n) => n.template_code === 'applicant.submission_received');
    expect(notification).toBeDefined();
    expect(notification!.recipient_email).toBe('john@example.com');
    expect(notification!.recipient_type).toBe('system');
    expect(notification!.source_entity_id).toBe(submission.id);

    // ...and an email_queue row is queued for immediate processing.
    expect(emailQueue).toHaveLength(1);
    const email = emailQueue[0];
    expect(email.to_email).toBe('john@example.com');
    expect(email.to_name).toBe('John Doe');
    expect(email.status).toBe('pending');
    // scheduled_for must be set explicitly — processQueue filters
    // .lte('scheduled_for', now) which never matches NULL rows.
    expect(email.scheduled_for).toBeTruthy();
    // The built-in copy (no template row in templatesTable) acknowledges the
    // submission AND makes clear the applicant is NOT yet a member.
    expect(email.subject).toContain('registration information has been received');
    expect(email.text_body).toContain('John Doe');
    expect(email.text_body).toContain(submission.submission_reference);
    expect(email.text_body).toContain('does NOT automatically make you a registered member');
    // Immediate delivery was attempted.
    expect(processQueueCalls).toBe(1);
  });

  it('create() renders the seeded applicant.submission_received template when present', async () => {
    templatesTable.push({
      template_code: 'applicant.submission_received',
      is_active: true,
      subject_template: 'Received: {{submission_reference}} ({{org_name}})',
      body_template: 'Hello {{applicant_name}}, ref {{submission_reference}} — {{org_name}}',
    });
    const { submission } = await memberRegistrationSubmissionService.create(baseData);

    expect(emailQueue).toHaveLength(1);
    const email = emailQueue[0];
    expect(email.subject).toBe(`Received: ${submission.submission_reference} (YUNITE PAMOJA CBO)`);
    expect(email.text_body).toBe(
      `Hello John Doe, ref ${submission.submission_reference} — YUNITE PAMOJA CBO`
    );
  });

  it('create() does NOT queue an applicant email when no email address was provided', async () => {
    const { email, ...noEmail } = baseData;
    await memberRegistrationSubmissionService.create(noEmail);
    expect(emailQueue).toHaveLength(0);
    expect(notifications.find((n) => n.template_code === 'applicant.submission_received')).toBeUndefined();
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
    require('@/lib/api/simple-rate-limit')._resetSimpleRateLimit();
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

  it('returns 409 + matches payload when the ID/phone already exists', async () => {
    membersTable.push({
      id: 'm-1', member_number: 'YUN-0001', first_name: 'Jane', last_name: 'D',
      id_number: 'ID123', phone: '0712345678', email: 'other@x.com',
    });
    const { POST } = await import('@/app/api/member-registration-submissions/route');
    const req = new NextRequest('http://localhost/api/member-registration-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseData),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.code).toBe('DUPLICATE_MEMBER');
    expect(json.matches.id_number.member_id).toBe('m-1');
    expect(insertedSubmissions).toHaveLength(0);
  });

  it('accepts an update submission linked to the existing member (201)', async () => {
    const memberId = '11111111-1111-4111-8111-111111111111';
    membersTable.push({
      id: memberId, member_number: 'YUN-0001', first_name: 'John', last_name: 'Doe',
      id_number: 'ID123', phone: '0712345678', email: 'other@x.com',
    });
    const { POST } = await import('@/app/api/member-registration-submissions/route');
    const req = new NextRequest('http://localhost/api/member-registration-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseData, intent: 'update', existing_member_id: memberId }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.intent).toBe('update');
    const row = insertedSubmissions[0];
    expect(row.intent).toBe('update');
    expect(row.existing_member_id).toBe(memberId);
  });
});
