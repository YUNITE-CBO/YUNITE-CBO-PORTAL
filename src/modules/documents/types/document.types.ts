/**
 * YUNITE DOCUMENT & REPORT ENGINE — domain types.
 *
 * These are the structured, render-agnostic data shapes that the document
 * templates receive. They are produced by the authoritative YUNITE business
 * engines (report-data service, transaction engine, AI persistence) and NEVER
 * by the PDF generator itself — the generator is a pure presentation layer.
 *
 * Keeping data separate from presentation lets the same report data later
 * produce PDF, HTML, DOCX, CSV, print views, or email attachments without
 * touching the business logic.
 */

import type {
  FinancialSummaryData,
  MemberRow,
  LoanRow,
  TransactionRow,
  ContributionRow,
  FineRow,
  MemberStatementData,
  WelfareData,
  OrgSummaryData,
  ReportPeriod,
} from '@/lib/services/reports/report-data.service';
import type { Finding, ProviderReport, ComparisonResult } from '@/ai/types';

/** Page orientation for the generated document. */
export type PageOrientation = 'portrait' | 'landscape';

/** Output format (PDF is the primary implementation; others are future-ready). */
export type DocumentOutputFormat = 'pdf' | 'csv' | 'html';

/** Who issued the document (audit attribution). */
export interface DocumentIssuer {
  id: string;
  name: string;
  role: string;
}

/**
 * Every generated document carries this envelope. It is the single source of
 * document identity, traceability, and branding metadata consumed by every
 * template + the audit ledger.
 */
export interface DocumentEnvelope {
  /** Human-readable, unique document reference, e.g. YUNITE-MBR-STM-2026-000123. */
  documentNumber: string;
  /** Short title shown in the letterhead title block. */
  title: string;
  /** Eyebrow/eyebrow label above the title (e.g. "Member Statement"). */
  eyebrow: string;
  /** Reporting period the document covers. */
  period: ReportPeriod;
  /** When the document was generated (ISO). */
  generatedAt: string;
  /** Issuing user / system. */
  issuer?: DocumentIssuer;
  /** SHA-256 authenticity hash (16 hex chars) for verification. */
  authHash: string;
  /** Public verification URL (doc-verify landing). */
  verifyUrl: string;
  /** Confidentiality classification. */
  classification?: string;
  /** Optional member scope (for member-scoped documents). */
  memberNumber?: string;
  /**
   * Optional data-quality / reconciliation report. When present, templates
   * render a data-quality indicator so discrepancies are never silently
   * presented as verified truth (requirement: data integrity over appearance).
   */
  dataQuality?: import('@/lib/services/reports/report-data-quality.service').DataQualityReport;
}

/** The union of all generatable document kinds. */
export type DocumentKind =
  | 'financial_summary'
  | 'member_list'
  | 'loan_report'
  | 'transaction_report'
  | 'contribution_report'
  | 'fine_report'
  | 'member_statement'
  | 'member_financial_standing'
  | 'loan_statement'
  | 'welfare_report'
  | 'organization_summary'
  | 'ai_investigation_report'
  | 'ai_member_verification_report'
  | 'ai_comparison_report'
  | 'system_health_report';

/** A complete, render-ready document request handed to the engine. */
export interface DocumentRequest {
  kind: DocumentKind;
  envelope: DocumentEnvelope;
  orientation?: PageOrientation;
  /** The structured payload; shape depends on `kind`. */
  data: DocumentData;
}

/** Discriminated union of the per-kind structured payloads. */
export type DocumentData =
  | { kind: 'financial_summary'; summary: FinancialSummaryData }
  | { kind: 'member_list'; members: MemberRow[]; total: number }
  | { kind: 'loan_report'; loans: LoanRow[]; total: number }
  | { kind: 'transaction_report'; transactions: TransactionRow[]; total: number }
  | { kind: 'contribution_report'; rows: ContributionRow[]; total: number; totalAmount: number }
  | { kind: 'fine_report'; fines: FineRow[]; total: number }
  | { kind: 'member_statement'; statement: MemberStatementData }
  | { kind: 'member_financial_standing'; standing: FinancialStandingData }
  | { kind: 'loan_statement'; loan: LoanStatementData }
  | { kind: 'welfare_report'; welfare: WelfareData }
  | { kind: 'organization_summary'; summary: OrgSummaryData }
  | { kind: 'ai_investigation_report'; investigation: InvestigationReportData }
  | { kind: 'ai_member_verification_report'; verification: MemberVerificationReportData }
  | { kind: 'ai_comparison_report'; comparison: AIComparisonReportData }
  | { kind: 'system_health_report'; health: SystemHealthReportData };

