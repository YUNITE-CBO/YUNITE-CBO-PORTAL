/**
 * REPORT DATA SERVICE
 *
 * Aggregates live business data for every generatable bank-like document.
 * Reads exclusively from the authoritative transaction ledger + domain
 * tables via the existing services/Supabase. Produces plain, render-agnostic
 * data shapes consumed by the HTML/PDF/CSV renderer.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { transactionEngine } from '../transaction.engine';
import { settingsService } from '../settings.service';
import { unityFundEngine } from '../unity-fund.engine';
import { ORG_IDENTITY } from './brand';

export type ReportType =
  | 'financial_summary'
  | 'member_list'
  | 'member_profile'
  | 'loan_report'
  | 'transaction_report'
  | 'contribution_report'
  | 'fine_report'
  | 'member_statement'
  | 'welfare_report'
  | 'organization_summary'
  | 'unity_fund_report';

export const REPORT_TYPES: ReportType[] = [
  'financial_summary',
  'member_list',
  'member_profile',
  'loan_report',
  'transaction_report',
  'contribution_report',
  'fine_report',
  'member_statement',
  'welfare_report',
  'organization_summary',
  'unity_fund_report',
];

export const REPORT_META: Record<
  ReportType,
  { title: string; description: string; supportsMemberScope: boolean }
> = {
  financial_summary: {
    title: 'Financial Summary Report',
    description: 'Aggregate balances across savings, contributions, welfare, fines, and loans.',
    supportsMemberScope: false,
  },
  member_list: {
    title: 'Member Register',
    description: 'Full membership roll with status, contacts, and registration dates.',
    supportsMemberScope: false,
  },
  member_profile: {
    title: 'Member Profile',
    description: 'Full personal profile (personal, contact, employment, next of kin, emergency contact) — one member or all members.',
    supportsMemberScope: true,
  },
  loan_report: {
    title: 'Loan Portfolio Report',
    description: 'Loan disbursements, repayments, outstanding balances, and status.',
    supportsMemberScope: false,
  },
  transaction_report: {
    title: 'Transaction Ledger Report',
    description: 'All posted ledger entries with references and running balances.',
    supportsMemberScope: true,
  },
  contribution_report: {
    title: 'Contributions Report',
    description: 'Monthly, special, and development contributions by member.',
    supportsMemberScope: false,
  },
  fine_report: {
    title: 'Fines Report',
    description: 'Fines issued, collected, waived, and outstanding.',
    supportsMemberScope: false,
  },
  member_statement: {
    title: 'Member Statement of Account',
    description: 'Per-member statement of account with opening/closing balances.',
    supportsMemberScope: true,
  },
  welfare_report: {
    title: 'Welfare Fund Report',
    description: 'Welfare contributions and disbursements.',
    supportsMemberScope: false,
  },
  organization_summary: {
    title: 'Organization Summary',
    description: 'Snapshot of the CBO: membership, financial position, and obligations.',
    supportsMemberScope: false,
  },
  unity_fund_report: {
    title: 'Unity Fund Report',
    description: 'Organization-level reserve: actual vs pending, sources, expenditures, liabilities, and reconciliation.',
    supportsMemberScope: false,
  },
};

export interface ReportPeriod {
  start: Date;
  end: Date;
  label: string;
}

export interface ReportContext {
  type: ReportType;
  period: ReportPeriod;
  memberId?: string;
  generatedBy?: { id: string; name: string; role: string };
}

export interface FinancialSummaryData {
  savings: { deposits: number; withdrawals: number; balance: number };
  contributions: { deposits: number; withdrawals: number; balance: number };
  welfare: { deposits: number; disbursements: number; balance: number };
  fines: { posted: number; paid: number; balance: number };
  loans: { disbursed: number; repaid: number; outstanding: number };
  totals: { inflow: number; outflow: number; net: number };
}

export interface MemberRow {
  member_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  gender: string | null;
  status: string;
  occupation: string | null;
  registration_date: string;
  physical_address: string | null;
}

export interface LoanRow {
  loan_number: string;
  member_name: string;
  member_number: string;
  loan_type: string;
  principal: number;
  interest_rate: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  monthly_repayment: number;
  status: string;
  disbursement_date: string | null;
  created_at: string;
}

export interface TransactionRow {
  transaction_ref: string;
  posted_at: string;
  member_name: string;
  member_number: string;
  transaction_type: string;
  description: string | null;
  reference_number: string | null;
  amount: number;
  balance_after: number;
  reversed: boolean;
}

export interface ContributionRow {
  member_name: string;
  member_number: string;
  transaction_ref: string;
  posted_at: string;
  type: string;
  amount: number;
  reference: string | null;
}

export interface FineRow {
  fine_number: string;
  member_name: string;
  member_number: string;
  fine_type: string;
  amount: number;
  amount_paid: number;
  balance: number;
  status: string;
  reason: string;
  issued_date: string;
}

export interface MemberStatementData {
  member: {
    member_number: string;
    name: string;
    email: string | null;
    phone: string;
    status: string;
  };
  openingBalance: number;
  closingBalance: number;
  totalCredits: number;
  totalDebits: number;
  rows: Array<{
    posted_at: string;
    transaction_ref: string;
    description: string;
    reference_number: string | null;
    debit: number;
    credit: number;
    balance: number;
  }>;
  accountBreakdown: Array<{ account_type: string; balance: number }>;
}

export interface WelfareData {
  totalDeposits: number;
  totalDisbursements: number;
  balance: number;
  monthlyAmount: number;
  rows: ContributionRow[];
}

/**
 * Full member profile (all personal information captured at registration):
 * personal, contact, employment, next of kin, emergency contact, preferences,
 * and membership details. Used by the `member_profile` document — for a single
 * member (member_id scoped) or for every member (bulk register of profiles).
 */
