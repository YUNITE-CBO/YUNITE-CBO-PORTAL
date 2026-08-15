/**
 * List/register report templates: member_list, loan_report,
 * transaction_report, contribution_report, fine_report.
 *
 * Each renders a repeating-header table (pdfmake paginates long tables
 * automatically). Rows are capped at MAX_ROWS_PER_TABLE with a truncation note.
 */

import type { Content } from 'pdfmake';
import { sectionHeader, preamble, closing } from './shared';
import { resolveOrgIdentity } from '../styles/yunite-document.styles';
import { buildTable, emptyNote } from '../utils/tables';
import { money, text, titleCase, formatDate } from '../utils/formatting';
import { capRows } from '../utils/pagination';
import type {
  MemberRow,
  LoanRow,
  TransactionRow,
  ContributionRow,
  FineRow,
} from '@/lib/services/reports/report-data.service';
import type { DocumentEnvelope } from '../types/document.types';

/** Member register. */
export async function memberListTemplate(env: DocumentEnvelope, members: MemberRow[], total: number): Promise<Content[]> {
  const cur = (await resolveOrgIdentity()).currency;
  const content: Content[] = await preamble(env, `${total} members on record`);
  content.push(...sectionHeader('Member Register'));

  const { rows, truncated } = capRows(members);
  if (rows.length === 0) {
    content.push(emptyNote('No members found for the selected period.'));
  } else {
    content.push(
      buildTable(
        [
          { header: 'No.' },
          { header: 'Member No.' },
          { header: 'Name' },
          { header: 'Phone' },
          { header: 'Status' },
          { header: 'Registered' },
        ],
        rows.map((m, i) => [
          String(i + 1),
          text(m.member_number),
          `${m.first_name} ${m.last_name}`,
          text(m.phone),
          titleCase(m.status),
          formatDate(m.registration_date),
        ]),
      ),
    );
    if (truncated) content.push(emptyNote(`Showing first ${rows.length} of ${total} members. Refine the period for a shorter list.`));
  }
  content.push(...closing(env, ['Prepared By', 'Secretary']));
  return content;
}

/** Loan portfolio report. */
export async function loanReportTemplate(env: DocumentEnvelope, loans: LoanRow[], total: number): Promise<Content[]> {
  const cur = (await resolveOrgIdentity()).currency;
  const content: Content[] = await preamble(env, `${total} loans on record`);
  content.push(...sectionHeader('Loan Portfolio'));

  const { rows, truncated } = capRows(loans);
  if (rows.length === 0) {
    content.push(emptyNote('No loans found for the selected period.'));
  } else {
    content.push(
      buildTable(
        [
          { header: 'Loan No.' },
          { header: 'Member' },
          { header: 'Type' },
          { header: 'Principal', numeric: true },
          { header: 'Total', numeric: true },
          { header: 'Paid', numeric: true },
          { header: 'Due', numeric: true },
          { header: 'Status' },
        ],
        rows.map((l) => [
          text(l.loan_number),
          `${l.member_name} (${l.member_number})`,
          titleCase(l.loan_type),
          money(l.principal, cur),
          money(l.total_amount, cur),
          money(l.amount_paid, cur),
          money(l.amount_due, cur),
          titleCase(l.status),
        ]),
      ),
    );
    if (truncated) content.push(emptyNote(`Showing first ${rows.length} of ${total} loans.`));
  }

  const totals = rows.reduce(
    (acc, l) => ({
      principal: acc.principal + l.principal,
      total: acc.total + l.total_amount,
      paid: acc.paid + l.amount_paid,
      due: acc.due + l.amount_due,
    }),
    { principal: 0, total: 0, paid: 0, due: 0 },
  );
  if (rows.length > 0) {
    content.push(...sectionHeader('Portfolio Totals'));
    content.push(
      buildTable(
        [{ header: 'Principal', numeric: true }, { header: 'Total', numeric: true }, { header: 'Paid', numeric: true }, { header: 'Due', numeric: true }],
        [[money(totals.principal, cur), money(totals.total, cur), money(totals.paid, cur), money(totals.due, cur)]],
      ),
    );
  }

  content.push(...closing(env));
  return content;
}

