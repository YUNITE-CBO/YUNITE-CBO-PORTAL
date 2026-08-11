import { NextRequest, NextResponse } from 'next/server';
import { documentExportService, ORG_IDENTITY } from '@/lib/services/reports';

/**
 * GET /api/reports/verify/[ref]
 * PUBLIC document authenticity verification. Anyone holding a printed
 * document carrying a doc_ref can verify its authenticity against the
 * system's traceability ledger. No auth required (intentional — this is
 * the "can be authenticated in the system" requirement).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { ref: string } },
) {
  try {
    const ref = decodeURIComponent(params.ref || '');
    if (!ref) {
      return NextResponse.json({ success: false, error: 'Document reference is required' }, { status: 400 });
    }

    const record = await documentExportService.verifyByRef(ref);
    if (!record) {
      return NextResponse.json(
        {
          success: false,
          verified: false,
          error: 'Document not found in the system. This document may be forged or was never issued by Yunite Pamoja CBO.',
          organization: ORG_IDENTITY.name,
        },
        { status: 404 },
      );
    }

    const expired = record.expires_at ? new Date(record.expires_at).getTime() < Date.now() : false;

    return NextResponse.json({
      success: true,
      verified: !record.revoked && !expired,
      document: {
        ref: record.doc_ref,
        title: record.title,
        report_type: record.report_type,
        period: record.period_label,
        member_number: record.member_number,
        issued_by: record.generated_by_name,
        issued_at: record.generated_at,
        auth_hash: record.auth_hash,
        status: record.revoked ? 'revoked' : expired ? 'expired' : 'valid',
        expires_at: record.expires_at,
        revoked_at: record.revoked_at,
      },
      organization: ORG_IDENTITY.name,
    });
  } catch (error) {
    console.error('[reports/verify] error:', error);
    return NextResponse.json({ success: false, error: 'Verification failed' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