export interface MemberProfileData {
  member_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  alt_phone: string | null;
  alt_email: string | null;
  id_number: string | null;
  kra_pin: string | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  nationality: string | null;
  physical_address: string | null;
  postal_address: string | null;
  occupation: string | null;
  employer: string | null;
  employer_address: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  preferred_language: string | null;
  preferred_contact_method: string | null;
  sms_notifications: boolean | null;
  email_notifications: boolean | null;
  membership_category: string | null;
  member_group: string | null;
  status: string;
  workflow_stage: string | null;
  registration_date: string;
  created_at: string;
}

export interface OrgSummaryData {
  memberCounts: { total: number; active: number; pending: number; suspended: number };
  financial: FinancialSummaryData;
  pendingLoans: number;
  pendingFines: number;
  currency: string;
}

/** Unity Fund report data (spec §39). Actual vs pending, sources, expenditures, liabilities, reconciliation. */
export interface UnityFundReportData {
  position: {
    actual_balance: number;
    pending_receivables: number;
    total_receipts: number;
    total_expenditures: number;
    organization_liabilities: number;
    net_financial_position: number;
    currency: string;
  };
  sources: Array<{ source: string; label: string; actual: number; pending: number; transaction_count: number }>;
  expenditures: {
    total_expenditures: number;
    by_category: Array<{ category: string; total: number; count: number }>;
  };
  liabilities: {
    total_organization_loans_received: number;
    total_organization_loans_repaid: number;
    outstanding_liabilities: number;
    loans: Array<{ org_loan_number: string; lender_name: string; received_amount: number; repaid_amount: number; outstanding_liability: number; status: string }>;
  };
  reconciliation: {
    status: string;
    ledger_balance: number;
    source_balance: number;
    difference: number;
    checks: Array<{ label: string; expected: number; actual: number; difference: number; passed: boolean }>;
  };
  generated_at: string;
}

/**
 * Transaction types that reduce a member's NET financial position on a
 * statement of account. These either draw down an asset account (savings /
 * contributions / welfare withdrawals & disbursements, plus registration and
 * annual fees that are charged against savings) or increase a liability account
 * (a posted fine, a disbursed loan — which in this system's model are NOT
 * offset by a tracked cash asset). Every other non-reversed transaction is a
 * net credit (grows an asset or reduces a liability).
 *
 * This classification mirrors the sign logic in
 * TransactionEngine.isDebitTransaction, extended for the statement's net-worth
 * view where liability-increasing postings are debits.
 */
