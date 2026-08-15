/**
 * DOCUMENT GENERATOR (CSV)
 *
 * CSV exports are produced directly from the report data (no browser needed)
 * for fast, lossless spreadsheet exports.
 *
 * PDF generation moved to `src/modules/documents` (pdfmake, browser-free, no
 * Chromium dependency). See `document-export.service.ts` for the PDF path and
 * `src/modules/documents/generators/pdf.generator.ts` for the engine.
 */

import {
  ReportContext,
  FinancialSummaryData,
  MemberRow,
  LoanRow,
  TransactionRow,
  ContributionRow,
  FineRow,
  MemberStatementData,
  WelfareData,
  OrgSummaryData,
} from './report-data.service';
import { formatDate } from './brand';

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRows(headers: string[], rows: Array<unknown[]>): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  return lines.join('\r\n');
}

export interface CsvPayload {
  financialSummary?: FinancialSummaryData;
  memberList?: { members: MemberRow[]; total: number };
  loanReport?: { loans: LoanRow[]; total: number };
  transactionReport?: { transactions: TransactionRow[]; total: number };
  contributionReport?: { rows: ContributionRow[]; total: number; totalAmount: number };
  fineReport?: { fines: FineRow[]; total: number };
  memberStatement?: MemberStatementData;
  welfareReport?: WelfareData;
  orgSummary?: OrgSummaryData;
}

export function reportToCsv(ctx: ReportContext, payload: CsvPayload): string {
  switch (ctx.type) {
    case 'financial_summary': {
      const f = payload.financialSummary!;
      return csvRows(
        ['Account Type', 'Inflow', 'Outflow', 'Balance'],
        [
          ['Savings', f.savings.deposits, f.savings.withdrawals, f.savings.balance],
          ['Contributions', f.contributions.deposits, f.contributions.withdrawals, f.contributions.balance],
          ['Welfare', f.welfare.deposits, f.welfare.disbursements, f.welfare.balance],
          ['Fines', f.fines.posted, f.fines.paid, f.fines.balance],
          ['Loans', f.loans.disbursed, f.loans.repaid, f.loans.outstanding],
          ['TOTALS', f.totals.inflow, f.totals.outflow, f.totals.net],
        ],
      );
    }
    case 'member_list': {
      const rows = payload.memberList!.members.map((m, i) => [
        i + 1, m.member_number, m.first_name, m.last_name, m.phone, m.email, m.occupation, m.gender, formatDate(m.registration_date), m.status,
      ]);
      return csvRows(['#', 'Member No', 'First Name', 'Last Name', 'Phone', 'Email', 'Occupation', 'Gender', 'Reg Date', 'Status'], rows);
    }
    case 'loan_report': {
      const rows = payload.loanReport!.loans.map((l) => [
        l.loan_number, l.member_number, l.member_name, l.loan_type, l.principal, l.interest_rate, l.total_amount, l.amount_paid, l.amount_due, l.monthly_repayment, l.status, formatDate(l.disbursement_date),
      ]);
      return csvRows(['Loan No', 'Member No', 'Member', 'Type', 'Principal', 'Rate', 'Total', 'Paid', 'Due', 'Monthly', 'Status', 'Disbursed'], rows);
    }
    case 'transaction_report': {
      const rows = payload.transactionReport!.transactions.map((t) => [
        formatDate(t.posted_at), t.transaction_ref, t.member_number, t.member_name, t.transaction_type, t.description, t.reference_number, t.amount, t.balance_after, t.reversed ? 'REVERSED' : '',
      ]);
      return csvRows(['Date', 'Ref', 'Member No', 'Member', 'Type', 'Description', 'Reference', 'Amount', 'Balance', 'Flags'], rows);
    }
    case 'contribution_report': {
      const rows = payload.contributionReport!.rows.map((r) => [
        formatDate(r.posted_at), r.member_number, r.member_name, r.type, r.reference, r.amount,
      ]);
      return csvRows(['Date', 'Member No', 'Member', 'Type', 'Reference', 'Amount'], rows);
    }
    case 'fine_report': {
      const rows = payload.fineReport!.fines.map((f) => [
        f.fine_number, f.member_number, f.member_name, f.fine_type, f.reason, f.amount, f.amount_paid, f.balance, f.status, formatDate(f.issued_date),
      ]);
      return csvRows(['Fine No', 'Member No', 'Member', 'Type', 'Reason', 'Issued Amount', 'Paid', 'Balance', 'Status', 'Issued Date'], rows);
    }
    case 'member_statement': {
      const s = payload.memberStatement!;
      const header = `Member,${s.member.name},No.,${s.member.member_number},Phone,${s.member.phone},Status,${s.member.status}\r\nPeriod,${ctx.period.label}\r\nOpening Balance,${s.openingBalance}\r\nClosing Balance,${s.closingBalance}\r\nTotal Credits,${s.totalCredits}\r\nTotal Debits,${s.totalDebits}\r\n`;
      const rows = s.rows.map((r) => [formatDate(r.posted_at), r.transaction_ref, r.description, r.reference_number, r.debit, r.credit, r.balance]);
      return header + csvRows(['Date', 'Ref', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'], rows);
    }
    case 'welfare_report': {
      const w = payload.welfareReport!;
      const header = `Total Deposits,${w.totalDeposits}\r\nTotal Disbursements,${w.totalDisbursements}\r\nBalance,${w.balance}\r\nMonthly Amount,${w.monthlyAmount}\r\n`;
      const rows = w.rows.map((r) => [formatDate(r.posted_at), r.member_number, r.member_name, r.type, r.reference, r.amount]);
      return header + csvRows(['Date', 'Member No', 'Member', 'Type', 'Reference', 'Amount'], rows);
    }
    case 'organization_summary': {
      const o = payload.orgSummary!;
      const c = o.memberCounts;
      const f = o.financial;
      return csvRows(
        ['Metric', 'Value'],
        [
          ['Total Members', c.total],
          ['Active Members', c.active],
          ['Pending Members', c.pending],
          ['Suspended Members', c.suspended],
          ['Pending Loans', o.pendingLoans],
          ['Pending Fines', o.pendingFines],
          ['Savings Balance', f.savings.balance],
          ['Contributions Balance', f.contributions.balance],
          ['Welfare Balance', f.welfare.balance],
          ['Fines Balance', f.fines.balance],
          ['Loans Outstanding', f.loans.outstanding],
        ],
      );
    }
    default:
      return '';
  }
}
