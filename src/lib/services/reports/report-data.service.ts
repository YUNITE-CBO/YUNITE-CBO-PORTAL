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
import { ORG_IDENTITY } from './brand';

export type ReportType =
  | 'financial_summary'
  | 'member_list'
  | 'loan_report'
  | 'transaction_report'
  | 'contribution_report'
  | 'fine_report'
  | 'member_statement'
  | 'welfare_report'
  | 'organization_summary';

export const REPORT_TYPES: ReportType[] = [
  'financial_summary',
  'member_list',
  'loan_report',
  'transaction_report',
  'contribution_report',
  'fine_report',
  'member_statement',
  'welfare_report',
  'organization_summary',
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

export interface OrgSummaryData {
  memberCounts: { total: number; active: number; pending: number; suspended: number };
  financial: FinancialSummaryData;
  pendingLoans: number;
  pendingFines: number;
  currency: string;
}

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

    const creditTypes = new Set([
      'savings_deposit', 'savings_monthly', 'savings_special', 'savings_development',
      'contribution_monthly', 'contribution_special', 'contribution_development',
      'welfare_deposit', 'welfare_monthly', 'welfare_special', 'fine_posting',
      'loan_disbursement', 'registration_fee', 'annual_fee',
    ]);

    let running = opening;
    let totalCredits = 0;
    let totalDebits = 0;
    const rows = (txns || []).map((t: any) => {
      const amt = Number(t.amount);
      const isCredit = creditTypes.has(t.transaction_type);
      if (isCredit) {
        totalCredits += amt;
        running += amt;
      } else {
        totalDebits += amt;
        running -= amt;
      }
      return {
        posted_at: t.posted_at,
        transaction_ref: t.transaction_ref,
        description: t.description || t.transaction_type,
        reference_number: t.reference_number,
        debit: isCredit ? 0 : amt,
        credit: isCredit ? amt : 0,
        balance: running,
      };
    });

    const closing = opening + totalCredits - totalDebits;

    // Account breakdown (current balances per account type)
    const accountTypes = ['savings', 'contributions', 'welfare', 'fines', 'loans'];
    const accountBreakdown = await Promise.all(
      accountTypes.map(async (at) => ({
        account_type: at,
        balance: await transactionEngine.calculateBalance(memberId, at as any),
      })),
    );

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
    const credit = ['savings_deposit', 'savings_monthly', 'savings_special', 'savings_development', 'contribution_monthly', 'contribution_special', 'contribution_development', 'welfare_deposit', 'welfare_monthly', 'welfare_special', 'fine_posting', 'loan_disbursement', 'registration_fee', 'annual_fee'];
    const debit = ['savings_withdrawal', 'savings_disbursement', 'contribution_withdrawal', 'contribution_disbursement', 'welfare_withdrawal', 'welfare_disbursement', 'fine_payment', 'loan_repayment'];
    let bal = 0;
    for (const [k, v] of Object.entries(priorByType)) {
      if (credit.includes(k)) bal += v;
      else if (debit.includes(k)) bal -= v;
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
}

export const reportDataService = new ReportDataService();
