/**
 * UNITY FUND ENGINE — the financial heart of YUNITE PAMOJA CBO.
 *
 * The Unity Fund is the ORGANIZATION-level reserve/account. It is NOT a
 * member account. Member savings/shares/wallet stay member money; the Unity
 * Fund accumulates organization money and tracks organization expenditures
 * and liabilities.
 *
 * SINGLE SOURCE OF TRUTH (spec §20, §25):
 *   This engine is the ONE authoritative Unity Fund calculation. Other
 *   modules (dashboard, reports, documents, AI, APIs) consume it. No module
 *   computes a competing Unity Fund balance.
 *
 * NO DUPLICATE LEDGER (spec §11, §22, §41):
 *   ACTUAL org inflows from existing sources (contributions, welfare, fines,
 *   registration/annual fees, loan interest) are DERIVED from the existing
 *   authoritative `transactions` ledger + `loan_interest_receipts` — there is
 *   no second write, so duplicate-transaction risk is impossible by
 *   construction. Genuinely new org sources (donations, grants, organization
 *   loans, expenditures) have their own authoritative domain tables, which
 *   this engine reads.
 *
 * PENDING ≠ CASH (spec §1-§4, RULE 1-2):
 *   Pending receivables (unpaid contributions/welfare/fines/interest,
 *   pledged donations, approved-but-unreceived grants) are reported
 *   SEPARATELY and NEVER added to the actual balance.
 *
 * ORGANIZATION LOANS (spec §5, §28, §40, RULE 13-14):
 *   A received organization loan increases actual cash AND creates a
 *   liability. It is NEVER income/profit.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { settingsService } from './settings.service';
import { v4 as uuidv4 } from 'uuid';

/** Authoritative Unity Fund source modules (spec §12). */
export type UnityFundSource =
  | 'CONTRIBUTION'
  | 'WELFARE'
  | 'FINE'
  | 'PENALTY'
  | 'LOAN_INTEREST'
  | 'REGISTRATION_FEE'
  | 'ANNUAL_FEE'
  | 'DONATION'
  | 'GRANT'
  | 'ORGANIZATION_LOAN'
  | 'PROJECT_INCOME'
  | 'INVESTMENT_INCOME'
  | 'OTHER';

/** Direction of a Unity Fund ledger row. */
export type Direction = 'inflow' | 'outflow';

/** Payment status — the ACTUAL-vs-PENDING boundary (spec §13-§14). */
export type PaymentStatus = 'received' | 'pending' | 'reversed';

/** A unified virtual ledger row projected from authoritative sources. */
export interface UnityFundTransaction {
  id: string;
  source_module: UnityFundSource;
  source_record_id: string;
  member_id: string | null;
  member_number: string | null;
  member_name: string | null;
  amount: number;
  direction: Direction;
  payment_status: PaymentStatus;
  reference: string | null;
  description: string | null;
  transaction_date: string;
  loan_number?: string | null;
  project_id?: string | null;
}

export interface SourceBreakdown {
  source: UnityFundSource;
  label: string;
  actual: number;
  pending: number;
  transaction_count: number;
}

export interface ExpenditureSummary {
  total_expenditures: number;
  by_category: Array<{ category: string; total: number; count: number }>;
  recent: UnityFundTransaction[];
}

export interface LiabilitySummary {
  total_organization_loans_received: number;
  total_organization_loans_repaid: number;
  outstanding_liabilities: number;
  loans: Array<{
    id: string;
    org_loan_number: string;
    lender_name: string;
    received_amount: number;
    repaid_amount: number;
    outstanding_liability: number;
    status: string;
  }>;
}

export interface UnityFundPosition {
  actual_balance: number;
  pending_receivables: number;
  total_receipts: number;
  total_expenditures: number;
  organization_liabilities: number;
  net_financial_position: number;
  currency: string;
  sources: SourceBreakdown[];
  generated_at: string;
}

export interface ReconciliationCheck {
  label: string;
  expected: number;
  actual: number;
  difference: number;
  passed: boolean;
}

export interface ReconciliationResult {
  status: 'consistent' | 'discrepancy' | 'error';
  ledger_balance: number;
  source_balance: number;
  difference: number;
  checks: ReconciliationCheck[];
  discrepancies: Array<{ label: string; difference: number }>;
  checks_performed: number;
  generated_at: string;
}

export interface PeriodSummary {
  period: { start: string; end: string; label: string };
  opening_actual_balance: number;
  actual_receipts: number;
  actual_expenditures: number;
  closing_actual_balance: number;
  pending_receivables: number;
  outstanding_liabilities: number;
  receipts_by_source: Array<{ source: UnityFundSource; amount: number; count: number }>;
}

export interface PeriodFilter {
  start?: Date;
  end?: Date;
}

const SOURCE_LABELS: Record<UnityFundSource, string> = {
  CONTRIBUTION: 'Contributions',
  WELFARE: 'Welfare',
  FINE: 'Fines',
  PENALTY: 'Penalties',
  LOAN_INTEREST: 'Loan Interest',
  REGISTRATION_FEE: 'Registration Fees',
  ANNUAL_FEE: 'Annual Fees',
  DONATION: 'Donations',
  GRANT: 'Grants',
  ORGANIZATION_LOAN: 'Organization Loans',
  PROJECT_INCOME: 'Project Income',
  INVESTMENT_INCOME: 'Investment Income',
  OTHER: 'Other',
};