// ---------------------------------------------------------------------------
// AI Intelligence document payloads (built from ai/persistence getters — the
// engines remain the source of truth; the PDF never re-investigates).
// ---------------------------------------------------------------------------

export interface InvestigationReportData {
  investigationId: string;
  investigationNumber: string;
  scope: string;
  status: string;
  aiStatus: string;
  depth?: string;
  dualMode?: string;
  startedAt: string;
  finishedAt?: string;
  overallScore?: number;
  recordsChecked?: number;
  modulesInvestigated?: string[];
  summary: string;
  counts: { critical: number; high: number; medium: number; low: number; info: number; unresolved: number };
  findings: Finding[];
  deterministicReport?: ProviderReport;
  geminiReport?: ProviderReport;
  openrouterReport?: ProviderReport;
  comparison?: ComparisonResult;
  rootCauseAnalysis?: string;
  recommendations: string[];
}

export interface MemberVerificationReportData {
  investigationId: string;
  investigationNumber: string;
  memberNumber?: string;
  memberName?: string;
  overallStatus: string;
  verificationScore: number;
  fieldsChecked: number;
  fieldsVerified: number;
  fieldsMismatched: number;
  fieldResults: Array<{
    field: string;
    database?: string;
    calculation?: string;
    api?: string;
    memberLookup?: string;
    display?: string;
    match: boolean;
    severity: string;
    note?: string;
    mismatchLayer?: string;
    frontendComponent?: string;
    expectedValue?: string;
    actualValue?: string;
    difference?: string;
  }>;
  sections?: Array<{ title: string; summary: string; items?: string[] }>;
  geminiAssessment?: string;
  openrouterAssessment?: string;
  finalEvaluation?: string;
}

export interface AIComparisonReportData {
  investigationId: string;
  investigationNumber: string;
  scope: string;
  geminiReport?: { provider: string; summary: string; findingsCount: number; findings: Finding[] };
  openrouterReport?: { provider: string; summary: string; findingsCount: number; findings: Finding[] };
  comparison?: ComparisonResult;
  summary: string;
}

// ---------------------------------------------------------------------------
// Member financial standing + loan statement (built from the authoritative
// report-data service + transaction engine).
// ---------------------------------------------------------------------------

export interface FinancialStandingData {
  member: {
    member_number: string;
    name: string;
    email: string | null;
    phone: string;
    status: string;
  };
  period: ReportPeriod;
  balances: Array<{ account_type: string; balance: number }>;
  outstandingLoanBalance: number;
  obligations: Array<{ type: string; amount: number; status: string }>;
  complianceStatus?: string;
  accountStatus?: string;
  generatedOn: string;
}

export interface LoanStatementData {
  loan: {
    loan_number: string;
    loan_type: string;
    member_name: string;
    member_number: string;
    principal: number;
    interest_rate: number;
    interest_amount: number;
    total_amount: number;
    amount_paid: number;
    amount_due: number;
    monthly_repayment: number;
    repayment_period_months: number;
    disbursement_date: string | null;
    status: string;
  };
  repayments: Array<{
    posted_at: string;
    transaction_ref: string;
    reference_number: string | null;
    amount: number;
    balance_after: number;
  }>;
  nextObligation?: { due_date: string; amount: number } | null;
}

// ---------------------------------------------------------------------------
// System health report payload.
// ---------------------------------------------------------------------------

export interface SystemHealthReportData {
  generatedOn: string;
  modules: Array<{
    module: string;
    status: string;
    findingsCount: number;
    criticalCount: number;
    highCount: number;
    affectedMembers?: number;
    affectedRecords?: number;
  }>;
  providerHealth: Array<{
    provider: string;
    status: string;
    availabilityPct: number;
    successCount: number;
    failureCount: number;
  }>;
  summary: string;
}
