/**
 * Member-lookup verification tools (read-only).
 *
 * Compares the three layers a member's data flows through:
 *
 *   DATABASE  →  BACKEND API (/api/v1)  →  MEMBER LOOKUP DISPLAY (BFF)
 *
 * The member-lookup frontend does NOT access Supabase directly; it consumes
 * the YUNITE backend API. So the BFF is a thin proxy. The genuinely
 * independent layers are the DATABASE (independent ledger recompute) and the
 * BACKEND API (the gateway's balances endpoint, which uses the transaction
 * engine). The DISPLAY layer is fetched from the member-lookup BFF when
 * `MEMBER_LOOKUP_VERIFY_URL` is configured; otherwise it is marked
 * 'unavailable' and the verification falls back to a robust DB-vs-API
 * comparison (documented in the result).
 *
 * All fetches are read-only GETs with short timeouts so verification never
 * blocks and never mutates data. No credentials are sent to AI providers —
 * the raw values stay server-side; only sanitized values reach the model.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { transactionEngine } from '@/lib/services/transaction.engine';
import type { MemberDataGraph, MemberSearchCandidate } from '../types';
import { getSharesRaw } from './database-tools';

export interface LayerBalances {
  savings?: number;
  shares?: number;
  contributions?: number;
  welfare?: number;
  fines?: number;
  loans?: number;
  source: 'database' | 'api' | 'display' | 'unavailable';
  note?: string;
}

/** Independent ledger recompute (does NOT reuse transactionEngine's helpers). */
export async function getDatabaseBalances(memberId: string): Promise<LayerBalances> {
  const supabase = await createServiceClient();
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, account_type')
    .eq('member_id', memberId);
  if (!accounts || accounts.length === 0) return { source: 'database', note: 'no accounts' };

  const debit = new Set(['savings_withdrawal', 'registration_fee', 'annual_fee', 'welfare_disbursement', 'fine_payment']);
  const balances: Record<string, number> = { savings: 0, contributions: 0, welfare: 0, fines: 0, loans: 0 };
  const acctById = new Map<string, string>();
  for (const a of accounts) acctById.set(a.id, a.account_type);

  for (const account_type of ['savings', 'contributions', 'welfare', 'fines']) {
    const acct = accounts.find((a) => a.account_type === account_type);
    if (!acct) continue;
    const { data: txns } = await supabase
      .from('transactions')
      .select('transaction_type, amount')
      .eq('account_id', acct.id)
      .eq('reversed', false)
      .neq('transaction_type', 'reversal');
    for (const t of txns ?? []) {
      const amt = Number(t.amount);
      balances[account_type] += debit.has(t.transaction_type) ? -amt : amt;
    }
  }

  // Loans: sum amount_due for active loans (matches the engine's loan balance).
  const { data: loans } = await supabase
    .from('loans')
    .select('amount_due')
    .eq('member_id', memberId)
    .in('status', ['approved', 'disbursed', 'active']);
  balances.loans = (loans ?? []).reduce((s, l) => s + Number(l.amount_due || 0), 0);

  // Shares: derived from savings / share_value (matches engine).
  const { data: shareSetting } = await supabase.from('settings').select('value').eq('key', 'shares.share_value').maybeSingle();
  const shareValue = shareSetting ? parseFloat(shareSetting.value) || 100 : 100;
  const shares = Math.floor(balances.savings / shareValue);

  return { ...balances, shares, source: 'database' };
}

/** Backend API layer — uses the transaction engine (what /api/v1 returns). */
export async function getApiBalances(memberId: string): Promise<LayerBalances> {
  const balances = await transactionEngine.calculateAllBalances(memberId);
  return { ...balances, source: 'api' };
}

/**
 * Member-lookup display layer. Attempts the BFF overview endpoint when
 * `MEMBER_LOOKUP_VERIFY_URL` is configured (with an optional shared verify
 * secret). The BFF is a thin proxy over the backend, so when unreachable the
 * verification records display as 'unavailable' and falls back to DB-vs-API.
 */
