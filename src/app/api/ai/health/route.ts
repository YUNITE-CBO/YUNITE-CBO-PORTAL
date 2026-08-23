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
import { readAiSettings } from '@/ai/settings';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response!;
  try {
    const [gemini, openrouter, latestSnapshots, recentRuns, aiSettings] = await Promise.all([
      getHealth(geminiProvider).catch(() => ({ provider: 'gemini' as const, status: 'unknown' as const, availability_pct: 0, success_count: 0, failure_count: 0, timeout_count: 0, rate_limited_count: 0, fallback_count: 0 })),
      getHealth(openRouterProvider).catch(() => ({ provider: 'openrouter' as const, status: 'unknown' as const, availability_pct: 0, success_count: 0, failure_count: 0, timeout_count: 0, rate_limited_count: 0, fallback_count: 0 })),
      getLatestHealth(),
      listProviderRuns(undefined, 20),
      readAiSettings(),
    ]);

    // The dashboard cards reflect the CURRENT state of the system, which is the
    // LATEST completed investigation's severity counts. Previously this summed
    // counts across the last 20 investigations, which accumulated stale findings
    // (the same issue re-discovered on every run) so the numbers only ever grew
    // and never reflected fixes. The latest investigation is the source of truth
    // for "what is wrong right now".
    const supabase = await createServiceClient();
    const { data: recentInvs } = await supabase
      .from('ai_investigations')
      .select('id, investigation_number, scope, status, ai_status, overall_score, critical_count, high_count, medium_count, low_count, info_count, unresolved_count, started_at')
      .order('started_at', { ascending: false })
      .limit(20);

    let latestScore = 100;
    let latestId: string | null = null;
    let latestNumber: string | null = null;
    let latestStartedAt: string | null = null;
    let latestScope: string | null = null;
    // Current state = the latest investigation (first row).
    let curCritical = 0, curHigh = 0, curMedium = 0, curLow = 0, curUnresolved = 0;
    // Accumulated total across the window (kept for transparency, not the cards).
    let accCritical = 0, accHigh = 0, accMedium = 0, accLow = 0, accUnresolved = 0;
    if (recentInvs && recentInvs.length) {
      const latest = recentInvs[0];
      latestScore = latest.overall_score ?? 100;
      latestId = latest.id;
      latestNumber = latest.investigation_number;
      latestStartedAt = latest.started_at;
      latestScope = latest.scope;
      curCritical = latest.critical_count ?? 0;
      curHigh = latest.high_count ?? 0;
      curMedium = latest.medium_count ?? 0;
      curLow = latest.low_count ?? 0;
      curUnresolved = latest.unresolved_count ?? 0;
      for (const inv of recentInvs) {
        accCritical += inv.critical_count ?? 0;
        accHigh += inv.high_count ?? 0;
        accMedium += inv.medium_count ?? 0;
        accLow += inv.low_count ?? 0;
        accUnresolved += inv.unresolved_count ?? 0;
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
        // `recent_totals` is the CURRENT STATE (latest investigation only) so the
        // cards update when problems are fixed. `accumulated_totals` is the old
        // sum-across-20 figure, kept for the history view only.
        recent_totals: {
          critical: curCritical, high: curHigh, medium: curMedium, low: curLow, unresolved: curUnresolved,
        },
        accumulated_totals: {
          critical: accCritical, high: accHigh, medium: accMedium, low: accLow, unresolved: accUnresolved,
        },
        latest_investigation: latestId
          ? { id: latestId, investigation_number: latestNumber, scope: latestScope, started_at: latestStartedAt }
          : null,
        recent_provider_runs: recentRuns,
        configured: {
          primary: process.env.AI_PROVIDER || 'gemini',
          gemini_model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
          openrouter_model: process.env.OPENROUTER_MODEL || '(unset)',
          // DB `ai.dual_mode` is the source of truth (migration 033); fall back to
          // the AI_DUAL_MODE env var when the setting row is absent.
          dual_mode: aiSettings['ai.dual_mode'] === 'true' || (aiSettings['ai.dual_mode'] == null && process.env.AI_DUAL_MODE === 'true'),
          dual_mode_source: aiSettings['ai.dual_mode'] != null ? 'setting' : 'env',
        },
        ai_settings: aiSettings,
      },
    });
  } catch (error: any) {
    console.error('[ai/health] fetch failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load AI health', message: error?.message || String(error) },
      { status: 500 },
    );
  }
}
