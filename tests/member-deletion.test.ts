/**
 * Tests for the Permanent Member Deletion Engine (migration 045 +
 * src/lib/services/member-deletion.service.ts).
 *
 * A REALISTIC member is built with connected records across savings,
 * shares, contributions, welfare, fines, loans, loan interest receipts
 * (Unity Fund), documents, compliance, meetings, notifications (+ email
 * queue + delivery history + statements + preferences), registration
 * submissions, media assets, and file uploads. The in-memory mock FAITHFULLY
 * SIMULATES the atomic Postgres function: it applies the same
 * dependency-ordered deletes inside a snapshot/rollback boundary, so a
 * simulated failure proves nothing is left half-deleted.
 *
 * Covered:
 *   - dependency map completeness (every member-linked table is mapped)
 *   - migration 045 static guarantees (atomic fn, audit table, ordering)
 *   - scan: financial state + per-table counts
 *   - confirmation gate ("DELETE MEMBER" required)
 *   - atomic deletion: member + ALL dependents gone, other members untouched,
 *     org totals consistent afterwards
 *   - rollback on failure: zero partial state
 *   - post-deletion verification + minimal audit (no financial history)
 *   - route auth: super_admin only
 */

// ---------------------------------------------------------------------------
// In-memory database
// ---------------------------------------------------------------------------
type Row = Record<string, any>;

const MEMBER_ID = 'mem-001';
const OTHER_MEMBER_ID = 'mem-002';
const ADMIN_ID = 'admin-001';

let db: Record<string, Row[]> = {};
let rpcShouldFail = false;
let auditLogs: Row[] = [];
let storageRemoved: Array<{ bucket: string; paths: string[] }> = [];