export async function getDisplayBalances(memberId: string): Promise<LayerBalances> {
  const base = process.env.MEMBER_LOOKUP_VERIFY_URL;
  if (!base) return { source: 'unavailable', note: 'BFF verify URL not configured' };
  const url = `${base.replace(/\/$/, '')}/api/member/overview`;
  const secret = process.env.MEMBER_LOOKUP_VERIFY_SECRET;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(secret ? { 'x-verify-secret': secret, 'x-verify-member-id': memberId } : {}),
      },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!res.ok) return { source: 'unavailable', note: `BFF HTTP ${res.status}` };
    const body = await res.json();
    const balances = body?.data?.balances;
    if (!balances) return { source: 'unavailable', note: 'no balances in BFF response' };
    return { ...balances, source: 'display' };
  } catch (e) {
    return { source: 'unavailable', note: e instanceof Error ? e.message : 'fetch failed' };
  }
}

/** Fetch the raw member identity for field comparison (server-side only). */
export async function getMemberIdentity(memberId: string) {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from('members')
    .select('member_number, status, registration_date, first_name, last_name, phone, id_number')
    .eq('id', memberId)
    .maybeSingle();
  return data;
}

/**
 * Search members by multiple identifiers (req. #11, #18).
 *
 * Accepts a free-text query and matches it against name, member number, ID
 * number, phone, and email. Returns candidate matches with which fields
 * matched — the UI requires selection when multiple members match (never
 * guesses). Read-only; no PII leaves the server (the admin console is the
 * consumer).
 */
export async function searchMembers(query: string, limit = 20): Promise<MemberSearchCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = await createServiceClient();
  const ilike = `%${q}%`;

  // Query each identifier column with OR; Supabase supports or() chains.
  const { data, error } = await supabase
    .from('members')
    .select('id, member_number, first_name, last_name, phone, email, id_number, status')
    .or(
      `member_number.ilike.${ilike},` +
      `first_name.ilike.${ilike},` +
      `last_name.ilike.${ilike},` +
      `phone.ilike.${ilike},` +
      `email.ilike.${ilike},` +
      `id_number.ilike.${ilike}`,
    )
    .limit(limit);

  if (error || !data) return [];

  return data.map((m) => {
    const matched_by: string[] = [];
    const ql = q.toLowerCase();
    if (m.member_number?.toLowerCase().includes(ql)) matched_by.push('member_number');
    if (m.first_name?.toLowerCase().includes(ql)) matched_by.push('first_name');
    if (m.last_name?.toLowerCase().includes(ql)) matched_by.push('last_name');
    if (m.phone?.toLowerCase().includes(ql)) matched_by.push('phone');
    if (m.email?.toLowerCase().includes(ql)) matched_by.push('email');
    if (m.id_number?.toLowerCase().includes(ql)) matched_by.push('id_number');
    return {
      id: m.id,
      member_number: m.member_number,
      first_name: m.first_name ?? '',
      last_name: m.last_name ?? '',
      phone: m.phone ?? undefined,
      email: m.email ?? undefined,
      id_number: m.id_number ?? undefined,
      status: m.status ?? 'unknown',
      matched_by: matched_by.length ? matched_by : ['partial'],
    };
  });
}

/**
 * Build the complete member data graph (req. #13).
 *
 * Gathers every related record for a member across all modules so the
 * forensic engine can trace values through the full chain:
 *   Profile → Compliance → Accounts → Savings → Shares → Contributions →
 *   Welfare → Fines → Loans → Repayments → Documents → Notifications.
 *
 * Also computes the layered balances (database / calculation / api /
 * member_lookup / display) for cross-layer comparison (req. #5, #15).
 */
