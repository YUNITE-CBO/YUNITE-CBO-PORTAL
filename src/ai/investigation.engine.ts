/**
 * INVESTIGATION ENGINE — orchestrator.
 *
 * Pipeline (matches the implementation principle):
 *
 *   DATABASE
 *     → DETERMINISTIC YUNITE ENGINES (always run; AI-independent)
 *     → CONTROLLED INVESTIGATION TOOLS (read-only, PII-sanitized)
 *     → GEMINI + OPENROUTER (independent, parallel, blind to each other)
 *     → COMPARISON ENGINE (reconcile)
 *     → EVIDENCE VALIDATION (deterministic confirms/disputes AI)
 *     → FINAL YUNITE INTELLIGENCE REPORT
 *
 * Failure handling:
 *  - If Gemini fails → OpenRouter fallback (failover manager).
 *  - If OpenRouter fails → Gemini fallback.
 *  - If both fail → deterministic findings are still persisted and the AI
 *    phase is marked 'unavailable' (the underlying investigation is NEVER
 *    lost). AI is an intelligence layer, not a dependency.
 *
 * For dual mode (full_system / member_verification), BOTH providers run in
 * parallel and the comparison engine runs. For single-provider scopes, the
 * failover manager runs ONE provider with fallback.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { geminiProvider, openRouterProvider } from './providers';
import { investigateWithFailover } from './providers/failover';
import { getHealth, snapshotHealth } from './providers/health-monitor';
import { buildToolsPayload } from './tools';
import {
  runDatabaseConsistency,
  runCrossModuleConsistency,
  runBusinessRuleConsistency,
  runApiConsistency,
  runFinancialConsistency,
  runMemberVerification,
  runMemberForensic,
} from './engines';
import { resolveDualMode, isAiInvestigationsEnabled } from './settings';
import { compareReports } from './comparison.engine';
import { buildFinalReport, computeScore, type FinalReport } from './report.engine';
import {
  createInvestigation,
  finalizeInvestigation,
  persistComparison,
  persistReport,
  persistVerification,
  persistHealthSnapshots,
  recordProviderRun,
} from './persistence';
import type {
  ComparisonResult,
  DualModeOption,
  Finding,
  InvestigationContext,
  InvestigationDepth,
  InvestigationScope,
  ProviderHealthSnapshot,
  ProviderReport,
} from './types';

export interface InvestigationResult {
  investigation_id: string;
  investigation_number: string;
  scope: InvestigationScope;
  depth?: InvestigationDepth;
  dual_mode?: DualModeOption;
  ai_status: 'completed' | 'partial' | 'unavailable';
  overall_score: number;
  findings: Finding[];
  gemini_report?: ProviderReport;
  openrouter_report?: ProviderReport;
  comparison?: ComparisonResult;
  final_report: FinalReport;
  health: ProviderHealthSnapshot[];
}

export interface RunInvestigationOptions {
  scope: InvestigationScope;
  memberId?: string;
  initiatedBy?: string;
  trigger?: 'manual' | 'scheduled' | 'cron' | 'api';
  depth?: InvestigationDepth;
  dualMode?: DualModeOption;
}

function pickDeterministic(scope: InvestigationScope): { run: () => Promise<{ findings: Finding[]; records_checked: number; checks_performed: number }> } {
  switch (scope) {
    case 'database': return { run: runDatabaseConsistency };
    case 'cross_module': return { run: runCrossModuleConsistency };
    case 'business_rules': return { run: runBusinessRuleConsistency };
    case 'api': return { run: runApiConsistency };
    case 'financial': return { run: runFinancialConsistency };
    case 'member_verification': return { run: async () => ({ findings: [], records_checked: 0, checks_performed: 0 }) }; // member-specific below
    case 'full_system': return { run: runFullSystemDeterministic };
  }
}

async function runFullSystemDeterministic(): Promise<{ findings: Finding[]; records_checked: number; checks_performed: number }> {
  const [db, xm, br, api, fin] = await Promise.all([
    runDatabaseConsistency(),
    runCrossModuleConsistency(),
    runBusinessRuleConsistency(),
    runApiConsistency(),
    runFinancialConsistency(),
  ]);
  return {
    findings: [...db.findings, ...xm.findings, ...br.findings, ...api.findings, ...fin.findings],
    records_checked: db.records_checked + xm.records_checked + br.records_checked + api.records_checked + fin.records_checked,
    checks_performed: db.checks_performed + xm.checks_performed + br.checks_performed + api.checks_performed + fin.checks_performed,
  };
}

const DUAL_SCOPES: Set<InvestigationScope> = new Set<InvestigationScope>(['full_system', 'member_verification']);

/**
 * Run an investigation. `scope` selects the deterministic engine + tools
 * payload. When `scope` is member_verification, `memberId` is required.
 *
 * `depth` (req. #25): quick / standard / deep / forensic. Member verification
 * defaults to 'deep'; 'forensic' adds the full member data graph + layer trace.
 * `dualMode` (req. #8): auto (honor AI_DUAL_MODE env) / single / dual.
 *
 * Maintains backward compatibility: the old positional signature
 * `runInvestigation(scope, memberId?, initiatedBy?, trigger?)` still works.
 */