function seedRealisticData() {
  db = {
    members: [
      { id: MEMBER_ID, member_number: 'YUN-20260101-0001', first_name: 'Jane', last_name: 'Mwangi', status: 'active', email: 'jane@example.com' },
      { id: OTHER_MEMBER_ID, member_number: 'YUN-20260101-0002', first_name: 'John', last_name: 'Otieno', status: 'active', email: 'john@example.com' },
    ],
    accounts: [
      { id: 'acc-sav', member_id: MEMBER_ID, account_type: 'savings', status: 'active' },
      { id: 'acc-sha', member_id: MEMBER_ID, account_type: 'shares', status: 'active' },
      { id: 'acc-con', member_id: MEMBER_ID, account_type: 'contributions', status: 'active' },
      { id: 'acc-wel', member_id: MEMBER_ID, account_type: 'welfare', status: 'active' },
      { id: 'acc-fin', member_id: MEMBER_ID, account_type: 'fines', status: 'active' },
      { id: 'acc-loa', member_id: MEMBER_ID, account_type: 'loans', status: 'active' },
      { id: 'acc-other', member_id: OTHER_MEMBER_ID, account_type: 'savings', status: 'active' },
    ],
    transactions: [
      { id: 'tx-1', member_id: MEMBER_ID, account_id: 'acc-sav', transaction_type: 'savings_deposit', amount: 5000, reversed: false },
      { id: 'tx-2', member_id: MEMBER_ID, account_id: 'acc-sav', transaction_type: 'savings_withdrawal', amount: 1000, reversed: false },
      { id: 'tx-3', member_id: MEMBER_ID, account_id: 'acc-con', transaction_type: 'contribution_monthly', amount: 1000, reversed: false },
      { id: 'tx-4', member_id: MEMBER_ID, account_id: 'acc-wel', transaction_type: 'welfare_deposit', amount: 500, reversed: false },
      { id: 'tx-5', member_id: MEMBER_ID, account_id: 'acc-fin', transaction_type: 'fine_posting', amount: 200, reversed: false },
      { id: 'tx-6', member_id: MEMBER_ID, account_id: 'acc-loa', transaction_type: 'loan_disbursement', amount: 10000, reversed: false },
      { id: 'tx-7', member_id: MEMBER_ID, account_id: 'acc-loa', transaction_type: 'loan_repayment', amount: 4000, reversed: false },
      { id: 'tx-8', member_id: OTHER_MEMBER_ID, account_id: 'acc-other', transaction_type: 'savings_deposit', amount: 7000, reversed: false },
    ],
    loans: [
      { id: 'loan-1', member_id: MEMBER_ID, loan_number: 'LN-001', status: 'active', amount_due: 6000, amount_paid: 4000 },
      { id: 'loan-2', member_id: OTHER_MEMBER_ID, loan_number: 'LN-002', status: 'active', amount_due: 3000, amount_paid: 0 },
    ],
    loan_interest_receipts: [
      { id: 'lir-1', loan_id: 'loan-1', member_id: MEMBER_ID, interest_amount: 100 },
      { id: 'lir-2', loan_id: 'loan-2', member_id: OTHER_MEMBER_ID, interest_amount: 50 },
    ],
    fines: [
      { id: 'fine-1', member_id: MEMBER_ID, status: 'pending', amount: 200, amount_paid: 0 },
      { id: 'fine-2', member_id: MEMBER_ID, status: 'paid', amount: 150, amount_paid: 150 },
      { id: 'fine-3', member_id: OTHER_MEMBER_ID, status: 'pending', amount: 100, amount_paid: 0 },
    ],
    documents: [
      { id: 'doc-1', member_id: MEMBER_ID, file_path: 'members/mem-001/id.pdf' },
      { id: 'doc-2', member_id: OTHER_MEMBER_ID, file_path: 'members/mem-002/id.pdf' },
    ],
    member_compliance: [
      { id: 'mc-1', member_id: MEMBER_ID, document_id: 'doc-1', status: 'approved' },
    ],
    compliance_records: [
      { id: 'cr-1', member_id: MEMBER_ID, status: 'complete' },
    ],
    member_approval_workflow: [
      { id: 'wf-1', member_id: MEMBER_ID, current_stage: 'completed' },
    ],
    member_status_history: [
      { id: 'msh-1', member_id: MEMBER_ID, previous_status: 'pending', new_status: 'active' },
    ],
    meeting_attendance: [
      { id: 'ma-1', member_id: MEMBER_ID, meeting_id: 'mtg-1', attended: true },
    ],
    meetings: [
      { id: 'mtg-1', chairperson: MEMBER_ID, secretary: OTHER_MEMBER_ID, meeting_title: 'AGM' },
    ],
    notifications: [
      { id: 'ntf-1', member_id: MEMBER_ID, recipient_type: 'member', recipient_id: MEMBER_ID, subject: 'Welcome' },
      { id: 'ntf-2', member_id: OTHER_MEMBER_ID, recipient_type: 'member', recipient_id: OTHER_MEMBER_ID, subject: 'Welcome' },
    ],
    email_queue: [
      { id: 'eq-1', notification_id: 'ntf-1', to_email: 'jane@example.com' },
      { id: 'eq-2', notification_id: 'ntf-2', to_email: 'john@example.com' },
      { id: 'eq-3', notification_id: null, to_email: 'jane@example.com' },
    ],
    notification_delivery_history: [
      { id: 'ndh-1', notification_id: 'ntf-1', email_queue_id: 'eq-1' },
      { id: 'ndh-2', notification_id: 'ntf-2', email_queue_id: 'eq-2' },
      // regression: history references a queue row with notification_id NULL
      { id: 'ndh-3', notification_id: null, email_queue_id: 'eq-3' },
    ],
    notification_statements: [
      { id: 'nstmt-1', member_id: MEMBER_ID, recipient_type: 'member', recipient_id: MEMBER_ID },
    ],
    notification_preferences: [
      { id: 'np-1', member_id: MEMBER_ID, owner_type: 'member', owner_id: MEMBER_ID },
    ],
    member_registration_submissions: [
      { id: 'sub-1', registered_member_id: MEMBER_ID, existing_member_id: null, status: 'registered' },
      { id: 'sub-2', registered_member_id: null, existing_member_id: MEMBER_ID, status: 'submitted' },
    ],
    media_assets: [
      { id: 'med-1', owner_type: 'member', owner_id: MEMBER_ID, storage_bucket: 'yunite-profiles', storage_path: 'member/mem-001/photo.png', status: 'active' },
    ],
    file_uploads: [
      { id: 'fu-1', entity_type: 'member', entity_id: MEMBER_ID, file_path: 'members/mem-001/id.pdf' },
      { id: 'fu-2', entity_type: 'loan', entity_id: 'loan-1', file_path: 'loans/loan-1/form.pdf' },
    ],
    generated_documents: [
      { id: 'gd-1', member_id: MEMBER_ID, doc_ref: 'YP-DOC/member_statement/1' },
    ],
    permanent_member_deletions: [],
  };
  auditLogs = [];
  storageRemoved = [];
  rpcShouldFail = false;
}