const NET_DEBIT_TYPES = new Set<string>([
  'savings_withdrawal', 'savings_disbursement',
  'contribution_withdrawal', 'contribution_disbursement',
  'welfare_withdrawal', 'welfare_disbursement',
  'registration_fee', 'annual_fee',
  'fine_posting', 'loan_disbursement',
]);

// Transaction types excluded from a member's NET POSITION. Business rule:
// contributions and welfare are member contributions INTO the Unity Fund
// (organization money), not the member's own net worth. They are tracked in
// their own account balances but must NOT inflate the member's net position.
const NET_POSITION_EXCLUDED_TYPES = new Set<string>([
  'contribution_monthly', 'contribution_special', 'contribution_development',
  'contribution_withdrawal', 'contribution_disbursement',
  'welfare_deposit', 'welfare_withdrawal', 'welfare_disbursement',
]);

export class ReportDataService {
  async getFinancialSummary(period?: ReportPeriod): Promise<FinancialSummaryData> {
    const supabase = await createServiceClient();

    const [savings, contributions, welfare, fines, loans] = await Promise.all([
      this.accountTotals('savings', ['savings_deposit', 'savings_monthly', 'savings_special', 'savings_development'], ['savings_withdrawal', 'savings_disbursement'], period),
      this.accountTotals('contributions', ['contribution_monthly', 'contribution_special', 'contribution_development'], ['contribution_withdrawal', 'contribution_disbursement'], period),
      this.accountTotals('welfare', ['welfare_deposit', 'welfare_monthly', 'welfare_special'], ['welfare_withdrawal', 'welfare_disbursement'], period),
      this.accountTotals('fines', ['fine_posting'], ['fine_payment'], period),
      this.loanTotals(period),
    ]);

    const inflow = savings.deposits + contributions.deposits + welfare.deposits + fines.posted + loans.disbursed * -1 + loans.repaid;
    const outflow = savings.withdrawals + contributions.withdrawals + welfare.disbursements + fines.paid + loans.disbursed;
    const net = inflow - outflow;

    return {
      savings: { deposits: savings.deposits, withdrawals: savings.withdrawals, balance: savings.balance },
      contributions: { deposits: contributions.deposits, withdrawals: contributions.withdrawals, balance: contributions.balance },
      welfare: { deposits: welfare.deposits, disbursements: welfare.disbursements, balance: welfare.balance },
      fines: { posted: fines.posted, paid: fines.paid, balance: fines.balance },
      loans,
      totals: { inflow, outflow, net },
    };
  }

  private async accountTotals(
    accountType: string,
    creditTypes: string[],
    debitTypes: string[],
    period?: ReportPeriod,
  ) {
    const supabase = await createServiceClient();
    let q = supabase
      .from('transactions')
      .select('transaction_type, amount')
      .in('transaction_type', [...creditTypes, ...debitTypes])
      .eq('reversed', false);
    if (period) q = q.gte('posted_at', period.start.toISOString()).lte('posted_at', period.end.toISOString());
    const { data } = await q;

    let credits = 0;
    let debits = 0;
    for (const t of data || []) {
      if (creditTypes.includes(t.transaction_type)) credits += Number(t.amount);
      else if (debitTypes.includes(t.transaction_type)) debits += Number(t.amount);
    }
    return {
      deposits: credits,
      withdrawals: debits,
      disbursements: debits,
      posted: credits,
      paid: debits,
      balance: credits - debits,
    };
  }

  private async loanTotals(period?: ReportPeriod) {
    const supabase = await createServiceClient();
    let dq = supabase.from('transactions').select('amount').eq('transaction_type', 'loan_disbursement').eq('reversed', false);
    let rq = supabase.from('transactions').select('amount').eq('transaction_type', 'loan_repayment').eq('reversed', false);
    if (period) {
      dq = dq.gte('posted_at', period.start.toISOString()).lte('posted_at', period.end.toISOString());
      rq = rq.gte('posted_at', period.start.toISOString()).lte('posted_at', period.end.toISOString());
    }
    const [d, r] = await Promise.all([dq, rq]);
    const disbursed = (d.data || []).reduce((s, t) => s + Number(t.amount), 0);
    const repaid = (r.data || []).reduce((s, t) => s + Number(t.amount), 0);
    return { disbursed, repaid, outstanding: disbursed - repaid };
  }

