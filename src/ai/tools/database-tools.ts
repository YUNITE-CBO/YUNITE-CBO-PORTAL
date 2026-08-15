/**
 * Read-only database investigation tools.
 *
 * These tools gather the data snapshot the AI investigates. They are
 * STRICTLY read-only: no INSERT/UPDATE/DELETE. The AI never receives raw DB
 * credentials — these helpers use the existing service client and return
 * already-shaped, PII-sanitized payloads.
 *
 * The deterministic engines also use these tools (via the raw, un-sanitized
 * getters where needed) so there is ONE data-gathering layer, not two.
 *
 * Tools exposed (all read-only):
 *   getDatabaseSchema, queryReadOnlyDatabase (table listing + counts, NOT
 *     arbitrary SQL — see below), getMember, getMemberFinancials,
 *   getSavingsTransactions, getShares, getLoans, getLoanRepayments,
 *   getContributions, getFines, getWelfare, getOrganizationSettings,
 *   getBusinessRules, getAuditLogs, getModuleHealth.
 *
 * "queryReadOnlyDatabase" is NOT arbitrary SQL. It runs a fixed set of safe
 * SELECT probes (row counts, sums) so the AI can never execute arbitrary
 * SQL. The AI receives the RESULTS, never query execution.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { transactionEngine } from '@/lib/services/transaction.engine';
import { settingsService } from '@/lib/services/settings.service';
import type { AccountType } from '@/lib/services/transaction.engine';

/** List of tables YUNITE knows about (controlled surface). */
export const KNOWN_TABLES = [
  'members', 'accounts', 'transactions', 'loans', 'fines', 'documents',
  'compliance_records', 'settings', 'audit_logs', 'users', 'organizations',
  'meetings', 'contribution_campaigns',
] as const;

/** Stable schema description the AI can reason about (no credentials). */
export async function getDatabaseSchema(): Promise<Record<string, unknown>> {
  return {
    tables: KNOWN_TABLES.map((t) => ({
      name: t,
      description: TABLE_DESCRIPTIONS[t] ?? '',
    })),
    account_types: ['savings', 'shares', 'contributions', 'welfare', 'fines', 'loans'],
    transaction_types: [
      'savings_deposit', 'savings_withdrawal', 'savings_adjustment',
      'registration_fee', 'annual_fee',
      'contribution_monthly', 'contribution_special', 'contribution_development',
      'welfare_deposit', 'welfare_disbursement',
      'fine_posting', 'fine_payment',
      'loan_disbursement', 'loan_repayment', 'reversal',
    ],
    note: 'Balances are derived from the transaction ledger (source of truth), not stored. Reversed transactions are excluded from balance calculations.',
  };
}

const TABLE_DESCRIPTIONS: Record<string, string> = {
  members: 'CBO members (single source of truth for member identity).',
  accounts: 'Logical per-member accounts by account_type (unique per member+type).',
  transactions: 'Authoritative financial ledger. Never deleted; reversals preserve audit trail.',
  loans: 'Loan records with principal, interest, amount_paid, amount_due, status.',
  fines: 'Fines with amount, amount_paid, status (pending/partial/paid/waived).',
  documents: 'Member uploaded documents (KYC, ID, etc.).',
  compliance_records: 'Per-member compliance items.',
  settings: 'Business rules (key/value). Authoritative for all financial rules.',
  audit_logs: 'Immutable audit trail of important actions.',
  users: 'Admin/staff portal users with role hierarchy.',
  organizations: 'CBO organization profile.',
  meetings: 'Scheduled meetings.',
  contribution_campaigns: 'Contribution campaigns with target/collected totals.',
};

