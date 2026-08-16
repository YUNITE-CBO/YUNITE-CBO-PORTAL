/**
 * DOCUMENT EXPORT SERVICE
 *
 * High-level orchestrator: gathers live report data → renders the document
 * (PDF via the browser-free pdfmake engine, or CSV/HTML) → persists an
 * immutable audit record in generated_documents (doc_ref + auth_hash) for
 * traceability.
 *
 * PDF generation uses `src/modules/documents` (pdfmake, no Chromium). CSV
 * exports are produced directly from the report payload. HTML preview stays
 * available via the report-renderer for the dashboard preview banner.
 *
 * Every exported document is therefore marked, traceable, and
 * authenticatable in the system via /api/reports/verify/[ref].
 */

import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import {
  reportDataService,
  ReportContext,
  ReportType,
  ReportPeriod,
  REPORT_META,
} from './report-data.service';
import { renderDocument, type ReportPayload } from './report-renderer';
import { reportToCsv } from './document-generator';
import { reportDataQualityService, type DataQualityReport } from './report-data-quality.service';
import { getClientIP, getUserAgent } from '@/lib/auth/server-auth';
import {
  documentService,
  buildEnvelope,
  generateDocument,
  type DocumentData,
  type DocumentKind,
  type DocumentIssuer,
} from '@/modules/documents';

export type DocumentFormat = 'pdf' | 'csv' | 'html';

export interface GenerateOptions {
  type: ReportType;
  format: DocumentFormat;
  period?: ReportPeriod;
  memberId?: string;
  generatedBy?: { id: string; name: string; role: string };
  req?: NextRequest;
}

export interface GeneratedDocumentRecord {
  ref: string;
  hash: string;
  title: string;
  format: DocumentFormat;
  contentType: string;
  fileExtension: string;
  content: Buffer | string;
  generatedAt: string;
  periodLabel: string;
}