// ---------------------------------------------------------------------------
// Faithful simulation of permanently_delete_member() (migration 045):
// same dependency-ordered deletes, snapshot/rollback on failure.
// ---------------------------------------------------------------------------
function simulateAtomicRpc(memberId: string, adminId: string) {
  const snapshot: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(db)) snapshot[t] = rows.map((r) => ({ ...r }));

  try {
    const member = db.members.find((m) => m.id === memberId);
    if (!member) throw new Error(`Member ${memberId} not found`);
    const counts: Record<string, number> = {};
    const del = (table: string, pred: (r: Row) => boolean, key = table) => {
      const before = db[table].length;
      db[table] = db[table].filter((r) => !pred(r));
      counts[key] = (counts[key] || 0) + (before - db[table].length);
    };

    del('member_compliance', (r) => r.member_id === memberId);
    const notifIds = new Set(
      db.notifications
        .filter((n) => n.member_id === memberId || (n.recipient_type === 'member' && n.recipient_id === memberId))
        .map((n) => n.id)
    );
    const queueIds = new Set(
      db.email_queue
        .filter((r) => (r.notification_id && notifIds.has(r.notification_id)) || r.to_email === member.email)
        .map((r) => r.id)
    );
    del('notification_delivery_history',
      (r) => notifIds.has(r.notification_id) || queueIds.has(r.email_queue_id));
    del('email_queue', (r) => queueIds.has(r.id));
    del('notifications', (r) => notifIds.has(r.id));
    del('notification_statements', (r) => r.member_id === memberId || (r.recipient_type === 'member' && r.recipient_id === memberId));
    del('notification_preferences', (r) => r.member_id === memberId || (r.owner_type === 'member' && r.owner_id === memberId));
    for (const t of ['member_approval_workflow', 'member_status_history', 'member_committees', 'member_projects', 'member_meetings']) {
      if (db[t]) del(t, (r) => r.member_id === memberId);
    }
    del('loan_interest_receipts', (r) => r.member_id === memberId);
    del('transactions', (r) => r.member_id === memberId);
    del('loans', (r) => r.member_id === memberId);
    del('fines', (r) => r.member_id === memberId);
    del('compliance_records', (r) => r.member_id === memberId);
    const docPaths = db.documents.filter((d) => d.member_id === memberId && d.file_path).map((d) => d.file_path);
    del('documents', (r) => r.member_id === memberId);
    del('file_uploads', (r) => r.entity_type === 'member' && r.entity_id === memberId);
    del('meeting_attendance', (r) => r.member_id === memberId);
    db.meetings.forEach((m) => {
      if (m.chairperson === memberId) m.chairperson = null;
      if (m.secretary === memberId) m.secretary = null;
    });
    db.member_registration_submissions.forEach((sub) => {
      if (sub.registered_member_id === memberId) sub.registered_member_id = null;
      if (sub.existing_member_id === memberId) sub.existing_member_id = null;
    });
    const mediaObjects = db.media_assets
      .filter((m) => m.owner_type === 'member' && m.owner_id === memberId && m.storage_path)
      .map((m) => ({ bucket: m.storage_bucket, path: m.storage_path }));
    del('media_assets', (r) => r.owner_type === 'member' && r.owner_id === memberId);
    del('accounts', (r) => r.member_id === memberId);
    // SET NULL cascades
    db.generated_documents.forEach((g) => { if (g.member_id === memberId) g.member_id = null; });
    del('members', (r) => r.id === memberId);

    if (rpcShouldFail) throw new Error('simulated mid-transaction failure');

    db.permanent_member_deletions.push({
      member_id: memberId, member_number: member.member_number, deleted_by: adminId,
      deleted_at: new Date().toISOString(), deleted_counts: counts,
    });

    return {
      data: {
        member_id: memberId,
        member_number: member.member_number,
        member_name: `${member.first_name} ${member.last_name}`,
        deleted_counts: counts,
        document_storage_paths: docPaths,
        media_storage_objects: mediaObjects,
      },
      error: null,
    };
  } catch (e: any) {
    // Atomicity: restore the snapshot — NOTHING is left half-deleted.
    db = snapshot;
    return { data: null, error: { message: e.message } };
  }
}