/** Read-only counts + sums per known table (no arbitrary SQL). */
export async function queryReadOnlyDatabase(): Promise<Record<string, unknown>> {
  const supabase = await createServiceClient();
  const counts: Record<string, number> = {};
  for (const t of KNOWN_TABLES) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
    counts[t] = count ?? 0;
  }

  // Reversal / orphan probes (read-only aggregations).
  const [reversedTxns, loanActive, finesPending, negativeBalances] = await Promise.all([
    supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('reversed', true),
    supabase.from('loans').select('amount_due', { count: 'exact', head: false }).in('status', ['approved', 'disbursed', 'active']),
    supabase.from('fines').select('amount, amount_paid', { count: 'exact', head: false }).in('status', ['pending', 'partial']),
    supabase.from('transactions').select('balance_after', { count: 'exact', head: false }).lt('balance_after', 0),
  ]);

  return {
    row_counts: counts,
    reversed_transactions: reversedTxns.count ?? 0,
    active_loans: loanActive.count ?? 0,
    pending_or_partial_fines: finesPending.count ?? 0,
    negative_balance_after_count: negativeBalances.count ?? 0,
  };
}

/** Raw member (UN-sanitized) — used by deterministic engines. */
export async function getMemberRaw(memberId: string) {
  const supabase = await createServiceClient();
  const { data } = await supabase.from('members').select('*').eq('id', memberId).maybeSingle();
  return data;
}

export async function getMemberFinancialsRaw(memberId: string) {
  return transactionEngine.calculateAllBalances(memberId);
}