  async getMemberList(): Promise<{ members: MemberRow[]; total: number }> {
    const supabase = await createServiceClient();
    const { data, count } = await supabase
      .from('members')
      .select(
        'member_number, first_name, last_name, email, phone, gender, status, occupation, registration_date, physical_address',
        { count: 'exact' },
      )
      .order('member_number', { ascending: true });
    return { members: (data as MemberRow[]) || [], total: count || 0 };
  }

  async getLoanReport(): Promise<{ loans: LoanRow[]; total: number }> {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('loans')
      .select(
        'loan_number, loan_type, principal_amount, interest_rate, total_amount, amount_paid, amount_due, monthly_repayment, status, disbursement_date, created_at, member:members(first_name, last_name, member_number)',
      )
      .order('created_at', { ascending: false });

    const loans: LoanRow[] = (data || []).map((l: any) => ({
      loan_number: l.loan_number,
      member_name: l.member ? `${l.member.first_name} ${l.member.last_name}` : '—',
      member_number: l.member?.member_number || '—',
      loan_type: l.loan_type,
      principal: Number(l.principal_amount),
      interest_rate: Number(l.interest_rate),
      total_amount: Number(l.total_amount),
      amount_paid: Number(l.amount_paid || 0),
      amount_due: Number(l.amount_due),
      monthly_repayment: Number(l.monthly_repayment),
      status: l.status,
      disbursement_date: l.disbursement_date,
      created_at: l.created_at,
    }));
    return { loans, total: loans.length };
  }

  async getTransactionReport(period?: ReportPeriod, memberId?: string): Promise<{ transactions: TransactionRow[]; total: number }> {
    const supabase = await createServiceClient();
    let q = supabase
      .from('transactions')
      .select(
        'transaction_ref, posted_at, amount, balance_after, transaction_type, description, reference_number, reversed, member:members(first_name, last_name, member_number)',
      )
      .order('posted_at', { ascending: true });
    if (memberId) q = q.eq('member_id', memberId);
    if (period) q = q.gte('posted_at', period.start.toISOString()).lte('posted_at', period.end.toISOString());
    const { data } = await q;

    const transactions: TransactionRow[] = (data || []).map((t: any) => ({
      transaction_ref: t.transaction_ref,
      posted_at: t.posted_at,
      member_name: t.member ? `${t.member.first_name} ${t.member.last_name}` : '—',
      member_number: t.member?.member_number || '—',
      transaction_type: t.transaction_type,
      description: t.description,
      reference_number: t.reference_number,
      amount: Number(t.amount),
      balance_after: Number(t.balance_after),
      reversed: t.reversed,
    }));
    return { transactions, total: transactions.length };
  }

  async getContributionReport(): Promise<{ rows: ContributionRow[]; total: number; totalAmount: number }> {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('transactions')
      .select(
        'transaction_ref, posted_at, amount, transaction_type, reference_number, member:members(first_name, last_name, member_number)',
      )
      .in('transaction_type', ['contribution_monthly', 'contribution_special', 'contribution_development'])
      .eq('reversed', false)
      .order('posted_at', { ascending: false });

    const rows: ContributionRow[] = (data || []).map((t: any) => ({
      member_name: t.member ? `${t.member.first_name} ${t.member.last_name}` : '—',
      member_number: t.member?.member_number || '—',
      transaction_ref: t.transaction_ref,
      posted_at: t.posted_at,
      type: t.transaction_type,
      amount: Number(t.amount),
      reference: t.reference_number,
    }));
    const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
    return { rows, total: rows.length, totalAmount };
  }

