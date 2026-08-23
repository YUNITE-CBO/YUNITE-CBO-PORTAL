/**
 * GET /api/ai/reports/[id] — single AI report incl. full findings JSON.
 *
 * Lets an admin inspect Gemini's OR OpenRouter's reasoning independently.
 * The report provider field disambiguates which AI produced it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '../../_guard';
import { getReport } from '@/ai/persistence';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdminAuth();
    if (!auth.ok) return auth.response!;
    const report = await getReport(params.id);
    if (!report) {
      return NextResponse.json({ success: false, error: 'Report not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: report });
  } catch (error: any) {
    console.error('[ai/reports] fetch failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load report', message: error?.message || String(error) },
      { status: 500 },
    );
  }
}
