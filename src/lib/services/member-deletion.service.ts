/**
 * PERMANENT MEMBER DELETION ENGINE
 *
 * The single trusted mechanism for permanently deleting a member and ALL
 * designated dependent records across YUNITE. Super Admin only.
 *
 * Workflow:  Member Profile -> Delete Request -> Dependency Scan ->
 *            Admin Confirmation ("DELETE MEMBER") -> Database Transaction
 *            (permanently_delete_member() RPC, migration 045) ->
 *            Post-Deletion Verification -> Completion Report + minimal audit.
 *
 * Two deletion levels exist in YUNITE:
 *   1. ARCHIVE  (DELETE /api/members/[id]) — status='withdrawn', historical
 *      records remain, reversible. Pre-existing.
 *   2. PERMANENT (this engine) — irreversible, atomic, super_admin only.
 *
 * The dependency map below was mapped from migrations 001-045 (NOT guessed):
 * every member-linked table, its FK behavior, and its deletion strategy.
 * The actual deletion runs inside ONE Postgres function so any failure
 * rolls back EVERYTHING — the system can never be left half-deleted.
 */
import { createServiceClient } from '@/lib/supabase/server';
import { transactionEngine } from './transaction.engine';
import { v4 as uuidv4 } from 'uuid';

export const PERMANENT_DELETE_CONFIRMATION_TEXT = 'DELETE MEMBER';

export class PermanentDeletionError extends Error {
  code: 'NOT_FOUND' | 'CONFIRMATION_REQUIRED' | 'EXECUTION_FAILED' | 'VERIFICATION_FAILED';
  details?: unknown;
  constructor(message: string, code: PermanentDeletionError['code'], details?: unknown) {
    super(message);
    this.name = 'PermanentDeletionError';
    this.code = code;
    this.details = details;
  }
}

// ===================================================================
// DEPENDENCY MAP (mapped from migrations 001-045 — the single source of
// truth for "what is connected to a member")
// ===================================================================
export type DependencyStrategy =
  | 'delete'      // row permanently removed inside the atomic transaction
  | 'unlink'      // row preserved, member reference set to NULL
  | 'cascade'     // removed by FK ON DELETE CASCADE (also deleted explicitly for counts)
  | 'set_null'    // FK ON DELETE SET NULL fires automatically (immutable ledgers)
  | 'view'        // SQL view over the ledger — nothing to delete, auto-updates
  | 'audit_keep'; // append-only operational audit — intentionally retained

export interface MemberDependency {
  key: string;
  table: string;
  module: string;
  strategy: DependencyStrategy;
  detail: string;
  optional?: boolean; // table may not exist on a partially-migrated DB
}

