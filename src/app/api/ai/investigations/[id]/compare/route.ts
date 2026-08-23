/**
 * GET /api/ai/investigations/[id]/compare — the AI comparison for an
 * investigation (admin+).
 *
 * Returns the stored ComparisonResult: agreements, gemini_only,
 * openrouter_only, disagreements, verified findings, and human-review queue.
 * Returns 404 if the investigation didn't run both providers (single-scope
 * investigations have no comparison).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '../../../_guard';
import { getComparison } from '@/ai/persistence';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response!;

  try {
    const comparison = await getComparison(params.id);
    if (!comparison) {
      return NextResponse.json(
        { success: false, error: 'No comparison available (investigation did not run both providers)' },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: comparison });
  } catch (error: any) {
    console.error('[ai/investigations/compare] fetch failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load comparison', message: error?.message || String(error) },
      { status: 500 },
    );
  }
}
