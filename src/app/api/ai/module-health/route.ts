/**
 * GET /api/ai/module-health — module-level health map (req. #20, #21).
 *
 * Computes the per-module health (healthy / warning / inconsistent) from the
 * findings of a given investigation (or the latest one if no id is supplied).
 * Powers the clickable module map in the AI Intelligence dashboard.
 *
 * Admin+ only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '../_guard';
import { buildModuleHealthMap } from '@/ai';
import { listFindings, listInvestigations } from '@/ai/persistence';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response!;

  const { searchParams } = new URL(request.url);
  let investigationId = searchParams.get('investigationId');

  try {
    // Default to the latest investigation if none specified.
    if (!investigationId) {
      const recent = await listInvestigations(1);
      if (!recent.length) {
        return NextResponse.json({ success: true, data: { modules: [], investigation_id: null } });
      }
      investigationId = recent[0].id as string;
    }

    const findings = await listFindings(investigationId);
    const modules = buildModuleHealthMap(findings);
    return NextResponse.json({ success: true, data: { modules, investigation_id: investigationId, findings_count: findings.length } });
  } catch (error: any) {
    console.error('[ai/module-health] failed:', error);
    return NextResponse.json(
      { success: false, error: 'Module health map failed', message: error?.message || String(error) },
      { status: 500 },
    );
  }
}