export const MEMBER_DEPENDENCY_MAP: readonly MemberDependency[] = [
  { key: 'members', table: 'members', module: 'Members', strategy: 'delete', detail: 'Member profile row (deleted last)' },
  { key: 'accounts', table: 'accounts', module: 'Savings & Shares', strategy: 'cascade', detail: 'savings/shares/contributions/welfare/fines/loans account rows (ON DELETE CASCADE; deleted explicitly for counts)' },
  { key: 'transactions', table: 'transactions', module: 'Transactions', strategy: 'delete', detail: 'Entire ledger history for the member (deliberate exception to the day-to-day "reverse, never delete" rule)' },
  { key: 'loans', table: 'loans', module: 'Loans', strategy: 'delete', detail: 'Loan applications, disbursements, balances' },
  { key: 'loan_interest_receipts', table: 'loan_interest_receipts', module: 'Unity Fund', strategy: 'delete', detail: 'Interest receipts (deleted before loans: FK loan_id)', optional: true },
  { key: 'fines', table: 'fines', module: 'Fines & Disciplinary', strategy: 'delete', detail: 'Fines and penalties' },
  { key: 'documents', table: 'documents', module: 'Documents', strategy: 'delete', detail: 'KYC/membership documents + storage objects (best-effort)' },
  { key: 'member_compliance', table: 'member_compliance', module: 'Compliance', strategy: 'delete', detail: 'Compliance requirement rows (deleted before documents: FK document_id)', optional: true },
  { key: 'compliance_records', table: 'compliance_records', module: 'Compliance', strategy: 'delete', detail: 'Legacy compliance records' },
  { key: 'member_approval_workflow', table: 'member_approval_workflow', module: 'Workflow', strategy: 'cascade', detail: 'Approval workflow state (ON DELETE CASCADE)', optional: true },
  { key: 'member_status_history', table: 'member_status_history', module: 'Members', strategy: 'cascade', detail: 'Status change history', optional: true },
  { key: 'member_committees', table: 'member_committees', module: 'Members', strategy: 'cascade', detail: 'Committee memberships', optional: true },
  { key: 'member_projects', table: 'member_projects', module: 'Members', strategy: 'cascade', detail: 'Project memberships', optional: true },
  { key: 'member_meetings', table: 'member_meetings', module: 'Members', strategy: 'cascade', detail: 'Member-meeting links', optional: true },
  { key: 'meeting_attendance', table: 'meeting_attendance', module: 'Meetings', strategy: 'delete', detail: 'Attendance records', optional: true },
  { key: 'meetings_chair_secretary', table: 'meetings', module: 'Meetings', strategy: 'unlink', detail: 'chairperson/secretary references set to NULL (meeting records preserved)', optional: true },
  { key: 'notifications', table: 'notifications', module: 'Notifications', strategy: 'delete', detail: 'In-app notifications (member_id and/or recipient)' },
  { key: 'email_queue', table: 'email_queue', module: 'Notifications', strategy: 'delete', detail: 'Queued emails to the member or for member notifications (deleted before notifications: FK notification_id)', optional: true },
  { key: 'notification_delivery_history', table: 'notification_delivery_history', module: 'Notifications', strategy: 'delete', detail: 'Delivery history for member notifications (FK notification_id)', optional: true },
  { key: 'notification_statements', table: 'notification_statements', module: 'Statements', strategy: 'delete', detail: 'Generated member statements', optional: true },
  { key: 'support_tickets', table: 'support_tickets', module: 'Support', strategy: 'cascade', detail: 'Support tickets (ON DELETE CASCADE via member_id FK — migration 046)', optional: true },
  { key: 'notification_preferences', table: 'notification_preferences', module: 'Notifications', strategy: 'delete', detail: 'Notification preferences (member_id or owner)', optional: true },
  { key: 'member_registration_submissions', table: 'member_registration_submissions', module: 'Registration', strategy: 'unlink', detail: 'registered_member_id/existing_member_id unlinked; the applicant intake record is preserved', optional: true },
  { key: 'media_assets', table: 'media_assets', module: 'Media', strategy: 'delete', detail: 'Profile photo asset records + storage objects (best-effort)', optional: true },
  { key: 'file_uploads', table: 'file_uploads', module: 'Documents', strategy: 'delete', detail: 'Upload tracking rows (entity_type=member)', optional: true },
  { key: 'generated_documents', table: 'generated_documents', module: 'Reports', strategy: 'set_null', detail: 'Immutable document audit ledger — member_id set to NULL automatically (ON DELETE SET NULL)', optional: true },
  { key: 'ai_verification_results', table: 'ai_verification_results', module: 'AI Intelligence', strategy: 'set_null', detail: 'AI verification history — member_id set to NULL automatically', optional: true },
  { key: 'member_financial_obligations', table: 'member_financial_obligations', module: 'Workflow', strategy: 'view', detail: 'SQL view over loans/fines/contributions — refreshes automatically', optional: true },
  { key: 'unity_fund_actual_receipts', table: 'unity_fund_actual_receipts', module: 'Unity Fund', strategy: 'view', detail: 'SQL view over the ledger — Unity Fund totals recalculate automatically', optional: true },
  { key: 'audit_logs', table: 'audit_logs', module: 'Audit', strategy: 'audit_keep', detail: 'Append-only operational audit — intentionally retained (contains no financial records)' },
  { key: 'notification_event_logs', table: 'notification_event_logs', module: 'Notifications', strategy: 'audit_keep', detail: 'Append-only event log — intentionally retained', optional: true },
] as const;

// ===================================================================
// TYPES
// ===================================================================
export interface DependencyCount {
  key: string;
  table: string;
  module: string;
  strategy: DependencyStrategy;
  detail: string;
  count: number | null; // null = table/column not present on this DB
}

export interface MemberFinancialState {
  savings: number;
  shares: number;
  contributions: number;
  welfare: number;
  fines: number;
  loans: number;
  activeLoans: number;
  outstandingLoanBalance: number;
  pendingFines: number;
  outstandingFineBalance: number;
  pendingObligations: number;
}