export async function getMemberGraph(memberId: string): Promise<MemberDataGraph> {
  const supabase = await createServiceClient();

  const [profile, compliance, accounts, savingsTxns, contributions, welfare, fines, loans, loanRepayments, documents, notifications, sharesRaw, dbBal, apiBal, displayBal] = await Promise.all([
    supabase.from('members').select('*').eq('id', memberId).maybeSingle().then((r) => r.data),
    supabase.from('compliance_records').select('*').eq('member_id', memberId).then((r) => r.data ?? []),
    supabase.from('accounts').select('*').eq('member_id', memberId).then((r) => r.data ?? []),
    supabase.from('transactions').select('transaction_ref, transaction_type, amount, balance_before, balance_after, reversed, created_at').eq('member_id', memberId).order('created_at', { ascending: false }).limit(200).then((r) => r.data ?? []),
    supabase.from('transactions').select('transaction_ref, amount, transaction_type, metadata, reversed, created_at').eq('member_id', memberId).in('transaction_type', ['contribution_monthly', 'contribution_special', 'contribution_development']).eq('reversed', false).order('created_at', { ascending: false }).limit(200).then((r) => r.data ?? []),
    supabase.from('transactions').select('transaction_ref, amount, transaction_type, reversed, created_at').eq('member_id', memberId).in('transaction_type', ['welfare_deposit', 'welfare_disbursement']).order('created_at', { ascending: false }).limit(200).then((r) => r.data ?? []),
    supabase.from('fines').select('id, fine_number, fine_type, amount, amount_paid, status, due_date, created_at').eq('member_id', memberId).order('created_at', { ascending: false }).limit(200).then((r) => r.data ?? []),
    supabase.from('loans').select('id, loan_number, principal_amount, interest_rate, interest_amount, total_amount, amount_paid, amount_due, status, repayment_period_months, monthly_repayment, disbursement_date').eq('member_id', memberId).order('created_at', { ascending: false }).limit(200).then((r) => r.data ?? []),
    supabase.from('transactions').select('transaction_ref, amount, balance_after, reversed, created_at').eq('member_id', memberId).eq('transaction_type', 'loan_repayment').order('created_at', { ascending: false }).limit(200).then((r) => r.data ?? []),
    supabase.from('documents').select('id, document_type, status, created_at').eq('member_id', memberId).order('created_at', { ascending: false }).limit(100).then((r) => r.data ?? []),
    supabase.from('notifications').select('subject, status, created_at').eq('recipient_id', memberId).order('created_at', { ascending: false }).limit(50).then((r) => r.data ?? []),
    getSharesRaw(memberId),
    getDatabaseBalances(memberId),
    getApiBalances(memberId),
    getDisplayBalances(memberId),
  ]);

  const layers: MemberDataGraph['layers'] = {
    database: dbBal.source === 'database' ? stripLayer(dbBal) : undefined,
    calculation: apiBal.source === 'api' ? stripLayer(apiBal) : undefined, // engine calculation
    api: apiBal.source === 'api' ? stripLayer(apiBal) : undefined,
    member_lookup: displayBal.source === 'display' ? stripLayer(displayBal) : undefined,
    display: displayBal.source === 'display' ? stripLayer(displayBal) : undefined,
  };

  return {
    profile: profile ?? undefined,
    compliance,
    accounts,
    savings_transactions: savingsTxns,
    shares: sharesRaw,
    contributions,
    welfare,
    fines,
    loans,
    loan_repayments: loanRepayments,
    documents,
    notifications,
    layers,
  };
}

function stripLayer(b: LayerBalances): Record<string, number | undefined> {
  return {
    savings: b.savings,
    shares: b.shares,
    contributions: b.contributions,
    welfare: b.welfare,
    fines: b.fines,
    loans: b.loans,
  };
}

/** Fetch the member-lookup display identity (BFF) if reachable. */
export async function getDisplayIdentity(memberId: string): Promise<Record<string, unknown> | null> {
  const base = process.env.MEMBER_LOOKUP_VERIFY_URL;
  if (!base) return null;
  const secret = process.env.MEMBER_LOOKUP_VERIFY_SECRET;
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/member/overview`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(secret ? { 'x-verify-secret': secret, 'x-verify-member-id': memberId } : {}),
      },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.data?.member ?? null;
  } catch {
    return null;
  }
}
