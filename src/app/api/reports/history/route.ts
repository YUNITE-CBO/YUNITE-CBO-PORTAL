import { NextRequest, NextResponse } from 'next/server';
import { documentExportService } from '@/lib/services/reports';
import { getAuthenticatedUser } from '@/lib/auth/server-auth';
import { getRoleLevel } from '@/lib/auth/authorization';

/**
 * GET /api/reports/history?limit=50&offset=0
 * Returns the audit trail of generated documents (doc_ref, hash, type,
 * generated_by, etc.) — the traceability ledger.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    if (getRoleLevel(user.role) < getRoleLevel('staff')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(sp.get('limit') || '50'), 200);
    const offset = parseInt(sp.get('offset') || '0');

    const { rows, total } = await documentExportService.listHistory(limit, offset);
    return NextResponse.json({ success: true, data: rows, pagination: { limit, offset, total } });
  } catch (error) {
    console.error('[reports/history] error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load document history' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
