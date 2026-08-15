/**
 * Financial report templates: financial_summary, organization_summary,
 * welfare_report.
 *
 * These mirror the HTML renderer's financial report layout (KPIs + per-fund
 * tables + totals) but as pdfmake content nodes.
 */

import type { Content } from 'pdfmake';
import { kpiRow, sectionHeader, preamble, closing } from './shared';
import { resolveOrgIdentity } from '../styles/yunite-document.styles';
import { buildTable } from '../utils/tables';
import { money, signedMoney, text, titleCase } from '../utils/formatting';
import type { FinancialSummaryData, OrgSummaryData, WelfareData } from '@/lib/services/reports/report-data.service';
import type { DocumentEnvelope } from '../types/document.types';

/** Build the financial-summary KPI grid + fund tables. */
export async function financialSummaryTemplate(env: DocumentEnvelope, data: FinancialSummaryData): Promise<Content[]> {
  const cur = (await resolveOrgIdentity()).currency;
  const content: Content[] = await preamble(env, 'Comprehensive financial position across all funds');

  content.push(
    kpiRow([
      { label: 'Total Inflow', value: money(data.totals.inflow, cur), accent: '#16A34A' },
      { label: 'Total Outflow', value: money(data.totals.outflow, cur), accent: '#DC2626' },
      { label: 'Net Position', value: signedMoney(data.totals.net, cur), accent: data.totals.net >= 0 ? '#16A34A' : '#DC2626' },
      { label: 'Savings Balance', value: money(data.savings.balance, cur) },
    ]),
  );

  content.push(...sectionHeader('Fund Balances'));
  content.push(
    buildTable(
      [
        { header: 'Fund' },
        { header: 'Deposits/Inflow', numeric: true },
        { header: 'Withdrawals/Outflow', numeric: true },
        { header: 'Balance', numeric: true },
      ],
      [
        ['Savings', money(data.savings.deposits, cur), money(data.savings.withdrawals, cur), money(data.savings.balance, cur)],
        ['Contributions', money(data.contributions.deposits, cur), money(data.contributions.withdrawals, cur), money(data.contributions.balance, cur)],
        ['Welfare', money(data.welfare.deposits, cur), money(data.welfare.disbursements, cur), money(data.welfare.balance, cur)],
        ['Fines', money(data.fines.posted, cur), money(data.fines.paid, cur), money(data.fines.balance, cur)],
      ],
      ['Total', money(data.totals.inflow, cur), money(data.totals.outflow, cur), money(data.totals.net, cur)],
    ),
  );

  content.push(...sectionHeader('Loan Portfolio'));
  content.push(
    buildTable(
      [
        { header: 'Disbursed', numeric: true },
        { header: 'Repaid', numeric: true },
        { header: 'Outstanding', numeric: true },
      ],
      [[money(data.loans.disbursed, cur), money(data.loans.repaid, cur), money(data.loans.outstanding, cur)]],
    ),
  );

  content.push(...closing(env));
  return content;
}

/** Organization summary: member counts + financial KPIs + pending items. */
export async function organizationSummaryTemplate(env: DocumentEnvelope, data: OrgSummaryData): Promise<Content[]> {
  const cur = data.currency || (await resolveOrgIdentity()).currency;
  const content: Content[] = await preamble(env, `${data.memberCounts.total} members · ${data.memberCounts.active} active`);

  content.push(
    kpiRow([
      { label: 'Total Members', value: String(data.memberCounts.total) },
      { label: 'Active', value: String(data.memberCounts.active), accent: '#16A34A' },
      { label: 'Pending', value: String(data.memberCounts.pending), accent: '#D97706' },
      { label: 'Suspended', value: String(data.memberCounts.suspended), accent: '#DC2626' },
    ]),
  );

  content.push(...sectionHeader('Financial Position'));
  content.push(
    buildTable(
      [
        { header: 'Fund' },
        { header: 'Inflow', numeric: true },
        { header: 'Outflow', numeric: true },
        { header: 'Balance', numeric: true },
      ],
      [
        ['Savings', money(data.financial.savings.deposits, cur), money(data.financial.savings.withdrawals, cur), money(data.financial.savings.balance, cur)],
        ['Contributions', money(data.financial.contributions.deposits, cur), money(data.financial.contributions.withdrawals, cur), money(data.financial.contributions.balance, cur)],
        ['Welfare', money(data.financial.welfare.deposits, cur), money(data.financial.welfare.disbursements, cur), money(data.financial.welfare.balance, cur)],
        ['Fines', money(data.financial.fines.posted, cur), money(data.financial.fines.paid, cur), money(data.financial.fines.balance, cur)],
        ['Loans', money(data.financial.loans.disbursed, cur), money(data.financial.loans.repaid, cur), money(data.financial.loans.outstanding, cur)],
      ],
      ['Totals', money(data.financial.totals.inflow, cur), money(data.financial.totals.outflow, cur), money(data.financial.totals.net, cur)],
    ),
  );

  content.push(...sectionHeader('Pending Items'));
  content.push(
    buildTable(
      [{ header: 'Item' }, { header: 'Count', numeric: true }],
      [
        ['Pending Loan Applications', String(data.pendingLoans)],
        ['Outstanding Fines', String(data.pendingFines)],
      ],
    ),
  );

  content.push(...closing(env, ['Prepared By', 'Secretary']));
  return content;
}

/** Welfare fund report. */
export async function welfareReportTemplate(env: DocumentEnvelope, data: WelfareData): Promise<Content[]> {
  const cur = (await resolveOrgIdentity()).currency;
  const content: Content[] = await preamble(env, 'Welfare fund deposits, disbursements, and balance');

  content.push(
    kpiRow([
      { label: 'Total Deposits', value: money(data.totalDeposits, cur), accent: '#16A34A' },
      { label: 'Total Disbursements', value: money(data.totalDisbursements, cur), accent: '#DC2626' },
      { label: 'Balance', value: money(data.balance, cur) },
      { label: 'Monthly Amount', value: money(data.monthlyAmount, cur) },
    ]),
  );

  content.push(...sectionHeader('Welfare Transactions'));
  const rows = data.rows.map((r) => [
    text(r.member_name),
    text(r.member_number),
    titleCase(r.type),
    money(r.amount, cur),
  ]);
  content.push(
    buildTable(
      [{ header: 'Member' }, { header: 'Number' }, { header: 'Type' }, { header: 'Amount', numeric: true }],
      rows,
      ['Total', '', '', money(data.rows.reduce((s, r) => s + r.amount, 0), cur)],
    ),
  );

  content.push(...closing(env));
  return content;
}