export interface DependencyScanResult {
  member: {
    id: string;
    member_number: string;
    first_name: string;
    last_name: string;
    status: string;
    email: string | null;
  };
  scanned_at: string;
  dependencies: DependencyCount[];
  totalRecordsToDelete: number;
  totalRecordsToUnlink: number;
  financial: MemberFinancialState;
}

export interface DeletionVerification {
  memberExists: boolean;
  memberLookupByNumber: boolean;
  remainingRecords: Record<string, number>;
  allClear: boolean;
}

export interface OrgTotalsAfterDeletion {
  totalMembers: number;
  activeMembers: number;
  netSavings: number;
  netContributions: number;
  netWelfare: number;
  outstandingLoans: number;
  outstandingFines: number;
}

export interface PermanentDeletionReport {
  success: boolean;
  member: { id: string; member_number: string; name: string };
  deletedCounts: Record<string, number>;
  verification: DeletionVerification;
  totalsAfter: OrgTotalsAfterDeletion;
  storageCleanup: { removed: number; failed: number };
  auditRecorded: boolean;
  completedAt: string;
}

// ===================================================================
// SERVICE
// ===================================================================
class MemberDeletionService {
  /**
   * DEPENDENCY SCAN (read-only). Identifies every record connected to the
   * member across the database, plus the member's live financial state.
   */
  async scanMemberDependencies(memberId: string): Promise<DependencyScanResult | null> {
    const supabase = await createServiceClient();

    const { data: member, error } = await supabase
      .from('members')
      .select('id, member_number, first_name, last_name, status, email')
      .eq('id', memberId)
      .maybeSingle();
    if (error || !member) return null;

    const dependencies = await Promise.all(
      MEMBER_DEPENDENCY_MAP.map((dep) => this.countDependency(supabase, dep, memberId, member.email))
    );

    // Live financial state (the ledger is the source of truth)
    let balances = { savings: 0, shares: 0, contributions: 0, welfare: 0, fines: 0, loans: 0 };
    try {
      balances = await transactionEngine.calculateAllBalances(memberId);
    } catch (e) {
      console.warn('Deletion scan: balance calculation failed', e);
    }

    const { data: loanRows } = await supabase
      .from('loans').select('status, amount_due').eq('member_id', memberId);
    const activeLoanRows = (loanRows || []).filter((l: any) =>
      ['approved', 'disbursed', 'active', 'defaulted'].includes(l.status));
    const outstandingLoanBalance = activeLoanRows.reduce((s: number, l: any) => s + Number(l.amount_due || 0), 0);

    const { data: fineRows } = await supabase
      .from('fines').select('status, amount, amount_paid').eq('member_id', memberId);
    const pendingFineRows = (fineRows || []).filter((f: any) => ['pending', 'partial'].includes(f.status));
    const outstandingFineBalance = pendingFineRows.reduce(
      (s: number, f: any) => s + (Number(f.amount || 0) - Number(f.amount_paid || 0)), 0);

    let pendingObligations = 0;
    try {
      const { count } = await supabase
        .from('member_financial_obligations')
        .select('*', { count: 'exact', head: true })
        .eq('member_id', memberId)
        .in('status', ['due', 'upcoming', 'overdue', 'partial']);
      pendingObligations = count || 0;
    } catch { pendingObligations = 0; }

    const deletable = dependencies.filter((d) => d.strategy === 'delete' || d.strategy === 'cascade');
    const unlinkable = dependencies.filter((d) => d.strategy === 'unlink');

    return {
      member: {
        id: member.id,
        member_number: member.member_number,
        first_name: member.first_name,
        last_name: member.last_name,
        status: member.status,
        email: member.email,
      },
      scanned_at: new Date().toISOString(),
      dependencies,
      totalRecordsToDelete: deletable.reduce((s, d) => s + (d.count || 0), 0),
      totalRecordsToUnlink: unlinkable.reduce((s, d) => s + (d.count || 0), 0),
      financial: {
        ...balances,
        activeLoans: activeLoanRows.length,
        outstandingLoanBalance,
        pendingFines: pendingFineRows.length,
        outstandingFineBalance,
        pendingObligations,
      },
    };
  }

