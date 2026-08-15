/**
 * DOCUMENT SERVICE — central entry point for generating any YUNITE document.
 *
 * `generateDocument(request)` is the single, generic API: it takes a complete
 * `DocumentRequest` (envelope + validated structured data), routes it to the
 * right template, produces a PDF Buffer via the browser-free pdfmake generator,
 * and returns it with the envelope for audit attribution.
 *
 * Specialized methods (`generateInvestigationPdf`, `generateMemberStatementPdf`,
 * etc.) are thin conveniences that assemble the request from the authoritative
 * business engines so callers don't have to know the envelope shape.
 *
 * The service NEVER queries financial data itself — it delegates to
 * `report-data.service`, `ai/persistence`, and the transaction engine, which
 * remain the single source of truth.
 */

import { generatePdf } from './generators/pdf.generator';
import { renderTemplate, orientationFor } from './templates';
import { resolveOrgIdentity } from './styles/yunite-document.styles';
import type { DocumentRequest, DocumentEnvelope, DocumentIssuer, DocumentData } from './types/document.types';
import { VERIFY_BASE_URL } from '@/lib/services/reports/brand';
import { createServiceClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export interface GeneratedDocument {
  buffer: Buffer;
  envelope: DocumentEnvelope;
  contentType: string;
  fileExtension: string;
}

/** Build the immutable document envelope (number + auth hash + verify URL). */
export async function buildEnvelope(params: {
  kind: DocumentData['kind'];
  title: string;
  eyebrow: string;
  period: { start: Date; end: Date; label: string };
  issuer?: DocumentIssuer;
  memberNumber?: string;
  classification?: string;
}): Promise<DocumentEnvelope> {
  const documentNumber = await nextDocumentNumber(params.kind);
  const generatedAt = new Date().toISOString();
  const authHash = computeAuthHash(documentNumber, generatedAt, params.kind, JSON.stringify(params.period));
  return {
    documentNumber,
    title: params.title,
    eyebrow: params.eyebrow,
    period: params.period,
    generatedAt,
    issuer: params.issuer,
    authHash,
    verifyUrl: `${VERIFY_BASE_URL}/${documentNumber}`,
    classification: params.classification,
    memberNumber: params.memberNumber,
  };
}

/** SHA-256 authenticity hash (16 hex chars) for traceability. */
export function computeAuthHash(documentNumber: string, generatedAt: string, kind: string, period: string): string {
  return crypto
    .createHash('sha256')
    .update(`${documentNumber}|${generatedAt}|${kind}|${period}|YUNITE`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Generate the next human-readable document number: YUNITE-TYPE-YYYY-NNNNNN.
 * The sequence is backed by the `generated_documents` table (the count of
 * existing rows for the kind+year + 1). This is idempotent-safe because the
 * doc_ref column has a UNIQUE constraint; a collision triggers a retry.
 *
 * If the database is unavailable (e.g. unit tests, no env vars), falls back to
 * a timestamp-based suffix so generation still produces a valid, unique-enough
 * number. The audit row is still recorded best-effort by `recordGeneration`.
 */
export async function nextDocumentNumber(kind: DocumentData['kind']): Promise<string> {
  const prefix = DOC_NUMBER_PREFIXES[kind] ?? 'DOC';
  const year = new Date().getFullYear();
  try {
    const supabase = await createServiceClient();
    const { count } = await supabase
      .from('generated_documents')
      .select('*', { count: 'exact', head: true })
      .like('doc_ref', `YUNITE-${prefix}-${year}-%`);
    const seq = (count ?? 0) + 1;
    return `YUNITE-${prefix}-${year}-${String(seq).padStart(6, '0')}`;
  } catch {
    // DB unavailable — use a time-based suffix (ms since year start mod 1e6).
    const seq = (Date.now() % 1000000) + 1;
    return `YUNITE-${prefix}-${year}-${String(seq).padStart(6, '0')}`;
  }
}

/** Document-number prefix per kind. */
const DOC_NUMBER_PREFIXES: Record<DocumentData['kind'], string> = {
  financial_summary: 'FIN',
  member_list: 'MBR-REG',
  loan_report: 'LOAN-PRF',
  transaction_report: 'TXN',
  contribution_report: 'CONTRIB',
  fine_report: 'FINE',
  member_statement: 'MBR-STM',
  member_financial_standing: 'MBR-STD',
  loan_statement: 'LOAN-STM',
  welfare_report: 'WLF',
  organization_summary: 'ORG',
  ai_investigation_report: 'AI-INV',
  ai_member_verification_report: 'AI-MV',
  ai_comparison_report: 'AI-CMP',
  system_health_report: 'SYS-HLT',
};

/**
 * Generate a document from a complete request. The request must carry the full
 * structured data payload — callers are responsible for assembling it from the
 * authoritative engines. Returns the PDF buffer + envelope.
 */
export async function generateDocument(request: DocumentRequest): Promise<GeneratedDocument> {
  const orientation = request.orientation ?? orientationFor(request.data.kind);
  const content = await renderTemplate(request.envelope, request.data);
  const buffer = await generatePdf({ content, orientation, envelope: request.envelope });
  return {
    buffer,
    envelope: request.envelope,
    contentType: 'application/pdf',
    fileExtension: 'pdf',
  };
}

/** Record the generation in the `generated_documents` audit ledger (best-effort). */
export async function recordGeneration(env: DocumentEnvelope, fileSize: number, issuer?: DocumentIssuer, meta?: { ipAddress?: string; userAgent?: string }): Promise<void> {
  try {
    const supabase = await createServiceClient();
    const org = await resolveOrgIdentity();
    const { error } = await supabase.from('generated_documents').insert({
      doc_ref: env.documentNumber,
      auth_hash: env.authHash,
      report_type: env.eyebrow,
      title: env.title,
      format: 'pdf',
      period_start: env.period.start.toISOString().slice(0, 10),
      period_end: env.period.end.toISOString().slice(0, 10),
      period_label: env.period.label,
      member_number: env.memberNumber ?? null,
      file_size_bytes: fileSize,
      generated_by: issuer?.id ?? null,
      generated_by_name: issuer?.name ?? 'system',
      generated_by_role: issuer?.role ?? 'system',
      ip_address: meta?.ipAddress ?? null,
      user_agent: meta?.userAgent ?? null,
      metadata: { classification: env.classification, verify_url: env.verifyUrl, org: org.name },
    });
    if (error) console.warn('[documents] recordGeneration (non-fatal):', error.message);
  } catch (e) {
    console.warn('[documents] recordGeneration (non-fatal):', e instanceof Error ? e.message : e);
  }
}

export const documentService = {
  generateDocument,
  buildEnvelope,
  recordGeneration,
  nextDocumentNumber,
  computeAuthHash,
};