  async getFineReport(): Promise<{ fines: FineRow[]; total: number }> {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('fines')
      .select('fine_number, fine_type, amount, amount_paid, status, reason, issued_date, member:members(first_name, last_name, member_number)')
      .order('issued_date', { ascending: false });

    const fines: FineRow[] = (data || []).map((f: any) => ({
      fine_number: f.fine_number,
      member_name: f.member ? `${f.member.first_name} ${f.member.last_name}` : '—',
      member_number: f.member?.member_number || '—',
      fine_type: f.fine_type,
      amount: Number(f.amount),
      amount_paid: Number(f.amount_paid || 0),
      balance: Number(f.amount) - Number(f.amount_paid || 0),
      status: f.status,
      reason: f.reason,
      issued_date: f.issued_date,
    }));
    return { fines, total: fines.length };
  }

  async getMemberStatement(memberId: string, period: ReportPeriod): Promise<MemberStatementData> {
    const supabase = await createServiceClient();
    const { data: member } = await supabase
      .from('members')
      .select('member_number, first_name, last_name, email, phone, status')
      .eq('id', memberId)
      .single();
    if (!member) throw new Error('Member not found');

    // Opening balance = balance of all non-reversed txns before period start
    const { data: prior } = await supabase
      .from('transactions')
      .select('transaction_type, amount')
      .eq('member_id', memberId)
      .eq('reversed', false)
      .lt('posted_at', period.start.toISOString());

    const priorByType: Record<string, number> = {};
    for (const t of prior || []) {
      priorByType[t.transaction_type] = (priorByType[t.transaction_type] || 0) + Number(t.amount);
    }
    const opening = this.deriveMemberBalance(priorByType);

    const { data: txns } = await supabase
      .from('transactions')
      .select('transaction_ref, posted_at, amount, balance_after, transaction_type, description, reference_number')
      .eq('member_id', memberId)
      .eq('reversed', false)
      .gte('posted_at', period.start.toISOString())
      .lte('posted_at', period.end.toISOString())
      .order('posted_at', { ascending: true });

    let running = opening;
    let totalCredits = 0;
    let totalDebits = 0;
    // Only net-worth-affecting transactions appear in the running net-position
    // ledger. Contributions and welfare are Unity Fund contributions, not the
    // member's net worth, so they are excluded from the running balance and
    // totals (their account balances are shown separately in accountBreakdown).
    const rows = (txns || [])
      .filter((t: any) => !NET_POSITION_EXCLUDED_TYPES.has(t.transaction_type))
      .map((t: any) => {
      const amt = Number(t.amount);
      // A transaction is a NET DEBIT (reduces the member's net worth) when it
      // either draws down an asset account (savings withdrawals &
      // disbursements, registration/annual fees charged against savings) OR
      // increases a liability account (a posted fine, a disbursed loan).
      // Conversely it is a NET CREDIT when it grows an asset (deposits) or
      // reduces a liability (fine payment, loan repayment). This mirrors the
      // sign logic in TransactionEngine.isDebitTransaction while accounting for
      // the fact that, in this system's model, loan_disbursement/fine_posting
      // only add to a LIABILITY account (they are not offset by a cash asset)
      // and so reduce the member's net position.
      const isNetDebit = NET_DEBIT_TYPES.has(t.transaction_type);
      if (isNetDebit) {
        totalDebits += amt;
        running -= amt;
      } else {
        totalCredits += amt;
        running += amt;
      }
      return {
        posted_at: t.posted_at,
        transaction_ref: t.transaction_ref,
        description: t.description || t.transaction_type,
        reference_number: t.reference_number,
        debit: isNetDebit ? amt : 0,
        credit: isNetDebit ? 0 : amt,
        balance: running,
      };
    });

    const closing = opening + totalCredits - totalDebits;

    // Account breakdown — current balances per account type. MUST come from the
    // authoritative TransactionEngine.calculateAllBalances (the single source of
    // truth): shares are DERIVED (floor(savings / share_value)), not a
    // transaction-ledger account, and the outstanding loan balance is the
    // SUM(loans.amount_due) over active loans — NOT the transaction-ledger sum
    // (loan_repayment is not subtracted there). Reading these from the engine
    // guarantees the document matches the balances API + reconciliation engine.
    const engineBalances = await transactionEngine.calculateAllBalances(memberId);
    const accountBreakdown = [
      { account_type: 'savings', balance: engineBalances.savings },
      { account_type: 'shares', balance: engineBalances.shares },
      { account_type: 'contributions', balance: engineBalances.contributions },
      { account_type: 'welfare', balance: engineBalances.welfare },
      { account_type: 'fines', balance: engineBalances.fines },
      { account_type: 'loans', balance: engineBalances.loans },
    ];

    return {
      member: {
        member_number: member.member_number,
        name: `${member.first_name} ${member.last_name}`,
        email: member.email,
        phone: member.phone,
        status: member.status,
      },
      openingBalance: opening,
      closingBalance: closing,
      totalCredits,
      totalDebits,
      rows,
      accountBreakdown,
    };
  }