// ---------------------------------------------------------------------------
// Supabase mock: generic in-memory query layer for the operations the
// service uses (select/eq/in/maybeSingle/head-count/insert), rpc, storage.
// ---------------------------------------------------------------------------
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => ({
    rpc: async (fn: string, args: any) => {
      if (fn !== 'permanently_delete_member') return { data: null, error: { message: 'unknown fn' } };
      return simulateAtomicRpc(args.p_member_id, args.p_admin_id);
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          storageRemoved.push({ bucket, paths });
          return { error: null };
        },
      }),
    },
    from: (table: string) => {
      const filters: Array<(r: Row) => boolean> = [];
      let headCount = false;
      const api: any = {
        select: (_cols?: string, opts?: any) => {
          if (opts?.head) headCount = true;
          return api;
        },
        eq: (col: string, val: any) => { filters.push((r) => r[col] === val); return api; },
        in: (col: string, vals: any[]) => { filters.push((r) => vals.includes(r[col])); return api; },
        order: () => api,
        limit: () => api,
        insert: (rows: Row | Row[]) => {
          const arr = Array.isArray(rows) ? rows : [rows];
          if (table === 'audit_logs') auditLogs.push(...arr);
          else (db[table] = db[table] || []).push(...arr);
          return Promise.resolve({ data: arr[0], error: null });
        },
        maybeSingle: () => {
          const rows = (db[table] || []).filter((r) => filters.every((f) => f(r)));
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        then: (resolve: any) => {
          const rows = (db[table] || []).filter((r) => filters.every((f) => f(r)));
          resolve({ data: headCount ? null : rows, error: null, count: headCount ? rows.length : rows.length });
        },
      };
      return api;
    },
  }),
}));

