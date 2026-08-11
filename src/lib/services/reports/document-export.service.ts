/**
 * DOCUMENT EXPORT SERVICE
 *
 * High-level orchestrator: gathers live report data → renders the branded
 * HTML → generates PDF/CSV → persists an immutable audit record in
 * generated_documents (doc_ref + auth_hash) for traceability.
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
import {
  renderDocument,
  type ReportPayload,
} from './report-renderer';
import {
  htmlToPdf,
  reportToCsv,
} from './document-generator';
import { getClientIP, getUserAgent } from '@/lib/auth/server-auth';

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
    const rendered = renderDocument(ctx, payload);

    let content: Buffer | string;
    let contentType: string;
    let fileExtension: string;

    if (opts.format === 'csv') {
      content = reportToCsv(ctx, payload as any);
      contentType = 'text/csv; charset=utf-8';
      fileExtension = 'csv';
    } else if (opts.format === 'html') {
      content = rendered.html;
      contentType = 'text/html; charset=utf-8';
      fileExtension = 'html';
    } else {
      content = await htmlToPdf(rendered.html);
      contentType = 'application/pdf';
      fileExtension = 'pdf';
    }

    // Persist audit record (best-effort: never block the download on the
    // audit row; warn instead, matching the project convention).
    try {
      await this.recordGeneration({
        ref: rendered.ref,
        hash: rendered.hash,
        type: opts.type,
        title: rendered.title,
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
      ref: rendered.ref,
      hash: rendered.hash,
      title: rendered.title,
      format: opts.format,
      contentType,
      fileExtension,
      content,
      generatedAt: rendered.generatedAt,
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