  private deriveMemberBalance(priorByType: Record<string, number>): number {
    // Opening (net) position = assets − liabilities before the period.
    // Net-debit transaction types reduce net worth (see getMemberStatement).
    // Contributions and welfare are excluded — they are Unity Fund
    // contributions, not the member's net worth (see NET_POSITION_EXCLUDED_TYPES).
    let bal = 0;
    for (const [k, v] of Object.entries(priorByType)) {
      if (NET_POSITION_EXCLUDED_TYPES.has(k)) continue;
      bal += NET_DEBIT_TYPES.has(k) ? -v : v;
    }
    return bal;
  }

  async getWelfareReport(): Promise<WelfareData> {
    const supabase = await createServiceClient();
    const [deposits, disbursements] = await Promise.all([
      supabase.from('transactions').select('amount').in('transaction_type', ['welfare_deposit', 'welfare_monthly', 'welfare_special']).eq('reversed', false),
      supabase.from('transactions').select('amount').in('transaction_type', ['welfare_withdrawal', 'welfare_disbursement']).eq('reversed', false),
    ]);
    const totalDeposits = (deposits.data || []).reduce((s, t) => s + Number(t.amount), 0);
    const totalDisbursements = (disbursements.data || []).reduce((s, t) => s + Number(t.amount), 0);

    const { data } = await supabase
      .from('transactions')
      .select('transaction_ref, posted_at, amount, transaction_type, reference_number, member:members(first_name, last_name, member_number)')
      .in('transaction_type', ['welfare_deposit', 'welfare_monthly', 'welfare_special', 'welfare_withdrawal', 'welfare_disbursement'])
      .eq('reversed', false)
      .order('posted_at', { ascending: false });

    const rows: ContributionRow[] = (data || []).map((t: any) => ({
      member_name: t.member ? `${t.member.first_name} ${t.member.last_name}` : '—',
      member_number: t.member?.member_number || '—',
      transaction_ref: t.transaction_ref,
      posted_at: t.posted_at,
      type: t.transaction_type,
      amount: Number(t.amount),
      reference: t.reference_number,
    }));

    return {
      totalDeposits,
      totalDisbursements,
      balance: totalDeposits - totalDisbursements,
      monthlyAmount: await settingsService.getNumber('welfare.monthly_amount', 500),
      rows,
    };
  }