export async function runInvestigation(
  scopeOrOpts: InvestigationScope | RunInvestigationOptions,
  legacyMemberId?: string,
  legacyInitiatedBy?: string,
  legacyTrigger: 'manual' | 'scheduled' | 'cron' | 'api' = 'manual',
): Promise<InvestigationResult> {
  // Normalize the overloaded signature.
  const opts: RunInvestigationOptions = typeof scopeOrOpts === 'string'
    ? { scope: scopeOrOpts, memberId: legacyMemberId, initiatedBy: legacyInitiatedBy, trigger: legacyTrigger }
    : scopeOrOpts;

  const { scope, memberId, initiatedBy, trigger } = opts;
  const depth: InvestigationDepth = opts.depth ?? (scope === 'member_verification' ? 'deep' : 'standard');
  const dualMode: DualModeOption = opts.dualMode ?? 'auto';

  const { id: investigation_id, investigation_number } = await createInvestigation(scope, trigger ?? 'manual', initiatedBy, depth, dualMode);

  // 1. Deterministic phase (AI-independent; always runs).
  let deterministic: { findings: Finding[]; records_checked: number; checks_performed: number } = { findings: [], records_checked: 0, checks_performed: 0 };
  try {
    if (scope === 'member_verification' && memberId) {
      // Deep/forensic member verification uses the full data graph + layer trace.
      const mv = depth === 'quick'
        ? await runMemberVerification(memberId)
        : await runMemberForensic(memberId);
      deterministic = { findings: mv.findings, records_checked: mv.result.fields_checked, checks_performed: mv.result.fields_checked };
      await persistVerification(investigation_id, mv.result);
    } else {
      deterministic = await pickDeterministic(scope).run();
    }
  } catch (e) {
    console.warn('[ai/investigation] deterministic phase failed:', e instanceof Error ? e.message : e);
  }

  // 2. Build the controlled, sanitized tools payload.
  const tools_payload = await buildToolsPayload(scope, memberId).catch((e) => {
    console.warn('[ai/investigation] tools payload failed:', e instanceof Error ? e.message : e);
    return { error: 'tools_payload_unavailable' } as Record<string, unknown>;
  });

  const ctx: InvestigationContext = {
    investigation_id,
    scope,
    member_id: memberId,
    depth,
    dual_mode: dualMode,
    deterministic_findings: deterministic.findings,
    tools_payload,
  };

  // 3. AI phase. Dual scopes run BOTH providers independently (blind).
  let aiStatus: 'completed' | 'partial' | 'unavailable' = 'unavailable';
  let geminiReport: ProviderReport | undefined;
  let openrouterReport: ProviderReport | undefined;
  let comparison: ComparisonResult | undefined;
  let fallbackUsed = false;
  let fallbackReason: string | undefined;
  let geminiReportId: string | undefined;
  let openrouterReportId: string | undefined;
  let deterministicReportId: string | undefined;

  // Persist the deterministic report so it is available independently.
  const detReport: ProviderReport = {
    provider: 'deterministic',
    scope,
    modules_investigated: Object.keys(tools_payload),
    records_checked: deterministic.records_checked,
    checks_performed: deterministic.checks_performed,
    findings: deterministic.findings,
    summary: `Deterministic ${scope} investigation (${depth}): ${deterministic.findings.length} finding(s) from ${deterministic.checks_performed} check(s).`,
    recommendations: [],
    report_json: { deterministic: true, depth, dual_mode: dualMode, counts: computeScore(deterministic.findings).counts },
  };
  deterministicReportId = await persistReport(investigation_id, detReport);

  // Resolve dual mode: explicit 'dual' → always dual (any scope, user
  // override); 'single' → never; 'auto' → dual only when (a) the scope is a
  // dual-capable scope (full_system / member_verification) AND (b) the
  // effective mode resolves to 'dual'. The effective mode for 'auto' comes
  // from the DB `ai.dual_mode` setting (source of truth) then the
  // AI_DUAL_MODE env var (deployment-time fallback).
  const effectiveDual = await resolveDualMode(dualMode);
  const dual = effectiveDual === 'dual' && (dualMode === 'dual' || DUAL_SCOPES.has(scope));

  // Master switch (ai.investigations.enabled): when OFF, skip the AI provider
  // phase entirely. Deterministic findings are still produced + persisted; the
  // investigation is marked 'unavailable' for the AI dimension. Default ON.
  const aiEnabled = await isAiInvestigationsEnabled();

  try {
    if (!aiEnabled) {
      aiStatus = 'unavailable';
    } else if (dual) {
      // Run both INDEPENDENTLY in parallel. Neither sees the other's result.
      const results = await Promise.allSettled([
        geminiProvider.investigate(ctx),
        openRouterProvider.investigate(ctx),
      ]);

      if (results[0].status === 'fulfilled') {
        geminiReport = results[0].value;
        geminiReportId = await persistReport(investigation_id, geminiReport);
        await recordProviderRun(investigation_id, {
          provider: 'gemini', role: 'primary', status: 'success',
          latency_ms: geminiReport.latency_ms ?? 0, is_fallback: false, model: geminiReport.model,
        });
      } else {
        const reason = results[0].reason instanceof Error ? results[0].reason.message : String(results[0].reason);
        await recordProviderRun(investigation_id, {
          provider: 'gemini', role: 'primary', status: 'failed',
          latency_ms: 0, is_fallback: false, fallback_reason: 'failed', error_message: reason,
        });
      }
      if (results[1].status === 'fulfilled') {
        openrouterReport = results[1].value;
        openrouterReportId = await persistReport(investigation_id, openrouterReport);
        await recordProviderRun(investigation_id, {
          provider: 'openrouter', role: 'primary', status: 'success',
          latency_ms: openrouterReport.latency_ms ?? 0, is_fallback: false, model: openrouterReport.model,
        });
      } else {
        const reason = results[1].reason instanceof Error ? results[1].reason.message : String(results[1].reason);
        await recordProviderRun(investigation_id, {
          provider: 'openrouter', role: 'primary', status: 'failed',
          latency_ms: 0, is_fallback: false, fallback_reason: 'failed', error_message: reason,
        });
      }

      aiStatus = geminiReport && openrouterReport ? 'completed' : geminiReport || openrouterReport ? 'partial' : 'unavailable';

      // If both succeeded (or at least one), run comparison.
      if (geminiReport && openrouterReport) {
        const cmp = compareReports(
          investigation_id,
          { gemini: geminiReportId, openrouter: openrouterReportId, deterministic: deterministicReportId },
          geminiReport.findings,
          openrouterReport.findings,
          deterministic.findings,
        );
        comparison = cmp;
        await persistComparison(cmp).catch(() => undefined);
      } else if (process.env.AI_SINGLE_FALLBACK_ON_DUAL_FAIL === 'true') {
        // If one provider failed in dual mode, attempt failover for the failed one.
        const failedGemini = !geminiReport;
        const fail = await investigateWithFailover(
          failedGemini ? openRouterProvider : geminiProvider,
          failedGemini ? geminiProvider : openRouterProvider,
          ctx,
        ).catch(() => null);
        if (fail) {
          if (fail.report.provider === 'gemini') { geminiReport = fail.report; geminiReportId = await persistReport(investigation_id, geminiReport); }
          else { openrouterReport = fail.report; openrouterReportId = await persistReport(investigation_id, openrouterReport); }
          await recordProviderRun(investigation_id, fail.run);
          fallbackUsed = fail.fallback_used;
          fallbackReason = fail.fallback_reason;
          aiStatus = geminiReport && openrouterReport ? 'completed' : 'partial';
        }
      }
    } else {
      // Single-provider-with-failover path.
      const fail = await investigateWithFailover(geminiProvider, openRouterProvider, ctx).catch((e) => {
        const both = e as Error & { primaryRun?: any; secondaryRun?: any };
        return { error: both, run: both.primaryRun };
      });
      if (fail && 'report' in fail) {
        const report = fail.report;
        if (report.provider === 'gemini') geminiReport = report;
        else openrouterReport = report;
        await persistReport(investigation_id, report);
        await recordProviderRun(investigation_id, fail.run);
        fallbackUsed = fail.fallback_used;
        fallbackReason = fail.fallback_reason;
        aiStatus = 'completed';
      } else {
        // Both failed → deterministic-only.
        aiStatus = 'unavailable';
      }
    }
  } catch (e) {
    console.warn('[ai/investigation] AI phase failed:', e instanceof Error ? e.message : e);
    aiStatus = 'unavailable';
  }

  // 4. Merge findings: deterministic (confirmed) + AI (unverified) + comparison.
  const merged: Finding[] = [...deterministic.findings];
  if (geminiReport) merged.push(...geminiReport.findings.map((f) => ({ ...f, sources: ['gemini'] })));
  if (openrouterReport) merged.push(...openrouterReport.findings.map((f) => ({ ...f, sources: ['openrouter'] })));
  if (comparison) {
    merged.push(...comparison.agreements, ...comparison.gemini_only, ...comparison.openrouter_only, ...comparison.disagreements.map((d) => d.gemini), ...comparison.disagreements.map((d) => d.openrouter));
  }
  // De-duplicate by finding_code (deterministic first wins).
  const seen = new Set<string>();
  const deduped = merged.filter((f) => {
    const k = `${f.finding_code}:${f.sources.join(',')}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const { score, counts, unresolved } = computeScore(deduped);
  const summary = aiStatus === 'unavailable'
    ? `Deterministic-only ${scope} investigation: ${deterministic.findings.length} confirmed finding(s). AI analysis unavailable.`
    : `${scope} investigation: ${deduped.length} finding(s) across deterministic + ${[geminiReport ? 'Gemini' : null, openrouterReport ? 'OpenRouter' : null].filter(Boolean).join(' + ')}${comparison ? ' + comparison' : ''}.`;
  const final_report = buildFinalReport(investigation_id, deduped, summary);

  // 5. Persist + health snapshots.
  const health: ProviderHealthSnapshot[] = await Promise.all([
    getHealth(geminiProvider).catch(() => ({ provider: 'gemini' as const, status: 'unknown' as const, availability_pct: 0, success_count: 0, failure_count: 0, timeout_count: 0, rate_limited_count: 0, fallback_count: 0 })),
    getHealth(openRouterProvider).catch(() => ({ provider: 'openrouter' as const, status: 'unknown' as const, availability_pct: 0, success_count: 0, failure_count: 0, timeout_count: 0, rate_limited_count: 0, fallback_count: 0 })),
  ]);
  await persistHealthSnapshots(health).catch(() => undefined);

  await finalizeInvestigation(investigation_id, {
    status: aiStatus === 'unavailable' ? 'partial' : 'completed',
    deterministic_checks_count: deterministic.checks_performed,
    deterministic_findings_count: deterministic.findings.length,
    records_checked: deterministic.records_checked,
    modules_investigated: Object.keys(tools_payload),
    ai_status: aiStatus,
    fallback_used: fallbackUsed,
    fallback_reason: fallbackReason,
    critical_count: counts.critical,
    high_count: counts.high,
    medium_count: counts.medium,
    low_count: counts.low,
    info_count: counts.info,
    unresolved_count: unresolved,
    overall_score: score,
  }).catch(() => undefined);

  // 6. Alert on CRITICAL findings (best-effort; never blocks the result).
  if (counts.critical > 0) {
    const { alertCriticalFindings } = await import('./alerting.service');
    await alertCriticalFindings(investigation_id, deduped).catch(() => undefined);
  }

  return {
    investigation_id,
    investigation_number,
    scope,
    depth,
    dual_mode: dualMode,
    ai_status: aiStatus,
    overall_score: score,
    findings: deduped,
    gemini_report: geminiReport,
    openrouter_report: openrouterReport,
    comparison,
    final_report,
    health,
  };
}

/** Trigger a critical alert notification when a critical finding is found. */
export async function shouldAlertCritical(findings: Finding[]): Promise<Finding[]> {
  return findings.filter((f) => f.severity === 'critical' && f.verification_status !== 'rejected');
}

// Lazy import of the Supabase client for optional alerting — kept here to
// avoid circular imports.
export { createServiceClient };
