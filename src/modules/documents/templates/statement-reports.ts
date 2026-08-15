/**
 * Member + loan statement templates: member_statement,
 * member_financial_standing, loan_statement.
 *
 * These are member-scoped documents carrying the member number in the envelope.
 */

import type { Content } from 'pdfmake';
import { kpiRow, sectionHeader, preamble, closing } from './shared';
import { resolveOrgIdentity } from '../styles/yunite-document.styles';
import { buildTable, emptyNote } from '../utils/tables';
import { money, signedMoney, text, titleCase, formatDate } from '../utils/formatting';
import { capRows } from '../utils/pagination';
import type { MemberStatementData } from '@/lib/services/reports/report-data.service';
import type { FinancialStandingData, LoanStatementData, DocumentEnvelope } from '../types/document.types';

/** Member statement of account: opening/closing + transaction ledger + breakdown. */
export async function memberStatementTemplate(env: DocumentEnvelope, data: MemberStatementData): Promise<Content[]> {
  const org = await resolveOrgIdentity();
  const cur = org.currency;
  const content: Content[] = await preamble(
    env,
    `${data.member.name} — Member No. ${data.member.member_number}`,
    [['Member Status', titleCase(data.member.status)], ['Contact', text(data.member.phone)]],
  );

  content.push(
    kpiRow([
      { label: 'Opening Balance', value: money(data.openingBalance, cur) },
      { label: 'Total Credits', value: money(data.totalCredits, cur), accent: '#16A34A' },
      { label: 'Total Debits', value: money(data.totalDebits, cur), accent: '#DC2626' },
      { label: 'Closing Balance', value: money(data.closingBalance, cur), accent: data.closingBalance >= 0 ? '#16A34A' : '#DC2626' },
    ]),
  );

  content.push(...sectionHeader('Account Breakdown'));
  content.push(
    buildTable(
      [{ header: 'Account Type' }, { header: 'Balance', numeric: true }],
      data.accountBreakdown.map((a) => [titleCase(a.account_type), money(a.balance, cur)]),
    ),
  );

  content.push(...sectionHeader('Transaction History'));
  const { rows, truncated } = capRows(data.rows);
  if (rows.length === 0) {
    content.push(emptyNote('No transactions in this period.'));
  } else {
    content.push(
      buildTable(
        [
          { header: 'Date' },
          { header: 'Ref' },
          { header: 'Description' },
          { header: 'Reference' },
          { header: 'Debit', numeric: true },
          { header: 'Credit', numeric: true },
          { header: 'Balance', numeric: true },
        ],
        rows.map((r) => [
          formatDate(r.posted_at),
          text(r.transaction_ref),
          text(r.description),
          text(r.reference_number),
          r.debit ? money(r.debit, cur) : '—',
          r.credit ? money(r.credit, cur) : '—',
          money(r.balance, cur),
        ]),
      ),
    );
    if (truncated) content.push(emptyNote(`Showing first ${rows.length} transactions.`));
  }

  content.push(...closing(env, ['Prepared By', 'Treasurer']));
  return content;
}

/** Member financial standing: balances + outstanding loan + obligations. */
export async function memberFinancialStandingTemplate(env: DocumentEnvelope, data: FinancialStandingData): Promise<Content[]> {
  const org = await resolveOrgIdentity();
  const cur = org.currency;
  const content: Content[] = await preamble(
    env,
    `${data.member.name} — Member No. ${data.member.member_number}`,
    [
      ['Member Status', titleCase(data.member.status)],
      ['Contact', text(data.member.phone)],
      ['Compliance', titleCase(data.complianceStatus ?? '—')],
      ['Account Status', titleCase(data.accountStatus ?? '—')],
    ],
  );

  content.push(
    kpiRow([
      { label: 'Outstanding Loan', value: money(data.outstandingLoanBalance, cur), accent: data.outstandingLoanBalance > 0 ? '#DC2626' : '#16A34A' },
      { label: 'Accounts', value: String(data.balances.length) },
    ]),
  );

  content.push(...sectionHeader('Account Balances'));
  content.push(
    buildTable(
      [{ header: 'Account Type' }, { header: 'Balance', numeric: true }],
      data.balances.map((b) => [titleCase(b.account_type), money(b.balance, cur)]),
    ),
  );

  if (data.obligations.length > 0) {
    content.push(...sectionHeader('Financial Obligations'));
    content.push(
      buildTable(
        [{ header: 'Type' }, { header: 'Amount', numeric: true }, { header: 'Status' }],
        data.obligations.map((o) => [titleCase(o.type), money(o.amount, cur), titleCase(o.status)]),
      ),
    );
  }

  content.push(...closing(env, ['Prepared By', 'Treasurer']));
  return content;
}

/** Loan statement: loan terms + repayment schedule + next obligation. */
export async function loanStatementTemplate(env: DocumentEnvelope, data: LoanStatementData): Promise<Content[]> {
  const org = await resolveOrgIdentity();
  const cur = org.currency;
  const l = data.loan;
  const content: Content[] = await preamble(
    env,
    `Loan ${l.loan_number} — ${l.member_name} (${l.member_number})`,
    [
      ['Loan Type', titleCase(l.loan_type)],
      ['Status', titleCase(l.status)],
      ['Disbursed', l.disbursement_date ? formatDate(l.disbursement_date) : '—'],
      ['Term', `${l.repayment_period_months} months`],
      ['Interest Rate', `${l.interest_rate}%`],
    ],
  );

  content.push(
    kpiRow([
      { label: 'Principal', value: money(l.principal, cur) },
      { label: 'Interest', value: money(l.interest_amount, cur) },
      { label: 'Total Payable', value: money(l.total_amount, cur) },
      { label: 'Monthly', value: money(l.monthly_repayment, cur) },
    ]),
  );

  content.push(
    kpiRow([
      { label: 'Amount Paid', value: money(l.amount_paid, cur), accent: '#16A34A' },
      { label: 'Amount Due', value: money(l.amount_due, cur), accent: l.amount_due > 0 ? '#DC2626' : '#16A34A' },
      ...(data.nextObligation ? [{ label: 'Next Due', value: formatDate(data.nextObligation.due_date) }] : [{ label: 'Next Due', value: '—' }]),
    ]),
  );

  content.push(...sectionHeader('Repayment History'));
  const { rows, truncated } = capRows(data.repayments);
  if (rows.length === 0) {
    content.push(emptyNote('No repayments recorded yet.'));
  } else {
    content.push(
      buildTable(
        [
          { header: 'Date' },
          { header: 'Transaction Ref' },
          { header: 'Reference' },
          { header: 'Amount', numeric: true },
          { header: 'Balance After', numeric: true },
        ],
        rows.map((r) => [formatDate(r.posted_at), text(r.transaction_ref), text(r.reference_number), money(r.amount, cur), money(r.balance_after, cur)]),
      ),
    );
    if (truncated) content.push(emptyNote(`Showing first ${rows.length} repayments.`));
  }

  content.push(...closing(env, ['Prepared By', 'Loan Officer']));
  return content;
}
