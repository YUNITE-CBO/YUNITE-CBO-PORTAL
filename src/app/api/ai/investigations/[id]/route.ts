/**
 * GET /api/ai/investigations/[id] — full investigation detail (admin+)
 *
 * Returns the investigation record + its reports + provider runs +
 * comparison (if present) + verification result (if a member verification).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '../../_guard';
import {
  getInvestigation,
  listReports,
  listProviderRuns,
  getComparison,
  getVerificationResult,
  listFindings,
} from '@/ai/persistence';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdminAuth();
    if (!auth.ok) return auth.response!;
    const investigation = await getInvestigation(params.id);
    if (!investigation) {
      return NextResponse.json({ success: false, error: 'Investigation not found' }, { status: 404 });
    }

    const [reports, runs, comparison, verification, findings] = await Promise.all([
      listReports(params.id),
      listProviderRuns(params.id),
      getComparison(params.id),
      getVerificationResult(params.id),
      listFindings(params.id),
    ]);

    return NextResponse.json({
      success: true,
      data: { investigation, reports, provider_runs: runs, comparison, verification, findings },
    });
  } catch (error: any) {
    console.error('[ai/investigations] fetch failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load investigation', message: error?.message || String(error) },
      { status: 500 },
    );
  }
}