export async function getSavingsTransactionsRaw(memberId: string, limit = 200) {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from('transactions')
    .select('transaction_ref, transaction_type, amount, balance_before, balance_after, reversed, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getSharesRaw(memberId: string) {
  const balances = await transactionEngine.calculateAllBalances(memberId);
  const shareValue = await settingsService.getNumber('shares.share_value', 100);
  return { shares: balances.shares, share_value: shareValue, savings_basis: balances.savings };
}

export async function getLoansRaw(memberId?: string) {
  const supabase = await createServiceClient();
  let q = supabase
    .from('loans')
    .select('id, loan_number, member_id, principal_amount, interest_rate, interest_amount, total_amount, amount_paid, amount_due, status, repayment_period_months, monthly_repayment, disbursement_date')
    .order('created_at', { ascending: false });
  if (memberId) q = q.eq('member_id', memberId);
  const { data } = await q.limit(500);
  return data ?? [];
}

export async function getLoanRepaymentsRaw(memberId?: string) {
  const supabase = await createServiceClient();
  let q = supabase
    .from('transactions')
    .select('transaction_ref, member_id, amount, balance_after, reversed, created_at')
    .eq('transaction_type', 'loan_repayment')
    .order('created_at', { ascending: false });
  if (memberId) q = q.eq('member_id', memberId);
  const { data } = await q.limit(500);
  return data ?? [];
}

export async function getContributionsRaw(memberId?: string) {
  const supabase = await createServiceClient();
  let q = supabase
    .from('transactions')
    .select('transaction_ref, member_id, amount, transaction_type, metadata, reversed, created_at')
    .in('transaction_type', ['contribution_monthly', 'contribution_special', 'contribution_development'])
    .eq('reversed', false)
    .order('created_at', { ascending: false });
  if (memberId) q = q.eq('member_id', memberId);
  const { data } = await q.limit(500);
  return data ?? [];
}

export async function getFinesRaw(memberId?: string) {
  const supabase = await createServiceClient();
  let q = supabase
    .from('fines')
    .select('id, fine_number, member_id, fine_type, amount, amount_paid, status, due_date, created_at')
    .order('created_at', { ascending: false });
  if (memberId) q = q.eq('member_id', memberId);
  const { data } = await q.limit(500);
  return data ?? [];
}

export async function getWelfareRaw(memberId?: string) {
  const supabase = await createServiceClient();
  let q = supabase
    .from('transactions')
    .select('transaction_ref, member_id, amount, transaction_type, reversed, created_at')
    .in('transaction_type', ['welfare_deposit', 'welfare_disbursement'])
    .order('created_at', { ascending: false });
  if (memberId) q = q.eq('member_id', memberId);
  const { data } = await q.limit(500);
  return data ?? [];
}

export async function getOrganizationSettings() {
  const supabase = await createServiceClient();
  const { data } = await supabase.from('settings').select('key, value, category').order('key');
  return data ?? [];
}

export async function getBusinessRules() {
  const keys = [
    'shares.share_value', 'loan.max_percentage', 'loan.max_period_months',
    'loan.default_interest_rate', 'loan.max_amount', 'fees.registration',
    'fees.annual', 'organization.currency', 'welfare.monthly_amount',
    'contributions.monthly_default',
  ];
  return settingsService.getMany(keys);
}

export async function getAuditLogs(limit = 100) {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from('audit_logs')
    .select('action, record_id, user_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getModuleHealth(): Promise<Record<string, unknown>> {
  const supabase = await createServiceClient();
  const { count: members } = await supabase.from('members').select('*', { count: 'exact', head: true });
  const { count: activeMembers } = await supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'active');
  const { count: orphanAccounts } = await supabase.from('accounts').select('*', { count: 'exact', head: true });
  return {
    members: members ?? 0,
    active_members: activeMembers ?? 0,
    accounts: orphanAccounts ?? 0,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Connectivity / data-availability probe for the investigation payload.
 *
 * Every data getter in this module does `const { data } = await ...` and
 * falls back to `[]` / `0` on failure WITHOUT inspecting `.error`. Supabase
 * JS returns `{ data: null, error }` on auth/network/RLS failure rather than
 * throwing, so a missing SUPABASE_SERVICE_ROLE_KEY (or an unreachable DB)
 * silently turns every collection into an empty array — which the AI then
 * reports as a "no member data" finding instead of recognising a collection
 * failure.
 *
 * This probe runs a single cheap count against `members` and inspects the
 * `.error` so the payload carries an explicit `data_availability` signal the
 * prompt builder can translate into a note for the AI. It never throws.
 */
export async function getDataAvailability(): Promise<Record<string, unknown>> {
  const urlSet = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const keySet = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const supabase = await createServiceClient();
    const { count, error } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true });
    if (error) {
      return {
        db_reachable: false,
        service_key_configured: keySet,
        supabase_url_configured: urlSet,
        error: error.message,
        error_code: error.code ?? null,
        note: 'Database query failed. Empty arrays in this snapshot likely reflect a COLLECTION FAILURE (auth/env/RLS), not a genuine absence of data. Do NOT report "no member data" as a system finding — flag it as a data-availability gap instead.',
      };
    }
    const empty = (count ?? 0) === 0;
    return {
      db_reachable: true,
      service_key_configured: keySet,
      supabase_url_configured: urlSet,
      member_count: count ?? 0,
      note: empty
        ? 'Database is reachable but the members table is empty (0 rows). This is a genuine empty-organization state, not a collection failure.'
        : 'Database reachable; member-level data is available for collection.',
    };
  } catch (e) {
    return {
      db_reachable: false,
      service_key_configured: keySet,
      supabase_url_configured: urlSet,
      error: e instanceof Error ? e.message : String(e),
      note: 'Database client could not be initialised. Empty arrays in this snapshot reflect a COLLECTION FAILURE, not a genuine absence of data. Do NOT report "no member data" as a system finding — flag it as a data-availability gap instead.',
    };
  }
}

/** A small active-member sample (profiles + financials) for full_system scope. */
export async function getMembersSampleRaw(limit = 5) {
  const supabase = await createServiceClient();
  const { data: sample } = await supabase
    .from('members')
    .select('id, member_number, status, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);
  const members = sample ?? [];
  return Promise.all(
    members.map(async (m) => ({
      member_id: m.id,
      member_number: m.member_number,
      financials: await getMemberFinancialsRaw(m.id),
      loans: await getLoansRaw(m.id),
      fines: await getFinesRaw(m.id),
      contributions: await getContributionsRaw(m.id),
      welfare: await getWelfareRaw(m.id),
      shares: await getSharesRaw(m.id),
    })),
  );
}

/** Compute the ledger-derived savings for a member (deterministic). */
export async function computeLedgerSavings(memberId: string): Promise<number> {
  return transactionEngine.calculateBalance(memberId, 'savings' as AccountType);
}