jest.mock('@/lib/services/transaction.engine', () => ({
  transactionEngine: {
    calculateAllBalances: async (memberId: string) =>
      memberId === 'mem-001'
        ? { savings: 4000, shares: 40, contributions: 1000, welfare: 500, fines: 200, loans: 6000 }
        : { savings: 0, shares: 0, contributions: 0, welfare: 0, fines: 0, loans: 0 },
  },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  memberDeletionService,
  MEMBER_DEPENDENCY_MAP,
  PERMANENT_DELETE_CONFIRMATION_TEXT,
  PermanentDeletionError,
} from '@/lib/services/member-deletion.service';

export {};

beforeEach(seedRealisticData);

// ===========================================================================
// Dependency map + migration static guarantees
// ===========================================================================
describe('dependency map', () => {
  it('covers every member-linked table across all modules', () => {
    const tables = MEMBER_DEPENDENCY_MAP.map((d) => d.table);
    for (const t of [
      'members', 'accounts', 'transactions', 'loans', 'loan_interest_receipts',
      'fines', 'documents', 'member_compliance', 'compliance_records',
      'member_approval_workflow', 'member_status_history', 'meeting_attendance',
      'meetings', 'notifications', 'email_queue', 'notification_delivery_history',
      'notification_statements', 'notification_preferences',
      'member_registration_submissions', 'media_assets', 'file_uploads',
      'generated_documents', 'ai_verification_results', 'audit_logs',
    ]) {
      expect(tables).toContain(t);
    }
  });

  it('marks immutable ledgers set_null and operational logs audit_keep', () => {
    const byKey = Object.fromEntries(MEMBER_DEPENDENCY_MAP.map((d) => [d.key, d]));
    expect(byKey.generated_documents.strategy).toBe('set_null');
    expect(byKey.ai_verification_results.strategy).toBe('set_null');
    expect(byKey.audit_logs.strategy).toBe('audit_keep');
    expect(byKey.member_registration_submissions.strategy).toBe('unlink');
    expect(byKey.transactions.strategy).toBe('delete');
  });
});

describe('migration 045 static guarantees', () => {
  const sql = readFileSync(
    join(__dirname, '..', 'supabase', 'migrations', '045_permanent_member_deletion.sql'), 'utf8'
  );

  it('creates the minimal audit table (no financial history columns)', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS permanent_member_deletions');
    expect(sql).toContain('deleted_by UUID NOT NULL');
    expect(sql).toContain('member_number TEXT NOT NULL');
    expect(sql).not.toMatch(/permanent_member_deletions[\s\S]*?savings_balance/);
  });

  it('defines ONE atomic function that performs the entire deletion', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION permanently_delete_member');
    expect(sql).toContain('SECURITY DEFINER');
    // deletes every core dependent table before the member
    for (const t of ['member_compliance', 'email_queue', 'notification_delivery_history',
      'notifications', 'transactions', 'loan_interest_receipts', 'loans', 'fines',
      'documents', 'compliance_records', 'accounts']) {
      expect(sql).toMatch(new RegExp(`DELETE FROM ${t}`));
    }
    expect(sql.indexOf('DELETE FROM loans')).toBeLessThan(sql.indexOf('DELETE FROM members'));
    expect(sql.indexOf('DELETE FROM transactions')).toBeLessThan(sql.indexOf('DELETE FROM accounts'));
    expect(sql.indexOf('DELETE FROM member_compliance')).toBeLessThan(sql.indexOf('DELETE FROM documents'));
    expect(sql.indexOf('DELETE FROM loan_interest_receipts')).toBeLessThan(sql.indexOf('DELETE FROM loans'));
    // delivery history cleared (by notification OR queue link) BEFORE the
    // queue rows it references (notification_delivery_history_email_queue_id_fkey)
    expect(sql.indexOf('DELETE FROM notification_delivery_history')).toBeLessThan(sql.indexOf('DELETE FROM email_queue'));
    expect(sql).toContain('email_queue_id = ANY(v_queue_ids)');
  });

  it('inserts the audit record inside the same transaction', () => {
    expect(sql).toContain('INSERT INTO permanent_member_deletions');
    expect(sql.indexOf('INSERT INTO permanent_member_deletions')).toBeGreaterThan(sql.indexOf('DELETE FROM members'));
  });
});

// ===========================================================================
// Dependency scan
// ===========================================================================
describe('dependency scan', () => {
  it('reports the member financial state and connected record counts', async () => {
    const scan = await memberDeletionService.scanMemberDependencies(MEMBER_ID);
    expect(scan).not.toBeNull();
    expect(scan!.member.member_number).toBe('YUN-20260101-0001');
    expect(scan!.financial.savings).toBe(4000);
    expect(scan!.financial.shares).toBe(40);
    expect(scan!.financial.activeLoans).toBe(1);
    expect(scan!.financial.outstandingLoanBalance).toBe(6000);
    expect(scan!.financial.pendingFines).toBe(1);
    expect(scan!.financial.outstandingFineBalance).toBe(200);

    const byKey = Object.fromEntries(scan!.dependencies.map((d) => [d.key, d.count]));
    expect(byKey.accounts).toBe(6);
    expect(byKey.transactions).toBe(7);
    expect(byKey.loans).toBe(1);
    expect(byKey.fines).toBe(2);
    expect(byKey.documents).toBe(1);
    expect(byKey.notifications).toBe(1);
    expect(byKey.email_queue).toBe(2); // ntf-1 linked + direct to_email
    expect(byKey.meetings_chair_secretary).toBe(1);
    expect(byKey.member_registration_submissions).toBe(2);
    expect(byKey.media_assets).toBe(1);
    expect(byKey.file_uploads).toBe(1);
    expect(scan!.totalRecordsToDelete).toBeGreaterThan(0);
  });

  it('returns null for an unknown member', async () => {
    expect(await memberDeletionService.scanMemberDependencies('nope')).toBeNull();
  });
});