  async getOrganizationSummary(): Promise<OrgSummaryData> {
    const supabase = await createServiceClient();
    const [total, active, pending, suspended] = await Promise.all([
      supabase.from('members').select('*', { count: 'exact', head: true }),
      supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'suspended'),
    ]);
    const [pendingLoans, pendingFines, financial] = await Promise.all([
      supabase.from('loans').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('fines').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      this.getFinancialSummary(),
    ]);
    return {
      memberCounts: {
        total: total.count || 0,
        active: active.count || 0,
        pending: pending.count || 0,
        suspended: suspended.count || 0,
      },
      financial,
      pendingLoans: pendingLoans.count || 0,
      pendingFines: pendingFines.count || 0,
      currency: ORG_IDENTITY.currency,
    };
  }

  async getMemberById(memberId: string) {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('members')
      .select('id, member_number, first_name, last_name, email, phone, status')
      .eq('id', memberId)
      .maybeSingle();
    return data;
  }

  /**
   * Full member profiles for the `member_profile` document. With `memberId`
   * returns that one member (throws when missing); without it returns every
   * member on record (bulk profile register). `select('*')` is deliberate:
   * optional migration-011 columns may be absent on a not-yet-migrated DB and
   * a fixed column list would make PostgREST error out — '*' only returns
   * columns that exist, and missing fields simply read back as null.
   */
  async getMemberProfiles(memberId?: string): Promise<{ profiles: MemberProfileData[]; total: number }> {
    const supabase = await createServiceClient();
    let q = supabase.from('members').select('*').order('member_number', { ascending: true });
    if (memberId) q = q.eq('id', memberId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (memberId && (!data || data.length === 0)) throw new Error('Member not found');

    const profiles: MemberProfileData[] = (data || []).map((m: any) => ({
      member_number: m.member_number,
      first_name: m.first_name,
      last_name: m.last_name,
      email: m.email ?? null,
      phone: m.phone,
      alt_phone: m.alt_phone ?? null,
      alt_email: m.alt_email ?? null,
      id_number: m.id_number ?? null,
      kra_pin: m.kra_pin ?? null,
      date_of_birth: m.date_of_birth ?? null,
      gender: m.gender ?? null,
      marital_status: m.marital_status ?? null,
      nationality: m.nationality ?? null,
      physical_address: m.physical_address ?? null,
      postal_address: m.postal_address ?? null,
      occupation: m.occupation ?? null,
      employer: m.employer ?? null,
      employer_address: m.employer_address ?? null,
      next_of_kin_name: m.next_of_kin_name ?? null,
      next_of_kin_phone: m.next_of_kin_phone ?? null,
      next_of_kin_relationship: m.next_of_kin_relationship ?? null,
      emergency_contact_name: m.emergency_contact_name ?? null,
      emergency_contact_phone: m.emergency_contact_phone ?? null,
      emergency_contact_relationship: m.emergency_contact_relationship ?? null,
      preferred_language: m.preferred_language ?? null,
      preferred_contact_method: m.preferred_contact_method ?? null,
      sms_notifications: m.sms_notifications ?? null,
      email_notifications: m.email_notifications ?? null,
      membership_category: m.membership_category ?? null,
      member_group: m.member_group ?? null,
      status: m.status,
      workflow_stage: m.workflow_stage ?? null,
      registration_date: m.registration_date,
      created_at: m.created_at,
    }));
    return { profiles, total: profiles.length };
  }

  /**
   * Unity Fund report data. Delegates to the UnityFundEngine — the single
   * source of truth — so the report's figures always match the dashboard
   * and the AI investigation payload (spec §39, §43).
   */
  async getUnityFundReport(): Promise<UnityFundReportData> {
    const [position, expenditures, liabilities, reconciliation] = await Promise.all([
      unityFundEngine.getFinancialPosition(),
      unityFundEngine.getExpenditures(),
      unityFundEngine.getLiabilities(),
      unityFundEngine.getReconciliation(),
    ]);
    return {
      position: {
        actual_balance: position.actual_balance,
        pending_receivables: position.pending_receivables,
        total_receipts: position.total_receipts,
        total_expenditures: position.total_expenditures,
        organization_liabilities: position.organization_liabilities,
        net_financial_position: position.net_financial_position,
        currency: position.currency,
      },
      sources: position.sources,
      expenditures: {
        total_expenditures: expenditures.total_expenditures,
        by_category: expenditures.by_category,
      },
      liabilities: {
        total_organization_loans_received: liabilities.total_organization_loans_received,
        total_organization_loans_repaid: liabilities.total_organization_loans_repaid,
        outstanding_liabilities: liabilities.outstanding_liabilities,
        loans: liabilities.loans,
      },
      reconciliation: {
        status: reconciliation.status,
        ledger_balance: reconciliation.ledger_balance,
        source_balance: reconciliation.source_balance,
        difference: reconciliation.difference,
        checks: reconciliation.checks,
      },
      generated_at: position.generated_at,
    };
  }
}

export const reportDataService = new ReportDataService();
