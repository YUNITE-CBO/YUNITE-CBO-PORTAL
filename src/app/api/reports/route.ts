import { NextRequest, NextResponse } from 'next/server';
import { documentExportService, REPORT_META, REPORT_TYPES } from '@/lib/services/reports';
import { getAuthenticatedUser } from '@/lib/auth/server-auth';
import { getRoleLevel } from '@/lib/auth/authorization';

/**
 * GET /api/reports
 * Returns the catalog of generatable bank-like documents (metadata only).
 * Public-ish to authenticated users (used by the dashboard UI).
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

    const catalog = REPORT_TYPES.map((t) => ({
      type: t,
      title: REPORT_META[t].title,
      description: REPORT_META[t].description,
      supports_member_scope: REPORT_META[t].supportsMemberScope,
      formats: ['pdf', 'csv'],
      date_ranges: ['today', 'this_week', 'this_month', 'last_month', 'this_quarter', 'this_year', 'last_year', 'all_time'],
    }));

    return NextResponse.json({ success: true, data: catalog });
  } catch (error) {
    console.error('[reports] error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load report catalog' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