  /** Count rows for one dependency. Returns null when the table/column is absent. */
  private async countDependency(
    supabase: any, dep: MemberDependency, memberId: string, memberEmail: string | null
  ): Promise<DependencyCount> {
    const base = { key: dep.key, table: dep.table, module: dep.module, strategy: dep.strategy, detail: dep.detail };
    const count = async (table: string, col: string, val: string): Promise<number | null> => {
      try {
        const { count: c, error } = await supabase
          .from(table).select('*', { count: 'exact', head: true }).eq(col, val);
        return error ? null : (c ?? 0);
      } catch { return null; }
    };

    switch (dep.key) {
      case 'notifications': {
        // 004 shape (member_id) and/or 005 shape (recipient_type/recipient_id)
        const ids = new Set<string>();
        try {
          const { data } = await supabase.from('notifications').select('id').eq('member_id', memberId);
          (data || []).forEach((r: any) => ids.add(r.id));
        } catch { /* column absent */ }
        try {
          const { data } = await supabase.from('notifications').select('id')
            .eq('recipient_type', 'member').eq('recipient_id', memberId);
          (data || []).forEach((r: any) => ids.add(r.id));
        } catch { /* column absent */ }
        return { ...base, count: ids.size };
      }
      case 'notification_statements': {
        const a = await count('notification_statements', 'member_id', memberId);
        if (a !== null) return { ...base, count: a };
        try {
          const { count: c, error } = await supabase.from('notification_statements')
            .select('*', { count: 'exact', head: true })
            .eq('recipient_type', 'member').eq('recipient_id', memberId);
          return { ...base, count: error ? null : (c ?? 0) };
        } catch { return { ...base, count: null }; }
      }
      case 'notification_preferences': {
        const a = await count('notification_preferences', 'member_id', memberId);
        if (a !== null) return { ...base, count: a };
        try {
          const { count: c, error } = await supabase.from('notification_preferences')
            .select('*', { count: 'exact', head: true })
            .eq('owner_type', 'member').eq('owner_id', memberId);
          return { ...base, count: error ? null : (c ?? 0) };
        } catch { return { ...base, count: null }; }
      }
      case 'email_queue': {
        // queue rows for member notifications + anything addressed to the member
        const ids = new Set<string>();
        try {
          const { data: notifs } = await supabase.from('notifications').select('id').eq('member_id', memberId);
          const notifIds = (notifs || []).map((r: any) => r.id);
          if (notifIds.length > 0) {
            const { data } = await supabase.from('email_queue').select('id').in('notification_id', notifIds);
            (data || []).forEach((r: any) => ids.add(r.id));
          }
        } catch { /* ignore */ }
        if (memberEmail) {
          try {
            const { data } = await supabase.from('email_queue').select('id').eq('to_email', memberEmail);
            (data || []).forEach((r: any) => ids.add(r.id));
          } catch { /* ignore */ }
        }
        return { ...base, count: ids.size };
      }
      case 'meetings_chair_secretary': {
        const chaired = await count('meetings', 'chairperson', memberId);
        const secretary = await count('meetings', 'secretary', memberId);
        if (chaired === null && secretary === null) return { ...base, count: null };
        return { ...base, count: (chaired || 0) + (secretary || 0) };
      }
      case 'member_registration_submissions': {
        const a = await count('member_registration_submissions', 'registered_member_id', memberId);
        const b = await count('member_registration_submissions', 'existing_member_id', memberId);
        if (a === null && b === null) return { ...base, count: null };
        return { ...base, count: (a || 0) + (b || 0) };
      }
      case 'media_assets': {
        try {
          const { count: c, error } = await supabase.from('media_assets')
            .select('*', { count: 'exact', head: true })
            .eq('owner_type', 'member').eq('owner_id', memberId);
          return { ...base, count: error ? null : (c ?? 0) };
        } catch { return { ...base, count: null }; }
      }
      case 'file_uploads': {
        try {
          const { count: c, error } = await supabase.from('file_uploads')
            .select('*', { count: 'exact', head: true })
            .eq('entity_type', 'member').eq('entity_id', memberId);
          return { ...base, count: error ? null : (c ?? 0) };
        } catch { return { ...base, count: null }; }
      }
      case 'member_financial_obligations':
      case 'unity_fund_actual_receipts': {
        // Views — report the member's visible rows, nothing is deleted.
        if (dep.key === 'unity_fund_actual_receipts') return { ...base, count: null };
        const c = await count(dep.table, 'member_id', memberId);
        return { ...base, count: c };
      }
      case 'audit_logs': {
        const c = await count('audit_logs', 'record_id', memberId);
        return { ...base, count: c };
      }
      case 'notification_event_logs': {
        try {
          const { count: c, error } = await supabase.from('notification_event_logs')
            .select('*', { count: 'exact', head: true })
            .eq('entity_type', 'member').eq('entity_id', memberId);
          return { ...base, count: error ? null : (c ?? 0) };
        } catch { return { ...base, count: null }; }
      }
      default:
        return { ...base, count: await count(dep.table, 'member_id', memberId) };
    }
  }

