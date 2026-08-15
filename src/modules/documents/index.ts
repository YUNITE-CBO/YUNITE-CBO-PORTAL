/**
 * YUNITE Document & Report Engine — public API.
 *
 * Browser-free, Chromium-free document generation via pdfmake. Produces
 * branded, certified, downloadable PDFs for every reportable surface
 * (financial reports, member/loan statements, AI Intelligence investigations,
 * system health).
 *
 * The engines (report-data service, transaction engine, AI persistence) remain
 * the single source of truth; this module is a pure presentation layer.
 */

export { documentService, generateDocument, buildEnvelope, recordGeneration, computeAuthHash, nextDocumentNumber } from './document.service';
export type { GeneratedDocument } from './document.service';

export { generatePdf, resolveOrgIdentity } from './generators/pdf.generator';
export { resolveOrgIdentity as resolveOrgIdentityFromStyles, YUNITE_STYLES, PAGE_GEOMETRY, type ResolvedOrgIdentity } from './styles/yunite-document.styles';
export { renderTemplate, orientationFor, type TemplateFn } from './templates';

export type {
  DocumentRequest,
  DocumentEnvelope,
  DocumentIssuer,
  DocumentKind,
  DocumentData,
  PageOrientation,
  DocumentOutputFormat,
  InvestigationReportData,
  MemberVerificationReportData,
  AIComparisonReportData,
  SystemHealthReportData,
  FinancialStandingData,
  LoanStatementData,
} from './types/document.types';
