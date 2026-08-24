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
import { waitUntil } from '@vercel/functions';
import { requireAdminAuth } from '../_guard';
import { listInvestigations } from '@/ai/persistence';
import { startInvestigation } from './background';
import type { InvestigationScope, InvestigationDepth, DualModeOption } from '@/ai/types';
export const dynamic = 'force-dynamic';
// On-demand dual-provider investigations can take minutes. Capped at 60s
// to fit the Vercel Hobby function limit; Render ignores this.
export const maxDuration = 60;

const VALID_SCOPES: Set<InvestigationScope> = new Set<InvestigationScope>([
  'database', 'cross_module', 'business_rules', 'api', 'financial',
  'unity_fund', 'member_verification', 'full_system',
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

  // Depth + dual mode (req. #8, #25).
  const depth = body?.depth as InvestigationDepth | undefined;
  const dualMode = body?.dualMode as DualModeOption | undefined;
  if (depth && !['quick', 'standard', 'deep', 'forensic'].includes(depth)) {
    return NextResponse.json({ success: false, error: 'Invalid depth. Valid: quick, standard, deep, forensic' }, { status: 400 });
  }
  if (dualMode && !['auto', 'single', 'dual'].includes(dualMode)) {
    return NextResponse.json({ success: false, error: 'Invalid dualMode. Valid: auto, single, dual' }, { status: 400 });
  }

  // Two-phase (same pattern as /api/cron/ai-investigations). A manual dual
  // investigation can take minutes, but Vercel kills the function at
  // maxDuration and returns its plain-text error page — the dashboard then
  // dies on res.json() with "JSON.parse: unexpected character at line 1
  // column 1". FAST PHASE: validate (above) -> 202. BACKGROUND PHASE: the
  // engine creates + finalizes the ai_investigations row; the dashboard
  // polls History and auto-opens it when it appears.
  startInvestigation({ scope, memberId, initiatedBy: auth.userId, trigger: 'manual', depth, dualMode });
  waitUntil(backgroundWork());

  return NextResponse.json(
    {
      success: true,
      data: {
        accepted: true,
        scope,
        note: 'Investigation is running in the background; it appears in History and updates as it completes.',
      },
    },
    { status: 202 },
  );
}

// waitUntil needs the in-flight promise; it lives inside background.ts.
async function backgroundWork(): Promise<void> {
  const { _awaitBackgroundWork } = await import('./background');
  await _awaitBackgroundWork();
}
