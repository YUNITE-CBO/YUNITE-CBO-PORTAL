/**
 * GET /api/ai/investigations/[id]/pdf — download a full AI Intelligence
 * investigation report as a branded PDF (admin+).
 *
 * Renders the investigation (summary + findings + recommendations + root-cause
 * analysis) via the browser-free pdfmake document engine. The AI engines +
 * persistence remain the source of truth; this route only reads + renders.
 *
 * The PDF carries the standard YUNITE document envelope (doc ref + auth hash +
 * verify URL) and is recorded in the `generated_documents` audit ledger.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '../../../_guard';
import {
  getInvestigation,
  listReports,
  listFindings,
  getVerificationResult,
} from '@/ai/persistence';
import {
  buildEnvelope,
  generateDocument,
  recordGeneration,
  type DocumentData,
  type InvestigationReportData,
  type MemberVerificationReportData,
  type DocumentIssuer,
} from '@/modules/documents';
import type { Finding } from '@/ai/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdminAuth();
    if (!auth.ok) return auth.response!;

    const investigation = await getInvestigation(params.id);
    if (!investigation) {
      return NextResponse.json({ success: false, error: 'Investigation not found' }, { status: 404 });
    }

    const [reports, findings, verification] = await Promise.all([
      listReports(params.id),
      listFindings(params.id),
      getVerificationResult(params.id),
    ]);

    const issuer: DocumentIssuer | undefined = auth.userId
      ? { id: auth.userId, name: 'Administrator', role: auth.role ?? 'admin' }
      : undefined;

    const period = {
      start: new Date(investigation.started_at),
      end: investigation.finished_at ? new Date(investigation.finished_at) : new Date(),
      label: investigation.investigation_number,
    };

    // Determine document kind: member verification gets the verification
    // template; everything else gets the general investigation report.
    const isMemberVerification = investigation.scope === 'member_verification' && verification;
    const kind = isMemberVerification ? 'ai_member_verification_report' : 'ai_investigation_report';

    const envelope = await buildEnvelope({
      kind,
      title: isMemberVerification
        ? `Member Verification Report — ${verification.member_name ?? verification.member_number ?? ''}`
        : `AI Intelligence Investigation — ${investigation.investigation_number}`,
      eyebrow: isMemberVerification ? 'Member Verification Report' : 'Investigation Report',
      period,
      issuer,
      classification: 'Confidential',
    });

    let data: DocumentData;
    if (isMemberVerification) {
      const v = verification;
      data = {
        kind: 'ai_member_verification_report',
        verification: {
          investigationId: investigation.id,
          investigationNumber: investigation.investigation_number,
          memberId: v.member_id,
          memberName: v.member_name,
          memberNumber: v.member_number,
          overallStatus: v.overall_status ?? 'verified',
          verificationScore: v.verification_score ?? 0,
          fieldsChecked: v.fields_checked ?? 0,
          fieldsVerified: v.fields_verified ?? 0,
          fieldsMismatched: v.fields_mismatched ?? 0,
          fieldResults: (v.field_results ?? []) as MemberVerificationReportData['fieldResults'],
          sections: v.sections ?? [],
          geminiAssessment: v.gemini_assessment,
          openrouterAssessment: v.openrouter_assessment,
          finalEvaluation: v.final_evaluation,
        } as MemberVerificationReportData,
      };
    } else {
      // Aggregate findings across all provider reports (deterministic + AI).
      const allFindings: Finding[] = findings.length > 0
        ? (findings as unknown as Finding[])
        : reports.flatMap((r) => (r.findings ?? []) as Finding[]);

      // Prefer the most complete report summary (Gemini > OpenRouter > deterministic).
      const primaryReport = reports.find((r) => r.provider === 'gemini')
        ?? reports.find((r) => r.provider === 'openrouter')
        ?? reports[0];

      data = {
        kind: 'ai_investigation_report',
        investigation: {
          investigationId: investigation.id,
          investigationNumber: investigation.investigation_number,
          scope: investigation.scope,
          status: investigation.status,
          aiStatus: investigation.ai_status,
          depth: investigation.depth,
          dualMode: investigation.dual_mode,
          startedAt: investigation.started_at,
          finishedAt: investigation.finished_at,
          overallScore: investigation.overall_score,
          recordsChecked: investigation.records_checked,
          modulesInvestigated: investigation.modules_investigated ?? [],
          summary: primaryReport?.summary ?? 'Investigation completed.',
          counts: {
            critical: investigation.critical_count ?? 0,
            high: investigation.high_count ?? 0,
            medium: investigation.medium_count ?? 0,
            low: investigation.low_count ?? 0,
            info: investigation.info_count ?? 0,
            unresolved: investigation.unresolved_count ?? 0,
          },
          findings: allFindings,
          recommendations: primaryReport?.recommendations ?? [],
          rootCauseAnalysis: primaryReport?.root_cause_analysis,
        } as InvestigationReportData,
      };
    }

    const doc = await generateDocument({ kind, envelope, data, orientation: 'landscape' });

    // Record the generation in the audit ledger (best-effort).
    await recordGeneration(envelope, doc.buffer.length, issuer, {
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    const filename = `${investigation.investigation_number}.pdf`;
    return new NextResponse(new Uint8Array(doc.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(doc.buffer.length),
        'X-Document-Ref': envelope.documentNumber,
        'X-Auth-Hash': envelope.authHash,
      },
    });
  } catch (error) {
    console.error('[ai/investigations/[id]/pdf GET] error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to generate investigation PDF';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
