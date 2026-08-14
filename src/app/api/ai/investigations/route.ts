/**
 * GET  /api/ai/investigations  — list recent investigations (admin+)
 * POST /api/ai/investigations  — run a new investigation (admin+)
 *
 * Body for POST:
 *   { scope: InvestigationScope, memberId?: string }
 *
 * scope determines which deterministic engine + AI providers run. The dual
 * scopes (full_system, member_verification) run BOTH providers independently
 * then the comparison engine. Single scopes run one provider with failover.
 * Deterministic findings are ALWAYS produced even if both AI providers fail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '../_guard';
import { runInvestigation } from '@/ai';
import { listInvestigations } from '@/ai/persistence';
import type { InvestigationScope } from '@/ai/types';

const VALID_SCOPES: Set<InvestigationScope> = new Set<InvestigationScope>([
  'database', 'cross_module', 'business_rules', 'api', 'financial',
  'member_verification', 'full_system',
]);

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response!;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const scope = searchParams.get('scope') || undefined;
  const data = await listInvestigations(limit, scope);
  return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response!;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const scope = body?.scope as InvestigationScope;
  if (!scope || !VALID_SCOPES.has(scope)) {
    return NextResponse.json({ success: false, error: `Invalid scope. Valid: ${Array.from(VALID_SCOPES).join(', ')}` }, { status: 400 });
  }

  const memberId = scope === 'member_verification' ? body?.memberId : body?.memberId;
  if (scope === 'member_verification' && !memberId) {
    return NextResponse.json({ success: false, error: 'memberId is required for member_verification scope' }, { status: 400 });
  }

  try {
    const result = await runInvestigation(scope, memberId, auth.userId, 'manual');
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[ai/investigations] run failed:', error);
    return NextResponse.json(
      { success: false, error: 'Investigation failed', message: error?.message || String(error) },
      { status: 500 },
    );
  }
}
