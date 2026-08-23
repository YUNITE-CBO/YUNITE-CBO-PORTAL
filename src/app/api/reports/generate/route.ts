import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  documentExportService,
  resolvePeriod,
  REPORT_TYPES,
  type ReportType,
  type DocumentFormat,
} from '@/lib/services/reports';
import { getAuthenticatedUser } from '@/lib/auth/server-auth';
import { getRoleLevel } from '@/lib/auth/authorization';

const generateSchema = z.object({
  type: z.enum(REPORT_TYPES as [ReportType, ...ReportType[]]),
  format: z.enum(['pdf', 'csv', 'html']).default('pdf'),
  date_range: z.string().default('all_time'),
  member_id: z.string().uuid().optional(),
});

function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60);
}

function currentUserDisplay(user: { email: string; role: string }): { id: string; name: string; role: string } {
  return { id: 'portal', name: user.email, role: user.role };
}

function buildResponse(record: {
  contentType: string;
  fileExtension: string;
  title: string;
  ref: string;
  hash: string;
  content: Buffer | string;
}): NextResponse {
  const headers = new Headers({
    'Content-Type': record.contentType,
    'Content-Disposition': `attachment; filename="${safeName(record.title)}_${record.ref}.${record.fileExtension}"`,
    'X-Document-Ref': record.ref,
    'X-Document-Hash': record.hash,
    'Cache-Control': 'no-store',
  });
  const body = Buffer.isBuffer(record.content) ? record.content : String(record.content);
  // @ts-ignore — Next accepts Buffer via Uint8Array
  return new NextResponse(body, { status: 200, headers });
}

/**
 * POST /api/reports/generate
 * Generates a branded, certified bank-like document (PDF/CSV/HTML) and
 * returns it as a download. Every generation is recorded in
 * generated_documents for traceability (doc_ref + auth_hash).
 *
 * Auth: any authenticated portal user (staff+). Reports are read-only
 * views of data the user can already see in the dashboard.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    if (getRoleLevel(user.role) < getRoleLevel('staff')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions to export reports' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { type, format, date_range, member_id } = parsed.data;
    if (type === 'member_statement' && !member_id) {
      return NextResponse.json({ success: false, error: 'member_statement requires member_id' }, { status: 400 });
    }

    const record = await documentExportService.generate({
      type,
      format: format as DocumentFormat,
      period: resolvePeriod(date_range),
      memberId: member_id,
      generatedBy: currentUserDisplay(user),
      req: request,
    });

    return buildResponse(record);
  } catch (error) {
    console.error('[reports/generate POST] error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to generate document';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * GET /api/reports/generate
 * Convenience download via query string (so the dashboard can use a plain
 * <a href> or window.location). Same auth + same traceability.
 * ?type=member_list&format=pdf&date_range=this_month&member_id=<uuid>
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    if (getRoleLevel(user.role) < getRoleLevel('staff')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions to export reports' }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const type = sp.get('type') as ReportType | null;
    const format = (sp.get('format') as DocumentFormat | null) || 'pdf';
    const date_range = sp.get('date_range') || 'all_time';
    const member_id = sp.get('member_id') || undefined;

    if (!type || !REPORT_TYPES.includes(type)) {
      return NextResponse.json({ success: false, error: 'Invalid report type' }, { status: 400 });
    }
    if (type === 'member_statement' && !member_id) {
      return NextResponse.json({ success: false, error: 'member_statement requires member_id' }, { status: 400 });
    }

    const record = await documentExportService.generate({
      type,
      format,
      period: resolvePeriod(date_range),
      memberId: member_id,
      generatedBy: currentUserDisplay(user),
      req: request,
    });

    return buildResponse(record);
  } catch (error) {
    console.error('[reports/generate GET] error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to generate document';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
// Bulk/all-members PDF generation can be slow. Capped at 60s to fit the
// Vercel Hobby function limit; Render ignores this.
export const maxDuration = 60;