export class DocumentExportService {
  async generate(opts: GenerateOptions): Promise<GeneratedDocumentRecord> {
    const ctx: ReportContext = {
      type: opts.type,
      period: opts.period || this.defaultPeriod(),
      memberId: opts.memberId,
      generatedBy: opts.generatedBy,
    };

    // Validate member-scope requirement
    if (REPORT_META[opts.type].supportsMemberScope && opts.memberId) {
      const member = await reportDataService.getMemberById(opts.memberId);
      if (!member) throw new Error('Member not found');
    }
    if (opts.type === 'member_statement' && !opts.memberId) {
      throw new Error('Member statement requires a member_id');
    }

    const payload = await this.gatherData(ctx);

    // For PDF, use the browser-free pdfmake document engine. CSV/HTML keep
    // their existing paths (CSV is a direct spreadsheet export; HTML is the
    // preview banner rendered by report-renderer).
    const meta = REPORT_META[opts.type];

    let content: Buffer | string;
    let contentType: string;
    let fileExtension: string;
    let ref: string;
    let hash: string;
    let title: string;
    let generatedAt: string;

    if (opts.format === 'csv') {
      content = reportToCsv(ctx, payload as any);
      contentType = 'text/csv; charset=utf-8';
      fileExtension = 'csv';
      const rendered = renderDocument(ctx, payload);
      ref = rendered.ref; hash = rendered.hash; title = rendered.title; generatedAt = rendered.generatedAt;
    } else if (opts.format === 'html') {
      const rendered = renderDocument(ctx, payload);
      content = rendered.html;
      contentType = 'text/html; charset=utf-8';
      fileExtension = 'html';
      ref = rendered.ref; hash = rendered.hash; title = rendered.title; generatedAt = rendered.generatedAt;
    } else {
      // PDF via pdfmake (no Chromium). Build the document request from the
      // gathered payload + envelope, then generate.
      const kind = reportTypeToDocumentKind(opts.type);
      const memberNumber = opts.memberId ? (await reportDataService.getMemberById(opts.memberId))?.member_number : undefined;
      const issuer: DocumentIssuer | undefined = opts.generatedBy
        ? { id: opts.generatedBy.id, name: opts.generatedBy.name, role: opts.generatedBy.role }
        : undefined;
      // Run data-quality reconciliation so the document surfaces any
      // stored-vs-ledger discrepancies instead of presenting them as verified
      // truth. Never blocks generation (best-effort; warns on failure).
      let dataQuality: DataQualityReport | undefined;
      try {
        if (opts.memberId) {
          // Pass the statement's own breakdown/closing into the reconciliation
          // so it validates the values actually rendered on the document (not
          // a re-derivation). For non-statement member reports this is simply
          // not supplied and the engine is cross-checked independently.
          const stmt = (payload as any).memberStatement;
          const statementCtx = stmt
            ? {
                closingBalance: stmt.closingBalance,
                accountBreakdown: stmt.accountBreakdown,
              }
            : undefined;
          dataQuality = await reportDataQualityService.reconcileMember(opts.memberId, statementCtx);
        } else {
          dataQuality = await reportDataQualityService.reconcileOrganization();
        }
      } catch (e) {
        console.warn('[document-export] reconciliation failed:', e instanceof Error ? e.message : e);
      }
      const envelope = await buildEnvelope({
        kind,
        title: meta.title,
        eyebrow: meta.title,
        period: ctx.period,
        issuer,
        memberNumber,
        classification: 'Confidential',
      });
      if (dataQuality) envelope.dataQuality = dataQuality;
      const data = payloadToDocumentData(kind, ctx.type, payload, ctx);
      const doc = await generateDocument({ kind, envelope, data });
      content = doc.buffer;
      contentType = doc.contentType;
      fileExtension = doc.fileExtension;
      ref = envelope.documentNumber;
      hash = envelope.authHash;
      title = envelope.title;
      generatedAt = envelope.generatedAt;
    }

    // Persist audit record (best-effort: never block the download on the
    // audit row; warn instead, matching the project convention).
    try {
      await this.recordGeneration({
        ref,
        hash,
        type: opts.type,
        title,
        format: opts.format,
        period: ctx.period,
        memberId: opts.memberId,
        generatedBy: opts.generatedBy,
        fileSize: Buffer.isBuffer(content) ? content.length : Buffer.byteLength(String(content)),
        req: opts.req,
      });
    } catch (e) {
      console.warn('[document-export] audit record failed:', e instanceof Error ? e.message : e);
    }

    return {
      ref,
      hash,
      title,
      format: opts.format,
      contentType,
      fileExtension,
      content,
      generatedAt,
      periodLabel: ctx.period.label,
    };
  }

  private async gatherData(ctx: ReportContext): Promise<ReportPayload> {
    const p = ctx.period;
    switch (ctx.type) {
      case 'financial_summary':
        return { financialSummary: await reportDataService.getFinancialSummary(p) };
      case 'member_list': {
        const { members, total } = await reportDataService.getMemberList();
        return { memberList: { members, total } };
      }
      case 'loan_report': {
        const { loans, total } = await reportDataService.getLoanReport();
        return { loanReport: { loans, total } };
      }
      case 'transaction_report': {
        const { transactions, total } = await reportDataService.getTransactionReport(p, ctx.memberId);
        return { transactionReport: { transactions, total } };
      }
      case 'contribution_report': {
        const r = await reportDataService.getContributionReport();
        return { contributionReport: r };
      }
      case 'fine_report': {
        const { fines, total } = await reportDataService.getFineReport();
        return { fineReport: { fines, total } };
      }
      case 'member_statement': {
        if (!ctx.memberId) throw new Error('Member statement requires a member_id');
        const memberStatement = await reportDataService.getMemberStatement(ctx.memberId, p);
        return { memberStatement };
      }
      case 'welfare_report':
        return { welfareReport: await reportDataService.getWelfareReport() };
      case 'organization_summary':
        return { orgSummary: await reportDataService.getOrganizationSummary() };
      case 'unity_fund_report':
        return { unityFundReport: await reportDataService.getUnityFundReport() };
      default:
        throw new Error(`Unknown report type: ${ctx.type}`);
    }
  }

  private defaultPeriod(): ReportPeriod {
    const start = new Date(new Date().getFullYear(), 0, 1);
    const end = new Date();
    return {
      start,
      end,
      label: `All time (to ${end.toLocaleDateString('en-GB')})`,
    };
  }