/** Transaction ledger report (landscape for the wider table). */
export async function transactionReportTemplate(env: DocumentEnvelope, transactions: TransactionRow[], total: number): Promise<Content[]> {
  const cur = (await resolveOrgIdentity()).currency;
  const content: Content[] = await preamble(env, `${total} transactions in the period`);
  content.push(...sectionHeader('Transaction Ledger'));

  const { rows, truncated } = capRows(transactions);
  if (rows.length === 0) {
    content.push(emptyNote('No transactions found for the selected period.'));
  } else {
    content.push(
      buildTable(
        [
          { header: 'Ref' },
          { header: 'Date' },
          { header: 'Member' },
          { header: 'Type' },
          { header: 'Description' },
          { header: 'Reference' },
          { header: 'Amount', numeric: true },
          { header: 'Balance', numeric: true },
        ],
        rows.map((t) => [
          text(t.transaction_ref),
          formatDate(t.posted_at),
          `${t.member_name} (${t.member_number})`,
          titleCase(t.transaction_type),
          text(t.description),
          text(t.reference_number),
          money(t.amount, cur),
          money(t.balance_after, cur),
        ]),
      ),
    );
    if (truncated) content.push(emptyNote(`Showing first ${rows.length} of ${total} transactions.`));
  }
  content.push(...closing(env));
  return content;
}

/** Contributions report. */
export async function contributionReportTemplate(env: DocumentEnvelope, rowsData: ContributionRow[], total: number, totalAmount: number): Promise<Content[]> {
  const cur = (await resolveOrgIdentity()).currency;
  const content: Content[] = await preamble(env, `${total} contribution transactions · ${money(totalAmount, cur)} total`);
  content.push(...sectionHeader('Contributions'));

  const { rows, truncated } = capRows(rowsData);
  if (rows.length === 0) {
    content.push(emptyNote('No contributions found for the selected period.'));
  } else {
    content.push(
      buildTable(
        [{ header: 'Member' }, { header: 'Number' }, { header: 'Type' }, { header: 'Date' }, { header: 'Reference' }, { header: 'Amount', numeric: true }],
        rows.map((r) => [text(r.member_name), text(r.member_number), titleCase(r.type), formatDate(r.posted_at), text(r.reference), money(r.amount, cur)]),
      ),
    );
    if (truncated) content.push(emptyNote(`Showing first ${rows.length} of ${total} contributions.`));
  }
  content.push(...closing(env));
  return content;
}

/** Fines report. */
export async function fineReportTemplate(env: DocumentEnvelope, fines: FineRow[], total: number): Promise<Content[]> {
  const cur = (await resolveOrgIdentity()).currency;
  const content: Content[] = await preamble(env, `${total} fines on record`);
  content.push(...sectionHeader('Fines Register'));

  const { rows, truncated } = capRows(fines);
  if (rows.length === 0) {
    content.push(emptyNote('No fines found for the selected period.'));
  } else {
    content.push(
      buildTable(
        [
          { header: 'Fine No.' },
          { header: 'Member' },
          { header: 'Type' },
          { header: 'Amount', numeric: true },
          { header: 'Paid', numeric: true },
          { header: 'Balance', numeric: true },
          { header: 'Status' },
        ],
        rows.map((f) => [
          text(f.fine_number),
          `${f.member_name} (${f.member_number})`,
          titleCase(f.fine_type),
          money(f.amount, cur),
          money(f.amount_paid, cur),
          money(f.balance, cur),
          titleCase(f.status),
        ]),
      ),
    );
    if (truncated) content.push(emptyNote(`Showing first ${rows.length} of ${total} fines.`));
  }
  content.push(...closing(env));
  return content;
}
