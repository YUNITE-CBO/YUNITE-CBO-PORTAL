/**
 * GET /api/ai/health — AI provider health overview (admin+).
 *
 * Returns live provider health (from the in-memory health monitor) plus the
 * latest persisted health snapshots, recent provider runs, and an overall
 * system intelligence score. Powers the top of the AI Intelligence dashboard.
 */

import { NextResponse } from 'next/server';
import { requireAdminAuth } from '../_guard';
import { getHealth } from '@/ai';
import { geminiProvider, openRouterProvider } from '@/ai';
import { getLatestHealth, listProviderRuns } from '@/ai/persistence';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response!;

  const [gemini, openrouter, latestSnapshots, recentRuns] = await Promise.all([
    getHealth(geminiProvider).catch(() => ({ provider: 'gemini' as const, status: 'unknown' as const, availability_pct: 0, success_count: 0, failure_count: 0, timeout_count: 0, rate_limited_count: 0, fallback_count: 0 })),
    getHealth(openRouterProvider).catch(() => ({ provider: 'openrouter' as const, status: 'unknown' as const, availability_pct: 0, success_count: 0, failure_count: 0, timeout_count: 0, rate_limited_count: 0, fallback_count: 0 })),
    getLatestHealth(),
    listProviderRuns(undefined, 20),
  ]);

  // Recent critical/high findings across the last 20 investigations → overall score.
  const supabase = await createServiceClient();
  const { data: recentInvs } = await supabase
    .from('ai_investigations')
    .select('overall_score, critical_count, high_count, medium_count, low_count, unresolved_count')
    .order('started_at', { ascending: false })
    .limit(20);

  let latestScore = 100;
  let totalCritical = 0, totalHigh = 0, totalMedium = 0, totalLow = 0, totalUnresolved = 0;
  if (recentInvs && recentInvs.length) {
    latestScore = recentInvs[0].overall_score ?? 100;
    for (const inv of recentInvs) {
      totalCritical += inv.critical_count ?? 0;
      totalHigh += inv.high_count ?? 0;
      totalMedium += inv.medium_count ?? 0;
      totalLow += inv.low_count ?? 0;
      totalUnresolved += inv.unresolved_count ?? 0;
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      providers: {
        gemini: { live: gemini, latest_snapshot: latestSnapshots.gemini ?? null },
        openrouter: { live: openrouter, latest_snapshot: latestSnapshots.openrouter ?? null },
      },
      overall_intelligence_score: latestScore,
      recent_totals: {
        critical: totalCritical, high: totalHigh, medium: totalMedium, low: totalLow, unresolved: totalUnresolved,
      },
      recent_provider_runs: recentRuns,
      configured: {
        primary: process.env.AI_PROVIDER || 'gemini',
        gemini_model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        openrouter_model: process.env.OPENROUTER_MODEL || '(unset)',
        dual_mode: process.env.AI_DUAL_MODE === 'true',
      },
    },
  });
}