/** Transaction types on the authoritative ledger that are org inflows. */
const CONTRIBUTION_TYPES = ['contribution_monthly', 'contribution_special', 'contribution_development'];

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export class UnityFundEngine {
  // -----------------------------------------------------------------
  // ACTUAL BALANCE — real cash the organization actually has.
  // = actual receipts - posted expenditures.
  // Pending receivables and liabilities are NOT subtracted here; liabilities
  // are reported separately (a loan received is cash, even though owed back).
  // -----------------------------------------------------------------
  async getActualBalance(period?: PeriodFilter): Promise<number> {
    const [receipts, expenditures] = await Promise.all([
      this.getActualReceipts(period),
      this.getActualExpendituresTotal(period),
    ]);
    return receipts - expenditures;
  }

  /** Total actual org inflows (received/posted only). */
  async getActualReceipts(period?: PeriodFilter): Promise<number> {
    const supabase = await createServiceClient();
    const ranges = this.periodFilter(period);

    // Existing authoritative ledger: contributions, welfare, fines, fees.
    const { data: ledgerTxns } = await supabase
      .from('transactions')
      .select('transaction_type, amount')
      .in('transaction_type', [...CONTRIBUTION_TYPES, 'welfare_deposit', 'fine_payment', 'registration_fee', 'annual_fee'])
      .eq('reversed', false)
      .gte('posted_at', ranges.start)
      .lte('posted_at', ranges.end);
    const ledgerTotal = (ledgerTxns ?? []).reduce((s, t) => s + num(t.amount), 0);

    // Loan interest actually received (org money, separated from principal).
    const { data: interest } = await supabase
      .from('loan_interest_receipts')
      .select('interest_amount')
      .eq('status', 'received')
      .gte('received_date', ranges.start)
      .lte('received_date', ranges.end);
    const interestTotal = (interest ?? []).reduce((s, r) => s + num(r.interest_amount), 0);

    // Donations received.
    const { data: donations } = await supabase
      .from('donations')
      .select('received_amount, received_date')
      .in('status', ['received', 'partial'])
      .gte('received_date', ranges.start)
      .lte('received_date', ranges.end);
    const donationTotal = (donations ?? []).reduce((s, d) => s + num(d.received_amount), 0);

    // Grants received.
    const { data: grants } = await supabase
      .from('grants')
      .select('received_amount, received_date')
      .in('status', ['received', 'partial'])
      .gte('received_date', ranges.start)
      .lte('received_date', ranges.end);
    const grantTotal = (grants ?? []).reduce((s, g) => s + num(g.received_amount), 0);

    // Organization loans received (cash — liability tracked separately).
    const { data: orgLoans } = await supabase
      .from('organization_loans')
      .select('received_amount, received_date')
      .in('status', ['received', 'active', 'partial', 'completed'])
      .gte('received_date', ranges.start)
      .lte('received_date', ranges.end);
    const orgLoanTotal = (orgLoans ?? []).reduce((s, o) => s + num(o.received_amount), 0);

    return ledgerTotal + interestTotal + donationTotal + grantTotal + orgLoanTotal;
  }

  /** Total posted expenditures (authorized org outflows). */
  async getActualExpendituresTotal(period?: PeriodFilter): Promise<number> {
    const supabase = await createServiceClient();
    const ranges = this.periodFilter(period);
    const { data } = await supabase
      .from('unity_fund_expenditures')
      .select('amount')
      .eq('status', 'posted')
      .gte('transaction_date', ranges.start)
      .lte('transaction_date', ranges.end);
    return (data ?? []).reduce((s, e) => s + num(e.amount), 0);
  }

  // -----------------------------------------------------------------
  // PENDING RECEIVABLES — money expected/due but NOT yet received.
  // NEVER added to actual cash (RULE 1-2).
  // -----------------------------------------------------------------
  async getPendingReceivables(period?: PeriodFilter): Promise<number> {
    const breakdown = await this.getPendingBreakdown(period);
    return breakdown.reduce((s, b) => s + b.pending, 0);
  }

  // -----------------------------------------------------------------
  // FULL FINANCIAL POSITION — the dashboard's authoritative answer to
  // "How much real money does the CBO actually have?"
  // -----------------------------------------------------------------
  async getFinancialPosition(period?: PeriodFilter): Promise<UnityFundPosition> {
    const [actualBalance, pendingTotal, receipts, expenditures, liabilities, sources, currency] = await Promise.all([
      this.getActualBalance(period),
      this.getPendingReceivables(period),
      this.getActualReceipts(period),
      this.getActualExpendituresTotal(period),
      this.getLiabilities(),
      this.getSourceBreakdown(period),
      settingsService.get('organization.currency').then((c) => c || 'KES'),
    ]);

    // Net financial position = actual cash - outstanding liabilities.
    // (A received org loan is cash but also a debt; netting shows true position.)
    const net = actualBalance - liabilities.outstanding_liabilities;

    return {
      actual_balance: actualBalance,
      pending_receivables: pendingTotal,
      total_receipts: receipts,
      total_expenditures: expenditures,
      organization_liabilities: liabilities.outstanding_liabilities,
      net_financial_position: net,
      currency,
      sources,
      generated_at: new Date().toISOString(),
    };
  }

  // -----------------------------------------------------------------
  // SOURCE BREAKDOWN — actual + pending per source (reconciles exactly).
  // -----------------------------------------------------------------
  async getSourceBreakdown(period?: PeriodFilter): Promise<SourceBreakdown[]> {
    const supabase = await createServiceClient();
    const ranges = this.periodFilter(period);

    // ACTUAL per source from the authoritative ledger.
    const { data: ledgerTxns } = await supabase
      .from('transactions')
      .select('transaction_type, amount')
      .in('transaction_type', [...CONTRIBUTION_TYPES, 'welfare_deposit', 'fine_payment', 'registration_fee', 'annual_fee'])
      .eq('reversed', false)
      .gte('posted_at', ranges.start)
      .lte('posted_at', ranges.end);

    const actualBySource: Record<string, { amount: number; count: number }> = {};
    const bump = (src: string, amt: number) => {
      const e = actualBySource[src] ?? { amount: 0, count: 0 };
      e.amount += amt;
      e.count += 1;
      actualBySource[src] = e;
    };
    for (const t of ledgerTxns ?? []) {
      if (CONTRIBUTION_TYPES.includes(t.transaction_type)) bump('CONTRIBUTION', num(t.amount));
      else if (t.transaction_type === 'welfare_deposit') bump('WELFARE', num(t.amount));
      else if (t.transaction_type === 'fine_payment') bump('FINE', num(t.amount));
      else if (t.transaction_type === 'registration_fee') bump('REGISTRATION_FEE', num(t.amount));
      else if (t.transaction_type === 'annual_fee') bump('ANNUAL_FEE', num(t.amount));
    }

    // Loan interest.
    const { data: interest } = await supabase
      .from('loan_interest_receipts')
      .select('interest_amount')
      .eq('status', 'received')
      .gte('received_date', ranges.start)
      .lte('received_date', ranges.end);
    let interestActual = 0;
    let interestCount = 0;
    for (const r of interest ?? []) {
      interestActual += num(r.interest_amount);
      interestCount += 1;
    }

    // Donations / grants / org loans actual.
    const [{ data: donations }, { data: grants }, { data: orgLoans }] = await Promise.all([
      supabase.from('donations').select('received_amount, pledged_amount, status').in('status', ['received', 'partial', 'pledged']).gte('received_date', ranges.start).lte('received_date', ranges.end),
      supabase.from('grants').select('received_amount, approved_amount, status').in('status', ['received', 'partial', 'approved', 'committed']).gte('received_date', ranges.start).lte('received_date', ranges.end),
      supabase.from('organization_loans').select('received_amount, status').in('status', ['received', 'active', 'partial', 'completed']).gte('received_date', ranges.start).lte('received_date', ranges.end),
    ]);
    let donationActual = 0, donationCount = 0;
    for (const d of donations ?? []) {
      const r = num(d.received_amount);
      if (r > 0) {
        donationActual += r;
        donationCount += 1;
      }
    }
    let grantActual = 0, grantCount = 0;
    for (const g of grants ?? []) {
      const r = num(g.received_amount);
      if (r > 0) {
        grantActual += r;
        grantCount += 1;
      }
    }
    let orgLoanActual = 0, orgLoanCount = 0;
    for (const o of orgLoans ?? []) {
      const r = num(o.received_amount);
      if (r > 0) {
        orgLoanActual += r;
        orgLoanCount += 1;
      }
    }

    // PENDING per source.
    const pending = await this.getPendingBreakdown(period);
    const pendingBySource = new Map<string, number>();
    for (const p of pending) pendingBySource.set(p.source, p.pending);

    const sources: UnityFundSource[] = [
      'CONTRIBUTION', 'WELFARE', 'FINE', 'LOAN_INTEREST', 'REGISTRATION_FEE',
      'ANNUAL_FEE', 'DONATION', 'GRANT', 'ORGANIZATION_LOAN',
    ];
    const counts: Record<string, number> = {
      CONTRIBUTION: actualBySource['CONTRIBUTION']?.count ?? 0,
      WELFARE: actualBySource['WELFARE']?.count ?? 0,
      FINE: actualBySource['FINE']?.count ?? 0,
      LOAN_INTEREST: interestCount,
      REGISTRATION_FEE: actualBySource['REGISTRATION_FEE']?.count ?? 0,
      ANNUAL_FEE: actualBySource['ANNUAL_FEE']?.count ?? 0,
      DONATION: donationCount,
      GRANT: grantCount,
      ORGANIZATION_LOAN: orgLoanCount,
    };
    const actuals: Record<string, number> = {
      CONTRIBUTION: actualBySource['CONTRIBUTION']?.amount ?? 0,
      WELFARE: actualBySource['WELFARE']?.amount ?? 0,
      FINE: actualBySource['FINE']?.amount ?? 0,
      LOAN_INTEREST: interestActual,
      REGISTRATION_FEE: actualBySource['REGISTRATION_FEE']?.amount ?? 0,
      ANNUAL_FEE: actualBySource['ANNUAL_FEE']?.amount ?? 0,
      DONATION: donationActual,
      GRANT: grantActual,
      ORGANIZATION_LOAN: orgLoanActual,
    };

    return sources.map((s) => ({
      source: s,
      label: SOURCE_LABELS[s],
      actual: actuals[s] ?? 0,
      pending: pendingBySource.get(s) ?? 0,
      transaction_count: counts[s] ?? 0,
    })).filter((s) => s.actual > 0 || s.pending > 0 || s.transaction_count > 0);
  }

  /** Pending receivables grouped by source (never cash). */
  private async getPendingBreakdown(period?: PeriodFilter): Promise<Array<{ source: UnityFundSource; pending: number }>> {
    const supabase = await createServiceClient();
    // Pending member obligations (contributions, welfare, fines) come from the
    // authoritative member_financial_obligations view — same source the
    // obligations engine uses. We do NOT recompute them independently.
    const { data: obligations } = await supabase
      .from('member_financial_obligations')
      .select('obligation_type, remaining');

    const pending: Record<string, number> = {};
    for (const o of obligations ?? []) {
      if (num(o.remaining) <= 0) continue;
      if (o.obligation_type === 'contribution') pending['CONTRIBUTION'] = (pending['CONTRIBUTION'] ?? 0) + num(o.remaining);
      else if (o.obligation_type === 'welfare') pending['WELFARE'] = (pending['WELFARE'] ?? 0) + num(o.remaining);
      else if (o.obligation_type === 'fine') pending['FINE'] = (pending['FINE'] ?? 0) + num(o.remaining);
    }

    // Pending loan interest = accrued interest - received interest, per loan.
    const { data: loans } = await supabase
      .from('loans')
      .select('id, interest_amount')
      .in('status', ['approved', 'disbursed', 'active', 'defaulted']);
    const loanIds = (loans ?? []).map((l) => l.id);
    let receivedInterest = 0;
    if (loanIds.length) {
      const { data: rcv } = await supabase
        .from('loan_interest_receipts')
        .select('interest_amount')
        .eq('status', 'received')
        .in('loan_id', loanIds);
      receivedInterest = (rcv ?? []).reduce((s, r) => s + num(r.interest_amount), 0);
    }
    const totalAccruedInterest = (loans ?? []).reduce((s, l) => s + num(l.interest_amount), 0);
    const pendingInterest = Math.max(0, totalAccruedInterest - receivedInterest);
    if (pendingInterest > 0) pending['LOAN_INTEREST'] = pendingInterest;

    // Pending donations (pledged - received).
    const { data: donations } = await supabase.from('donations').select('pledged_amount, received_amount').in('status', ['pledged', 'partial']);
    const pendingDonation = (donations ?? []).reduce((s, d) => s + Math.max(0, num(d.pledged_amount) - num(d.received_amount)), 0);
    if (pendingDonation > 0) pending['DONATION'] = pendingDonation;

    // Pending grants (approved - received).
    const { data: grants } = await supabase.from('grants').select('approved_amount, received_amount').in('status', ['approved', 'committed', 'partial']);
    const pendingGrant = (grants ?? []).reduce((s, g) => s + Math.max(0, num(g.approved_amount) - num(g.received_amount)), 0);
    if (pendingGrant > 0) pending['GRANT'] = pendingGrant;

    return Object.entries(pending).map(([source, p]) => ({ source: source as UnityFundSource, pending: p }));
  }

  // -----------------------------------------------------------------
  // TRANSACTION HISTORY — unified virtual ledger across all sources.
  // -----------------------------------------------------------------
  async getTransactionHistory(params: {
    source?: UnityFundSource;
    payment_status?: PaymentStatus;
    start_date?: string;
    end_date?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ transactions: UnityFundTransaction[]; total: number; page: number; limit: number; total_pages: number }> {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 50, 200);
    const rows = await this.collectTransactions(params);
    rows.sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
    const total = rows.length;
    const offset = (page - 1) * limit;
    return {
      transactions: rows.slice(offset, offset + limit),
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit) || 0,
    };
  }

  /** Collect the unified virtual ledger (actual + pending) from all sources. */
  private async collectTransactions(filter: {
    source?: UnityFundSource;
    payment_status?: PaymentStatus;
    start_date?: string;
    end_date?: string;
  }): Promise<UnityFundTransaction[]> {
    const supabase = await createServiceClient();
    const rows: UnityFundTransaction[] = [];
    const want = (src: UnityFundSource, status: PaymentStatus) =>
      (!filter.source || filter.source === src) && (!filter.payment_status || filter.payment_status === status);

    // Helper to fetch member names in bulk.
    const memberIds = new Set<string>();
    const collectMember = (id: string | null) => {
      if (id) memberIds.add(id);
    };

    // Existing ledger: contributions, welfare, fines, fees (ACTUAL).
    if (filter.payment_status !== 'pending') {
      let q = supabase
        .from('transactions')
        .select('id, transaction_ref, transaction_type, amount, posted_at, member_id, description, reference_number, member:members(member_number, first_name, last_name)')
        .in('transaction_type', [...CONTRIBUTION_TYPES, 'welfare_deposit', 'fine_payment', 'registration_fee', 'annual_fee'])
        .eq('reversed', false);
      if (filter.start_date) q = q.gte('posted_at', filter.start_date);
      if (filter.end_date) q = q.lte('posted_at', filter.end_date);
      const { data: txns } = await q.order('posted_at', { ascending: false }).limit(500);
      for (const t of txns ?? []) {
        const member = t.member as { member_number?: string; first_name?: string; last_name?: string } | null;
        const src: UnityFundSource = CONTRIBUTION_TYPES.includes(t.transaction_type)
          ? 'CONTRIBUTION'
          : t.transaction_type === 'welfare_deposit' ? 'WELFARE'
          : t.transaction_type === 'fine_payment' ? 'FINE'
          : t.transaction_type === 'registration_fee' ? 'REGISTRATION_FEE'
          : 'ANNUAL_FEE';
        if (!want(src, 'received')) continue;
        collectMember(t.member_id);
        rows.push({
          id: t.id,
          source_module: src,
          source_record_id: t.id,
          member_id: t.member_id,
          member_number: member?.member_number ?? null,
          member_name: member ? `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() : null,
          amount: num(t.amount),
          direction: 'inflow',
          payment_status: 'received',
          reference: t.transaction_ref,
          description: t.description,
          transaction_date: t.posted_at,
        });
      }

      // Loan interest receipts (ACTUAL).
      if (!filter.source || filter.source === 'LOAN_INTEREST') {
        let iq = supabase
          .from('loan_interest_receipts')
          .select('id, receipt_number, loan_id, loan_number, member_id, interest_amount, received_date, member:members(member_number, first_name, last_name)')
          .eq('status', 'received');
        if (filter.start_date) iq = iq.gte('received_date', filter.start_date);
        if (filter.end_date) iq = iq.lte('received_date', filter.end_date);
        const { data: interests } = await iq.order('received_date', { ascending: false }).limit(500);
        for (const r of interests ?? []) {
          const member = r.member as { member_number?: string; first_name?: string; last_name?: string } | null;
          collectMember(r.member_id);
          rows.push({
            id: r.id,
            source_module: 'LOAN_INTEREST',
            source_record_id: r.id,
            member_id: r.member_id,
            member_number: member?.member_number ?? null,
            member_name: member ? `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() : null,
            amount: num(r.interest_amount),
            direction: 'inflow',
            payment_status: 'received',
            reference: r.receipt_number,
            description: `Loan interest received — ${r.loan_number}`,
            transaction_date: r.received_date,
            loan_number: r.loan_number,
          });
        }
      }

      // Donations / grants / org loans (ACTUAL).
      await this.collectDomainActual(supabase, filter, rows, 'donations', 'DONATION', 'donation_number', 'received_amount', 'received_date', 'donor_name');
      await this.collectDomainActual(supabase, filter, rows, 'grants', 'GRANT', 'grant_number', 'received_amount', 'received_date', 'grantor_name');
      await this.collectDomainActual(supabase, filter, rows, 'organization_loans', 'ORGANIZATION_LOAN', 'org_loan_number', 'received_amount', 'received_date', 'lender_name');

      // Expenditures (ACTUAL outflow).
      if (!filter.source || filter.source === 'OTHER') {
        let eq = supabase
          .from('unity_fund_expenditures')
          .select('id, expenditure_number, amount, reason, category, reference, transaction_date')
          .eq('status', 'posted');
        if (filter.start_date) eq = eq.gte('transaction_date', filter.start_date);
        if (filter.end_date) eq = eq.lte('transaction_date', filter.end_date);
        const { data: exps } = await eq.order('transaction_date', { ascending: false }).limit(500);
        for (const e of exps ?? []) {
          rows.push({
            id: e.id,
            source_module: 'OTHER',
            source_record_id: e.id,
            member_id: null,
            member_number: null,
            member_name: null,
            amount: num(e.amount),
            direction: 'outflow',
            payment_status: 'received',
            reference: e.expenditure_number,
            description: e.reason,
            transaction_date: e.transaction_date,
          });
        }
      }
    }

    // PENDING receivables (from obligations view + domain tables).
    if (filter.payment_status !== 'received') {
      await this.collectPending(supabase, filter, rows);
    }

    return rows;
  }

  private async collectDomainActual(
    supabase: Awaited<ReturnType<typeof createServiceClient>>,
    filter: { source?: UnityFundSource; start_date?: string; end_date?: string },
    rows: UnityFundTransaction[],
    table: string,
    source: UnityFundSource,
    numberField: string,
    amountField: string,
    dateField: string,
    nameField: string,
  ): Promise<void> {
    if (filter.source && filter.source !== source) return;
    let q = supabase
      .from(table)
      .select(`id, ${numberField}, ${amountField}, ${dateField}, ${nameField}, purpose, reference`)
      .gt(amountField, 0)
      .order(dateField, { ascending: false })
      .limit(500);
    if (filter.start_date) q = q.gte(dateField, filter.start_date);
    if (filter.end_date) q = q.lte(dateField, filter.end_date);
    const { data } = await q;
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      const amount = num(r[amountField]);
      if (amount <= 0) continue;
      rows.push({
        id: String(r.id),
        source_module: source,
        source_record_id: String(r.id),
        member_id: null,
        member_number: null,
        member_name: String(r[nameField] ?? ''),
        amount,
        direction: 'inflow',
        payment_status: 'received',
        reference: String(r[numberField] ?? ''),
        description: r.purpose ? String(r.purpose) : `${SOURCE_LABELS[source]} received`,
        transaction_date: String(r[dateField]),
      });
    }
  }

  private async collectPending(
    supabase: Awaited<ReturnType<typeof createServiceClient>>,
    filter: { source?: UnityFundSource; start_date?: string; end_date?: string },
    rows: UnityFundTransaction[],
  ): Promise<void> {
    // Pending member obligations.
    if (!filter.source || ['CONTRIBUTION', 'WELFARE', 'FINE'].includes(filter.source)) {
      const { data: obligations } = await supabase
        .from('member_financial_obligations')
        .select('obligation_id, obligation_type, member_id, member_number, member_name, remaining, due_date, reference')
        .limit(500);
      for (const o of obligations ?? []) {
        if (num(o.remaining) <= 0) continue;
        const src: UnityFundSource | null =
          o.obligation_type === 'contribution' ? 'CONTRIBUTION'
          : o.obligation_type === 'welfare' ? 'WELFARE'
          : o.obligation_type === 'fine' ? 'FINE'
          : null;
        if (!src || (filter.source && filter.source !== src)) continue;
        rows.push({
          id: o.obligation_id,
          source_module: src,
          source_record_id: o.obligation_id,
          member_id: o.member_id,
          member_number: o.member_number,
          member_name: o.member_name,
          amount: num(o.remaining),
          direction: 'inflow',
          payment_status: 'pending',
          reference: o.reference,
          description: `Pending ${src.toLowerCase()} — ${o.member_number}`,
          transaction_date: o.due_date ?? new Date().toISOString(),
        });
      }
    }

    // Pending donations / grants.
    if (!filter.source || filter.source === 'DONATION') {
      const { data: donations } = await supabase.from('donations').select('id, donation_number, donor_name, pledged_amount, received_amount, purpose').in('status', ['pledged', 'partial']).limit(500);
      for (const d of donations ?? []) {
        const pending = Math.max(0, num(d.pledged_amount) - num(d.received_amount));
        if (pending <= 0) continue;
        rows.push({
          id: d.id, source_module: 'DONATION', source_record_id: d.id, member_id: null, member_number: null, member_name: d.donor_name,
          amount: pending, direction: 'inflow', payment_status: 'pending', reference: d.donation_number,
          description: d.purpose ? `Pending donation — ${d.purpose}` : 'Pending donation', transaction_date: new Date().toISOString(),
        });
      }
    }
    if (!filter.source || filter.source === 'GRANT') {
      const { data: grants } = await supabase.from('grants').select('id, grant_number, grantor_name, approved_amount, received_amount, purpose').in('status', ['approved', 'committed', 'partial']).limit(500);
      for (const g of grants ?? []) {
        const pending = Math.max(0, num(g.approved_amount) - num(g.received_amount));
        if (pending <= 0) continue;
        rows.push({
          id: g.id, source_module: 'GRANT', source_record_id: g.id, member_id: null, member_number: null, member_name: g.grantor_name,
          amount: pending, direction: 'inflow', payment_status: 'pending', reference: g.grant_number,
          description: g.purpose ? `Pending grant — ${g.purpose}` : 'Pending grant', transaction_date: new Date().toISOString(),
        });
      }
    }
  }

  // -----------------------------------------------------------------
  // EXPENDITURES
  // -----------------------------------------------------------------
  async getExpenditures(period?: PeriodFilter): Promise<ExpenditureSummary> {
    const supabase = await createServiceClient();
    const ranges = this.periodFilter(period);
    const { data } = await supabase
      .from('unity_fund_expenditures')
      .select('id, expenditure_number, amount, reason, category, reference, transaction_date')
      .eq('status', 'posted')
      .gte('transaction_date', ranges.start)
      .lte('transaction_date', ranges.end)
      .order('transaction_date', { ascending: false })
      .limit(200);

    const total = (data ?? []).reduce((s, e) => s + num(e.amount), 0);
    const byCat: Record<string, { total: number; count: number }> = {};
    for (const e of data ?? []) {
      const cat = e.category ?? 'Uncategorized';
      const c = byCat[cat] ?? { total: 0, count: 0 };
      c.total += num(e.amount);
      c.count += 1;
      byCat[cat] = c;
    }
    const recent: UnityFundTransaction[] = (data ?? []).slice(0, 20).map((e) => ({
      id: e.id, source_module: 'OTHER', source_record_id: e.id, member_id: null, member_number: null, member_name: null,
      amount: num(e.amount), direction: 'outflow', payment_status: 'received', reference: e.expenditure_number,
      description: e.reason, transaction_date: e.transaction_date,
    }));

    return {
      total_expenditures: total,
      by_category: Object.entries(byCat).map(([category, v]) => ({ category, ...v })),
      recent,
    };
  }

  /** Record an authorized expenditure (spec §16, §17, RULE 20-21). */
  async recordExpenditure(input: {
    amount: number;
    reason: string;
    category?: string;
    reference?: string;
    transaction_date?: string;
    related_project_id?: string;
    notes?: string;
    authorized_by: string;
    posted_by: string;
  }): Promise<{ expenditure: Record<string, unknown> | null }> {
    if (input.amount <= 0) throw new Error('Expenditure amount must be positive');
    if (!input.reason?.trim()) throw new Error('Expenditure reason is required');

    const requireAuth = await settingsService.getNumber('unity_fund.require_withdrawal_authorization', 1);
    if (requireAuth && !input.authorized_by) throw new Error('Authorization is required for Unity Fund expenditures');

    // Verify available cash — cannot spend pending money (RULE 1-2).
    const available = await this.getActualBalance();
    if (input.amount > available) {
      throw new Error(`Expenditure of ${input.amount} exceeds available Unity Fund cash of ${available}. Pending receivables are not spendable cash.`);
    }

    const supabase = await createServiceClient();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { count } = await supabase.from('unity_fund_expenditures').select('*', { count: 'exact', head: true });
    const expenditureNumber = `UF-EXP-${date}-${String((count ?? 0) + 1).padStart(4, '0')}`;

    const { data, error } = await supabase
      .from('unity_fund_expenditures')
      .insert({
        expenditure_number: expenditureNumber,
        amount: input.amount,
        reason: input.reason,
        category: input.category ?? null,
        reference: input.reference ?? null,
        transaction_date: input.transaction_date ?? new Date().toISOString(),
        status: 'posted',
        authorized_by: input.authorized_by,
        posted_by: input.posted_by,
        related_project_id: input.related_project_id ?? null,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error || !data) throw new Error(`Failed to record expenditure: ${error?.message}`);

    await this.audit('unity_fund.expenditure.create', data.id, input.posted_by, {
      expenditure_number: expenditureNumber, amount: input.amount, reason: input.reason, available_before: available,
    });

    return { expenditure: data };
  }

  // -----------------------------------------------------------------
  // ORGANIZATION LIABILITIES (spec §5, §28, §40, RULE 13-14)
  // -----------------------------------------------------------------
  async getLiabilities(): Promise<LiabilitySummary> {
    const supabase = await createServiceClient();
    const { data: loans } = await supabase
      .from('organization_loans')
      .select('id, org_loan_number, lender_name, received_amount, repaid_amount, outstanding_liability, status')
      .in('status', ['received', 'active', 'partial', 'completed', 'defaulted'])
      .order('received_date', { ascending: false });

    const list = (loans ?? []).map((l) => ({
      id: l.id,
      org_loan_number: l.org_loan_number,
      lender_name: l.lender_name,
      received_amount: num(l.received_amount),
      repaid_amount: num(l.repaid_amount),
      outstanding_liability: num(l.outstanding_liability) || Math.max(0, num(l.received_amount) - num(l.repaid_amount)),
      status: l.status,
    }));

    const totalReceived = list.reduce((s, l) => s + l.received_amount, 0);
    const totalRepaid = list.reduce((s, l) => s + l.repaid_amount, 0);
    const outstanding = list.reduce((s, l) => s + l.outstanding_liability, 0);

    return {
      total_organization_loans_received: totalReceived,
      total_organization_loans_repaid: totalRepaid,
      outstanding_liabilities: outstanding,
      loans: list,
    };
  }

  /** Record an organization loan received (cash + liability, NEVER income). */
  async recordOrganizationLoan(input: {
    lender_name: string;
    principal_amount: number;
    interest_rate?: number;
    reference?: string;
    purpose?: string;
    notes?: string;
    recorded_by: string;
  }): Promise<{ organization_loan: Record<string, unknown> | null }> {
    if (!input.principal_amount || input.principal_amount <= 0) throw new Error('Principal amount must be positive');
    if (!input.lender_name?.trim()) throw new Error('Lender name is required');

    const supabase = await createServiceClient();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { count } = await supabase.from('organization_loans').select('*', { count: 'exact', head: true });
    const orgLoanNumber = `ORG-LOAN-${date}-${String((count ?? 0) + 1).padStart(4, '0')}`;

    // Receiving the loan: cash in + liability created.
    const { data, error } = await supabase
      .from('organization_loans')
      .insert({
        org_loan_number: orgLoanNumber,
        lender_name: input.lender_name,
        principal_amount: input.principal_amount,
        interest_rate: input.interest_rate ?? 0,
        received_amount: input.principal_amount,
        repaid_amount: 0,
        outstanding_liability: input.principal_amount,
        status: 'received',
        received_date: new Date().toISOString(),
        reference: input.reference ?? null,
        purpose: input.purpose ?? null,
        notes: input.notes ?? null,
        recorded_by: input.recorded_by,
      })
      .select()
      .single();
    if (error || !data) throw new Error(`Failed to record organization loan: ${error?.message}`);

    await this.audit('unity_fund.organization_loan.receive', data.id, input.recorded_by, {
      org_loan_number: orgLoanNumber, amount: input.principal_amount, lender: input.lender_name,
      note: 'Cash received + liability created. NOT income.',
    });

    return { organization_loan: data };
  }

  /** Record a donation received (pledge becomes cash). */
  async recordDonation(input: {
    donor_name: string;
    donor_contact?: string;
    purpose?: string;
    pledged_amount?: number;
    received_amount: number;
    reference?: string;
    notes?: string;
    recorded_by: string;
  }): Promise<{ donation: Record<string, unknown> | null }> {
    if (input.received_amount <= 0) throw new Error('Received amount must be positive');
    if (!input.donor_name?.trim()) throw new Error('Donor name is required');
    const pledged = input.pledged_amount ?? input.received_amount;

    const supabase = await createServiceClient();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { count } = await supabase.from('donations').select('*', { count: 'exact', head: true });
    const donationNumber = `DON-${date}-${String((count ?? 0) + 1).padStart(4, '0')}`;
    const status = input.received_amount >= pledged ? 'received' : 'partial';

    const { data, error } = await supabase
      .from('donations')
      .insert({
        donation_number: donationNumber,
        donor_name: input.donor_name,
        donor_contact: input.donor_contact ?? null,
        purpose: input.purpose ?? null,
        pledged_amount: pledged,
        received_amount: input.received_amount,
        status,
        received_date: new Date().toISOString(),
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        recorded_by: input.recorded_by,
      })
      .select()
      .single();
    if (error || !data) throw new Error(`Failed to record donation: ${error?.message}`);

    await this.audit('unity_fund.donation.receive', data.id, input.recorded_by, {
      donation_number: donationNumber, amount: input.received_amount, donor: input.donor_name,
    });
    return { donation: data };
  }

  /** Record a grant received (approval becomes cash). */
  async recordGrant(input: {
    grantor_name: string;
    purpose?: string;
    approved_amount?: number;
    received_amount: number;
    reference?: string;
    notes?: string;
    recorded_by: string;
  }): Promise<{ grant: Record<string, unknown> | null }> {
    if (input.received_amount <= 0) throw new Error('Received amount must be positive');
    if (!input.grantor_name?.trim()) throw new Error('Grantor name is required');
    const approved = input.approved_amount ?? input.received_amount;

    const supabase = await createServiceClient();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { count } = await supabase.from('grants').select('*', { count: 'exact', head: true });
    const grantNumber = `GRANT-${date}-${String((count ?? 0) + 1).padStart(4, '0')}`;
    const status = input.received_amount >= approved ? 'received' : 'partial';

    const { data, error } = await supabase
      .from('grants')
      .insert({
        grant_number: grantNumber,
        grantor_name: input.grantor_name,
        purpose: input.purpose ?? null,
        approved_amount: approved,
        received_amount: input.received_amount,
        status,
        received_date: new Date().toISOString(),
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        recorded_by: input.recorded_by,
      })
      .select()
      .single();
    if (error || !data) throw new Error(`Failed to record grant: ${error?.message}`);

    await this.audit('unity_fund.grant.receive', data.id, input.recorded_by, {
      grant_number: grantNumber, amount: input.received_amount, grantor: input.grantor_name,
    });
    return { grant: data };
  }

  // -----------------------------------------------------------------
  // RECONCILIATION (spec §18, §29, §43, RULE 29)
  // Compares the engine's ledger balance against independent source
  // recomputation and against the DB view. Detects discrepancies.
  // -----------------------------------------------------------------
  async getReconciliation(): Promise<ReconciliationResult> {
    try {
      const supabase = await createServiceClient();
      // 1. Engine ledger balance (authoritative).
      const ledgerBalance = await this.getActualBalance();

      // 2. Independent DB view sum (cross-check from unity_fund_actual_receipts).
      const { data: viewReceipts } = await supabase
        .from('unity_fund_actual_receipts')
        .select('amount');
      const sourceBalance = (viewReceipts ?? []).reduce((s, r) => s + num((r as { amount: number }).amount), 0)
        - await this.getActualExpendituresTotal();

      // 3. Sum of source breakdown (should equal ledger).
      const sources = await this.getSourceBreakdown();
      const sourcesSum = sources.reduce((s, b) => s + b.actual, 0);

      // 4. Dashboard path (sum of actual receipts - expenditures).
      const dashboardBalance = (await this.getActualReceipts()) - (await this.getActualExpendituresTotal());

      const checks: ReconciliationCheck[] = [
        { label: 'Engine ledger vs DB view', expected: ledgerBalance, actual: sourceBalance, difference: ledgerBalance - sourceBalance, passed: Math.abs(ledgerBalance - sourceBalance) < 0.5 },
        { label: 'Engine ledger vs source breakdown sum', expected: ledgerBalance, actual: sourcesSum, difference: ledgerBalance - sourcesSum, passed: Math.abs(ledgerBalance - sourcesSum) < 0.5 },
        { label: 'Engine ledger vs dashboard path', expected: ledgerBalance, actual: dashboardBalance, difference: ledgerBalance - dashboardBalance, passed: Math.abs(ledgerBalance - dashboardBalance) < 0.5 },
      ];

      const discrepancies = checks.filter((c) => !c.passed).map((c) => ({ label: c.label, difference: c.difference }));
      const overallDiff = Math.max(Math.abs(ledgerBalance - sourceBalance), Math.abs(ledgerBalance - sourcesSum), Math.abs(ledgerBalance - dashboardBalance));

      const result: ReconciliationResult = {
        status: discrepancies.length === 0 ? 'consistent' : 'discrepancy',
        ledger_balance: ledgerBalance,
        source_balance: sourceBalance,
        difference: overallDiff,
        checks,
        discrepancies,
        checks_performed: checks.length,
        generated_at: new Date().toISOString(),
      };

      // Persist the run for audit trail.
      await this.persistReconciliationRun(result);

      return result;
    } catch (err) {
      const result: ReconciliationResult = {
        status: 'error',
        ledger_balance: 0,
        source_balance: 0,
        difference: 0,
        checks: [],
        discrepancies: [{ label: 'reconciliation error', difference: 0 }],
        checks_performed: 0,
        generated_at: new Date().toISOString(),
      };
      console.error('[unity-fund-engine] reconciliation failed:', err instanceof Error ? err.message : err);
      return result;
    }
  }

  private async persistReconciliationRun(result: ReconciliationResult): Promise<void> {
    try {
      const supabase = await createServiceClient();
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const { count } = await supabase.from('unity_fund_reconciliation_runs').select('*', { count: 'exact', head: true });
      const runNumber = `UF-RECON-${date}-${String((count ?? 0) + 1).padStart(4, '0')}`;
      await supabase.from('unity_fund_reconciliation_runs').insert({
        run_number: runNumber,
        status: result.status,
        ledger_balance: result.ledger_balance,
        source_balance: result.source_balance,
        difference: result.difference,
        discrepancies: result.discrepancies,
        checks_performed: result.checks_performed,
      });
    } catch (e) {
      console.warn('[unity-fund-engine] reconciliation run persist failed:', e instanceof Error ? e.message : e);
    }
  }

  // -----------------------------------------------------------------
  // PERIOD SUMMARY (spec §39)
  // -----------------------------------------------------------------
  async getPeriodSummary(period: { start: Date; end: Date; label?: string }): Promise<PeriodSummary> {
    const opening = await this.getActualBalance({ end: new Date(period.start.getTime() - 1) });
    const [receipts, expenditures, pending, liabilities, sources] = await Promise.all([
      this.getActualReceipts(period),
      this.getActualExpendituresTotal(period),
      this.getPendingReceivables(),
      this.getLiabilities(),
      this.getSourceBreakdown(period),
    ]);
    const closing = opening + receipts - expenditures;

    return {
      period: {
        start: period.start.toISOString(),
        end: period.end.toISOString(),
        label: period.label ?? `${period.start.toISOString().slice(0, 10)} → ${period.end.toISOString().slice(0, 10)}`,
      },
      opening_actual_balance: opening,
      actual_receipts: receipts,
      actual_expenditures: expenditures,
      closing_actual_balance: closing,
      pending_receivables: pending,
      outstanding_liabilities: liabilities.outstanding_liabilities,
      receipts_by_source: sources.map((s) => ({ source: s.source, amount: s.actual, count: s.transaction_count })),
    };
  }

  // -----------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------
  private periodFilter(period?: PeriodFilter): { start: string; end: string } {
    // Default to a wide window so unset periods capture all history.
    const start = period?.start ?? new Date('2000-01-01');
    const end = period?.end ?? new Date('2100-01-01');
    return { start: start.toISOString(), end: end.toISOString() };
  }

  private async audit(action: string, recordId: string, userId: string, after: Record<string, unknown>): Promise<void> {
    try {
      const supabase = await createServiceClient();
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        action,
        record_id: recordId,
        user_id: userId,
        after_value: after,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[unity-fund-engine] audit insert failed:', e instanceof Error ? e.message : e);
    }
  }
}

export const unityFundEngine = new UnityFundEngine();
