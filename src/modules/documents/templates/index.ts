/**
 * Template registry — maps a DocumentKind to the template function that builds
 * its pdfmake Content[] from the structured payload.
 */

import type { Content } from 'pdfmake';
import { financialSummaryTemplate, organizationSummaryTemplate, welfareReportTemplate } from './financial-reports';
import {
  memberListTemplate,
  loanReportTemplate,
  transactionReportTemplate,
  contributionReportTemplate,
  fineReportTemplate,
} from './list-reports';
import {
  memberStatementTemplate,
  memberFinancialStandingTemplate,
  loanStatementTemplate,
} from './statement-reports';
import {
  investigationReportTemplate,
  memberVerificationReportTemplate,
  comparisonReportTemplate,
  systemHealthReportTemplate,
} from './ai-reports';
import type { DocumentEnvelope, DocumentData } from '../types/document.types';

export type TemplateFn<D extends DocumentData = DocumentData> = (
  envelope: DocumentEnvelope,
  data: D,
) => Promise<Content[]>;

/**
 * Discriminated dispatch on `data.kind`. Each branch narrows the payload to
 * the concrete shape the template expects.
 */
export async function renderTemplate(envelope: DocumentEnvelope, data: DocumentData): Promise<Content[]> {
  switch (data.kind) {
    case 'financial_summary':
      return financialSummaryTemplate(envelope, data.summary);
    case 'organization_summary':
      return organizationSummaryTemplate(envelope, data.summary);
    case 'welfare_report':
      return welfareReportTemplate(envelope, data.welfare);
    case 'member_list':
      return memberListTemplate(envelope, data.members, data.total);
    case 'loan_report':
      return loanReportTemplate(envelope, data.loans, data.total);
    case 'transaction_report':
      return transactionReportTemplate(envelope, data.transactions, data.total);
    case 'contribution_report':
      return contributionReportTemplate(envelope, data.rows, data.total, data.totalAmount);
    case 'fine_report':
      return fineReportTemplate(envelope, data.fines, data.total);
    case 'member_statement':
      return memberStatementTemplate(envelope, data.statement);
    case 'member_financial_standing':
      return memberFinancialStandingTemplate(envelope, data.standing);
    case 'loan_statement':
      return loanStatementTemplate(envelope, data.loan);
    case 'ai_investigation_report':
      return investigationReportTemplate(envelope, data.investigation);
    case 'ai_member_verification_report':
      return memberVerificationReportTemplate(envelope, data.verification);
    case 'ai_comparison_report':
      return comparisonReportTemplate(envelope, data.comparison);
    case 'system_health_report':
      return systemHealthReportTemplate(envelope, data.health);
  }
}

/** Orientation override per kind (landscape for wide ledgers). */
export function orientationFor(kind: DocumentData['kind']): 'portrait' | 'landscape' {
  switch (kind) {
    case 'transaction_report':
    case 'ai_investigation_report':
      return 'landscape';
    default:
      return 'portrait';
  }
}