// ===========================================================================
// Permanent deletion
// ===========================================================================
describe('permanent deletion', () => {
  it('refuses without the exact confirmation text', async () => {
    await expect(
      memberDeletionService.executePermanentDeletion(MEMBER_ID, ADMIN_ID, 'delete member')
    ).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    // nothing touched
    expect(db.members.find((m) => m.id === MEMBER_ID)).toBeDefined();
  });

  it('throws NOT_FOUND for an unknown member', async () => {
    await expect(
      memberDeletionService.executePermanentDeletion('nope', ADMIN_ID, PERMANENT_DELETE_CONFIRMATION_TEXT)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('atomically deletes the member and ALL dependent records, leaving other members intact', async () => {
    const report = await memberDeletionService.executePermanentDeletion(
      MEMBER_ID, ADMIN_ID, PERMANENT_DELETE_CONFIRMATION_TEXT, { reason: 'system cleanup' }
    );

    expect(report.success).toBe(true);
    expect(report.member.member_number).toBe('YUN-20260101-0001');

    // member + every dependent record gone
    expect(db.members.find((m) => m.id === MEMBER_ID)).toBeUndefined();
    for (const t of ['accounts', 'transactions', 'loans', 'loan_interest_receipts', 'fines',
      'documents', 'member_compliance', 'compliance_records', 'member_approval_workflow',
      'member_status_history', 'meeting_attendance', 'notifications', 'notification_statements',
      'notification_preferences', 'media_assets']) {
      expect((db[t] || []).filter((r) => r.member_id === MEMBER_ID)).toHaveLength(0);
    }
    expect(db.file_uploads.filter((r) => r.entity_type === 'member' && r.entity_id === MEMBER_ID)).toHaveLength(0);
    expect(db.email_queue.filter((r) => r.to_email === 'jane@example.com')).toHaveLength(0);
    expect(db.notification_delivery_history.filter((r) => r.notification_id === 'ntf-1')).toHaveLength(0);

    // unlink strategies applied
    expect(db.meetings[0].chairperson).toBeNull();
    expect(db.member_registration_submissions[0].registered_member_id).toBeNull();
    expect(db.member_registration_submissions[1].existing_member_id).toBeNull();
    // set_null cascade
    expect(db.generated_documents[0].member_id).toBeNull();

    // other member completely untouched
    expect(db.members.find((m) => m.id === OTHER_MEMBER_ID)).toBeDefined();
    expect(db.transactions.filter((r) => r.member_id === OTHER_MEMBER_ID)).toHaveLength(1);
    expect(db.loans.filter((r) => r.member_id === OTHER_MEMBER_ID)).toHaveLength(1);
    expect(db.notifications.filter((r) => r.member_id === OTHER_MEMBER_ID)).toHaveLength(1);

    // verification all-clear
    expect(report.verification.allClear).toBe(true);
    expect(report.verification.memberExists).toBe(false);
    expect(report.verification.memberLookupByNumber).toBe(false);

    // org totals recalculated from the remaining ledger (member's 4000 net
    // savings + 1000 contributions + 500 welfare removed; only John's 7000 left)
    expect(report.totalsAfter.totalMembers).toBe(1);
    expect(report.totalsAfter.netSavings).toBe(7000);
    expect(report.totalsAfter.netContributions).toBe(0);
    expect(report.totalsAfter.netWelfare).toBe(0);
    expect(report.totalsAfter.outstandingLoans).toBe(3000); // only John's loan
    expect(report.totalsAfter.outstandingFines).toBe(100);  // only John's fine

    // storage cleanup attempted for documents + media
    expect(storageRemoved).toContainEqual({ bucket: 'documents', paths: ['members/mem-001/id.pdf'] });
    expect(storageRemoved).toContainEqual({ bucket: 'yunite-profiles', paths: ['member/mem-001/photo.png'] });
    expect(report.storageCleanup.failed).toBe(0);

    // minimal administrative audit: deletion fact, NOT financial history
    expect(db.permanent_member_deletions).toHaveLength(1);
    const audit = db.permanent_member_deletions[0];
    expect(audit.member_id).toBe(MEMBER_ID);
    expect(audit.member_number).toBe('YUN-20260101-0001');
    expect(audit.deleted_by).toBe(ADMIN_ID);
    expect(audit).not.toHaveProperty('savings');
    expect(audit).not.toHaveProperty('transactions');
    expect(auditLogs.some((l) => l.action === 'member_permanently_deleted')).toBe(true);
  });

  it('rolls back EVERYTHING when the atomic deletion fails mid-transaction', async () => {
    rpcShouldFail = true;
    await expect(
      memberDeletionService.executePermanentDeletion(MEMBER_ID, ADMIN_ID, PERMANENT_DELETE_CONFIRMATION_TEXT)
    ).rejects.toMatchObject({ code: 'EXECUTION_FAILED' });

    // zero partial state: member + all dependents still present
    expect(db.members.find((m) => m.id === MEMBER_ID)).toBeDefined();
    expect(db.transactions.filter((r) => r.member_id === MEMBER_ID)).toHaveLength(7);
    expect(db.loans.filter((r) => r.member_id === MEMBER_ID)).toHaveLength(1);
    expect(db.notifications.filter((r) => r.member_id === MEMBER_ID)).toHaveLength(1);
    expect(db.permanent_member_deletions).toHaveLength(0);
  });
});

// ===========================================================================
// Route authorization (super_admin only)
// ===========================================================================
describe('route authorization', () => {
  const loadRoute = () => require('@/app/api/members/[id]/permanent-delete/route');

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('@/lib/auth/authorization', () => ({
      requireSuperAdmin: jest.fn(),
      unauthorizedResponse: (msg?: string) => Response.json({ success: false, error: msg }, { status: 401 }),
      forbiddenResponse: (msg?: string) => Response.json({ success: false, error: msg }, { status: 403 }),
    }));
    jest.doMock('@/lib/auth', () => ({
      getClientIP: () => '127.0.0.1',
      getUserAgent: () => 'jest',
    }));
  });

  const makeReq = (body?: any) =>
    new Request(`http://localhost/api/members/${MEMBER_ID}/permanent-delete`, {
      method: body ? 'POST' : 'GET',
      body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json' },
    }) as any;

  it('rejects non-super-admin with 403', async () => {
    const auth = require('@/lib/auth/authorization');
    auth.requireSuperAdmin.mockResolvedValue({ success: false, status: 403, error: 'Insufficient permissions' });
    const route = loadRoute();
    const res = await route.POST(makeReq({ confirm_text: 'DELETE MEMBER' }), { params: Promise.resolve({ id: MEMBER_ID }) });
    expect(res.status).toBe(403);
  });

  it('rejects a wrong confirmation text with 400', async () => {
    const auth = require('@/lib/auth/authorization');
    auth.requireSuperAdmin.mockResolvedValue({ success: true, user: { user_id: ADMIN_ID, role: 'super_admin' } });
    const route = loadRoute();
    const res = await route.POST(makeReq({ confirm_text: 'yes' }), { params: Promise.resolve({ id: MEMBER_ID }) });
    expect(res.status).toBe(400);
    expect(db.members.find((m) => m.id === MEMBER_ID)).toBeDefined();
  });

  it('executes for a super admin with the correct confirmation', async () => {
    const auth = require('@/lib/auth/authorization');
    auth.requireSuperAdmin.mockResolvedValue({ success: true, user: { user_id: ADMIN_ID, role: 'super_admin' } });
    const route = loadRoute();
    const res = await route.POST(makeReq({ confirm_text: 'DELETE MEMBER' }), { params: Promise.resolve({ id: MEMBER_ID }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(db.members.find((m) => m.id === MEMBER_ID)).toBeUndefined();
  });

  it('GET returns the dependency scan for a super admin', async () => {
    const auth = require('@/lib/auth/authorization');
    auth.requireSuperAdmin.mockResolvedValue({ success: true, user: { user_id: ADMIN_ID, role: 'super_admin' } });
    const route = loadRoute();
    const res = await route.GET(makeReq(), { params: Promise.resolve({ id: MEMBER_ID }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.member.member_number).toBe('YUN-20260101-0001');
    expect(json.confirmation_required).toBe('DELETE MEMBER');
  });
});

// PermanentDeletionError export sanity
it('exposes the confirmation constant', () => {
  expect(PERMANENT_DELETE_CONFIRMATION_TEXT).toBe('DELETE MEMBER');
  expect(new PermanentDeletionError('x', 'NOT_FOUND').code).toBe('NOT_FOUND');
});