  private async recordGeneration(input: {
    ref: string;
    hash: string;
    type: ReportType;
    title: string;
    format: DocumentFormat;
    period: ReportPeriod;
    memberId?: string;
    generatedBy?: { id: string; name: string; role: string };
    fileSize: number;
    req?: NextRequest;
  }): Promise<void> {
    const supabase = await createServiceClient();
    const memberNumber = input.memberId ? (await reportDataService.getMemberById(input.memberId))?.member_number : null;
    const { error } = await supabase.from('generated_documents').insert({
      id: uuidv4(),
      doc_ref: input.ref,
      auth_hash: input.hash,
      report_type: input.type,
      title: input.title,
      format: input.format,
      period_start: input.period.start.toISOString().split('T')[0],
      period_end: input.period.end.toISOString().split('T')[0],
      period_label: input.period.label,
      member_id: input.memberId || null,
      member_number: memberNumber || null,
      file_size_bytes: input.fileSize,
      generated_by: input.generatedBy?.id || null,
      generated_by_name: input.generatedBy?.name || 'system',
      generated_by_role: input.generatedBy?.role || null,
      ip_address: input.req ? getClientIP(input.req) : null,
      user_agent: input.req ? getUserAgent(input.req) : null,
    });
    if (error) throw new Error(error.message);
  }

  async listHistory(limit = 50, offset = 0): Promise<{ rows: any[]; total: number }> {
    const supabase = await createServiceClient();
    const { data, count } = await supabase
      .from('generated_documents')
      .select('*', { count: 'exact' })
      .order('generated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    return { rows: data || [], total: count || 0 };
  }

  async verifyByRef(ref: string): Promise<any | null> {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('generated_documents')
      .select('doc_ref, auth_hash, report_type, title, period_label, member_number, generated_by_name, generated_at, expires_at, revoked, revoked_at')
      .eq('doc_ref', ref)
      .maybeSingle();
    return data;
  }
}

export const documentExportService = new DocumentExportService();

/**
 * Map a legacy ReportType to the new DocumentKind. The 9 existing report types
 * map 1:1 to financial/list/statement document kinds. New AI Intelligence
 * document kinds are produced directly via the document service (not via this
 * export service, which is report-data-scoped).
 */
function reportTypeToDocumentKind(type: ReportType): DocumentKind {
  const map: Record<ReportType, DocumentKind> = {
    financial_summary: 'financial_summary',
    member_list: 'member_list',
    loan_report: 'loan_report',
    transaction_report: 'transaction_report',
    contribution_report: 'contribution_report',
    fine_report: 'fine_report',
    member_statement: 'member_statement',
    welfare_report: 'welfare_report',
    organization_summary: 'organization_summary',
    unity_fund_report: 'unity_fund_report',
  };
  return map[type];
}

/**
 * Convert the gathered ReportPayload into a DocumentData discriminated union.
 * The payload shape mirrors the document data shape 1:1 for the 9 report types.
 */
function payloadToDocumentData(kind: DocumentKind, type: ReportType, payload: ReportPayload, ctx: ReportContext): DocumentData {
  switch (kind) {
    case 'financial_summary':
      return { kind, summary: payload.financialSummary! };
    case 'member_list':
      return { kind, members: payload.memberList!.members, total: payload.memberList!.total };
    case 'loan_report':
      return { kind, loans: payload.loanReport!.loans, total: payload.loanReport!.total };
    case 'transaction_report':
      return { kind, transactions: payload.transactionReport!.transactions, total: payload.transactionReport!.total };
    case 'contribution_report':
      return { kind, rows: payload.contributionReport!.rows, total: payload.contributionReport!.total, totalAmount: payload.contributionReport!.totalAmount };
    case 'fine_report':
      return { kind, fines: payload.fineReport!.fines, total: payload.fineReport!.total };
    case 'member_statement':
      return { kind, statement: payload.memberStatement! };
    case 'welfare_report':
      return { kind, welfare: payload.welfareReport! };
    case 'organization_summary':
      return { kind, summary: payload.orgSummary! };
    case 'unity_fund_report':
      return { kind, unityFund: payload.unityFundReport! };
    default:
      throw new Error(`Unsupported report type for PDF: ${type}`);
  }
}
