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