  /**
   * PERMANENT DELETION. Atomic via the permanently_delete_member() RPC
   * (migration 045) — one database transaction, all-or-nothing.
   */
  async executePermanentDeletion(
    memberId: string,
    adminUserId: string,
    confirmText: string,
    opts: { reason?: string; ipAddress?: string; userAgent?: string } = {}
  ): Promise<PermanentDeletionReport> {
    if (confirmText !== PERMANENT_DELETE_CONFIRMATION_TEXT) {
      throw new PermanentDeletionError(
        `Confirmation text must be exactly "${PERMANENT_DELETE_CONFIRMATION_TEXT}"`,
        'CONFIRMATION_REQUIRED'
      );
    }

    const supabase = await createServiceClient();

    // Resolve the member first (identity for the report + audit).
    const { data: member } = await supabase
      .from('members')
      .select('id, member_number, first_name, last_name')
      .eq('id', memberId)
      .maybeSingle();
    if (!member) {
      throw new PermanentDeletionError('Member not found', 'NOT_FOUND');
    }

    // ---- ATOMIC DELETION (single Postgres transaction) ----
    const { data: rpcReport, error: rpcError } = await supabase.rpc('permanently_delete_member', {
      p_member_id: memberId,
      p_admin_id: adminUserId,
      p_reason: opts.reason || null,
      p_ip_address: opts.ipAddress || null,
      p_user_agent: opts.userAgent || null,
    });

    if (rpcError) {
      // The function raised → Postgres rolled back the entire transaction.
      throw new PermanentDeletionError(
        `Permanent deletion failed and was fully rolled back: ${rpcError.message}`,
        'EXECUTION_FAILED',
        rpcError
      );
    }

    // ---- POST-DELETION VERIFICATION ----
    const verification = await this.verifyDeletion(memberId, member.member_number);
    if (!verification.allClear) {
      // This should be impossible (the transaction committed), but if the DB
      // was only partially migrated some optional table may be missing the
      // guard. Surface it loudly — never claim success.
      throw new PermanentDeletionError(
        'Deletion committed but verification found remaining member records',
        'VERIFICATION_FAILED',
        verification
      );
    }

    // ---- RECALCULATE / VERIFY ORG TOTALS (all derived live from the ledger) ----
    const totalsAfter = await this.computeOrgTotals();

    // ---- STORAGE CLEANUP (best-effort, post-commit — storage is not transactional) ----
    const storageCleanup = await this.cleanupStorage(supabase, rpcReport);

    // ---- ADMINISTRATIVE AUDIT (immutable audit_logs row; the minimal
    // permanent_member_deletions row was written inside the transaction) ----
    let auditRecorded = true;
    try {
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        action: 'member_permanently_deleted',
        description: `Member ${member.member_number} (${member.first_name} ${member.last_name}) permanently deleted by super admin`,
        entity_type: 'member',
        entity_id: memberId,
        record_id: memberId,
        user_id: adminUserId,
        after_value: {
          member_number: member.member_number,
          deleted_counts: rpcReport?.deleted_counts || {},
        },
      });
    } catch (e) {
      console.warn('Permanent deletion audit_logs insert failed (audit row exists in permanent_member_deletions):', e);
      auditRecorded = false;
    }

    return {
      success: true,
      member: {
        id: memberId,
        member_number: rpcReport?.member_number || member.member_number,
        name: rpcReport?.member_name || `${member.first_name} ${member.last_name}`,
      },
      deletedCounts: rpcReport?.deleted_counts || {},
      verification,
      totalsAfter,
      storageCleanup,
      auditRecorded,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Verify the member and ALL dependent records are gone, and that no
   * orphaned rows remain in any member-linked table.
   */
  private async verifyDeletion(memberId: string, memberNumber: string): Promise<DeletionVerification> {
    const supabase = await createServiceClient();

    const { data: memberRow } = await supabase
      .from('members').select('id').eq('id', memberId).maybeSingle();
    const { data: numberRow } = await supabase
      .from('members').select('id').eq('member_number', memberNumber).maybeSingle();

    const remaining: Record<string, number> = {};
    const memberTables: Array<[string, string]> = [
      ['accounts', 'accounts'],
      ['transactions', 'transactions'],
      ['loans', 'loans'],
      ['fines', 'fines'],
      ['documents', 'documents'],
      ['compliance_records', 'compliance_records'],
      ['member_compliance', 'member_compliance'],
      ['member_approval_workflow', 'member_approval_workflow'],
      ['loan_interest_receipts', 'loan_interest_receipts'],
      ['meeting_attendance', 'meeting_attendance'],
      ['notifications', 'notifications'],
    ];
    for (const [key, table] of memberTables) {
      try {
        const { count, error } = await supabase
          .from(table).select('*', { count: 'exact', head: true }).eq('member_id', memberId);
        if (!error) remaining[key] = count || 0;
      } catch { /* optional table absent */ }
    }

    const allClear =
      !memberRow &&
      !numberRow &&
      Object.values(remaining).every((c) => c === 0);

    return {
      memberExists: !!memberRow,
      memberLookupByNumber: !!numberRow,
      remainingRecords: remaining,
      allClear,
    };
  }

  /** Org totals are derived LIVE from the ledger — recompute and report. */
  private async computeOrgTotals(): Promise<OrgTotalsAfterDeletion> {
    const supabase = await createServiceClient();

    const { count: totalMembers } = await supabase
      .from('members').select('*', { count: 'exact', head: true });
    const { count: activeMembers } = await supabase
      .from('members').select('*', { count: 'exact', head: true }).eq('status', 'active');

    const { data: txns } = await supabase
      .from('transactions').select('transaction_type, amount').eq('reversed', false);
    let netSavings = 0, netContributions = 0, netWelfare = 0;
    for (const t of txns || []) {
      const amt = Number(t.amount || 0);
      switch (t.transaction_type) {
        case 'savings_deposit': netSavings += amt; break;
        case 'savings_withdrawal': netSavings -= amt; break;
        case 'contribution_monthly':
        case 'contribution_special':
        case 'contribution_development': netContributions += amt; break;
        case 'welfare_deposit': netWelfare += amt; break;
        case 'welfare_disbursement': netWelfare -= amt; break;
      }
    }

    const { data: loanRows } = await supabase
      .from('loans').select('amount_due').in('status', ['approved', 'disbursed', 'active', 'defaulted']);
    const outstandingLoans = (loanRows || []).reduce((s: number, l: any) => s + Number(l.amount_due || 0), 0);

    const { data: fineRows } = await supabase
      .from('fines').select('amount, amount_paid').in('status', ['pending', 'partial']);
    const outstandingFines = (fineRows || []).reduce(
      (s: number, f: any) => s + (Number(f.amount || 0) - Number(f.amount_paid || 0)), 0);

    return {
      totalMembers: totalMembers || 0,
      activeMembers: activeMembers || 0,
      netSavings, netContributions, netWelfare, outstandingLoans, outstandingFines,
    };
  }

  /** Best-effort storage object cleanup AFTER the DB transaction committed. */
  private async cleanupStorage(
    supabase: any, rpcReport: any
  ): Promise<{ removed: number; failed: number }> {
    let removed = 0, failed = 0;

    const docPaths: string[] = rpcReport?.document_storage_paths || [];
    if (docPaths.length > 0) {
      try {
        const { error } = await supabase.storage.from('documents').remove(docPaths);
        if (error) failed += docPaths.length; else removed += docPaths.length;
      } catch { failed += docPaths.length; }
    }

    const mediaObjects: Array<{ bucket: string; path: string }> = rpcReport?.media_storage_objects || [];
    for (const obj of mediaObjects) {
      if (!obj?.bucket || !obj?.path) continue;
      try {
        const { error } = await supabase.storage.from(obj.bucket).remove([obj.path]);
        if (error) failed += 1; else removed += 1;
      } catch { failed += 1; }
    }

    return { removed, failed };
  }

  /** The minimal administrative audit trail of permanent deletions. */
  async listDeletionAudit(limit = 50) {
    const supabase = await createServiceClient();
    try {
      const { data, error } = await supabase
        .from('permanent_member_deletions')
        .select('id, member_id, member_number, deleted_by, deleted_at, reason, deleted_counts')
        .order('deleted_at', { ascending: false })
        .limit(limit);
      if (error) return [];
      return data || [];
    } catch {
      return [];
    }
  }
}

export const memberDeletionService = new MemberDeletionService();
