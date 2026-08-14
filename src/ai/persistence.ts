/**
 * AI persistence layer.
 *
 * Thin, best-effort helpers that persist investigation/report/finding/evidence/
 * run/health/comparison/verification rows. Per YUNITE convention, optional
 * audit/history writes are wrapped so they never fail the main operation
 * (they only console.warn). Secrets are never persisted; only sanitized
 * operational metadata is stored.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import type {
  ComparisonResult,
  Finding,
  InvestigationScope,
  MemberVerificationResult,
  ProviderHealthSnapshot,
  ProviderName,
  ProviderReport,
  ProviderRunResult,
} from './types';

function invNumber(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `INV-${stamp}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function reportId(provider: string): string {
  return `RPT-${provider.toUpperCase()}-${uuidv4().slice(0, 8)}`;
}

export async function createInvestigation(
  scope: InvestigationScope,
  trigger: 'manual' | 'scheduled' | 'cron' | 'api' = 'manual',
  initiatedBy?: string,
  depth?: string,
  dualMode?: string,
): Promise<{ id: string; investigation_number: string }> {
  const supabase = await createServiceClient();
  const id = uuidv4();
  const investigation_number = invNumber();
  const { error } = await supabase.from('ai_investigations').insert({
    id,
    investigation_number,
    scope,
    trigger,
    status: 'running',
    primary_provider: 'gemini',
    fallback_provider: 'openrouter',
    initiated_by: initiatedBy ?? null,
    started_at: new Date().toISOString(),
    depth: depth ?? 'standard',
    dual_mode: dualMode ?? 'auto',
  });
  if (error) console.warn('[ai/persistence] createInvestigation:', error.message);
  return { id, investigation_number };
}

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export async function persistReport(
  investigation_id: string,
  report: ProviderReport,
): Promise<string> {
  const supabase = await createServiceClient();
  const id = uuidv4();
  const report_id = reportId(String(report.provider));
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of report.findings) counts[f.severity]++;
  const { error } = await supabase.from('ai_reports').insert({
    id,
    report_id,
    investigation_id,
    provider: report.provider,
    timestamp: new Date().toISOString(),
    scope: report.scope,
    modules_investigated: report.modules_investigated,
    records_checked: report.records_checked,
    checks_performed: report.checks_performed,
    findings_count: report.findings.length,
    critical_count: counts.critical,
    high_count: counts.high,
    medium_count: counts.medium,
    low_count: counts.low,
    info_count: counts.info,
    report_json: report.report_json,
    latency_ms: report.latency_ms ?? null,
    model: report.model ?? null,
    confidence_summary: {},
  });
  if (error) {
    console.warn('[ai/persistence] persistReport:', error.message);
    return id;
  }
  // Persist findings + evidence (best-effort).
  const sorted = [...report.findings].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  for (const f of sorted) {
    const findingId = uuidv4();
    await supabase.from('ai_findings').insert({
      id: findingId,
      report_id: id,
      investigation_id,
      finding_code: f.finding_code,
      title: f.title,
      module: f.module ?? null,
      category: f.category ?? null,
      description: f.description,
      severity: f.severity,
      confidence: f.confidence,
      verification_status: f.verification_status,
      human_review_required: f.human_review_required,
      root_cause: f.root_cause ?? null,
      recommendation: f.recommendation ?? null,
      sources: f.sources,
      // Deep forensic fields (req. #2, #3) — stored as JSONB so the full
      // location + expected/actual/difference + affected_records survives.
      location: f.location ?? null,
      expected_value: f.expected_value ?? null,
      actual_value: f.actual_value ?? null,
      difference: f.difference ?? null,
      affected_records: f.affected_records ?? null,
      is_systemic: f.is_systemic ?? null,
      related_tables: f.related_tables ?? null,
      is_verified: f.is_verified ?? false,
    }).then(() => undefined, (e) => console.warn('[ai/persistence] finding insert:', e.message));
    for (const e of f.evidence) {
      await supabase.from('ai_evidence').insert({
        id: uuidv4(),
        finding_id: findingId,
        investigation_id,
        source_label: e.source_label,
        source_type: e.source_type,
        field: e.field ?? null,
        expected_value: e.expected_value ?? null,
        actual_value: e.actual_value ?? null,
        difference: e.difference ?? null,
        evidence_json: e.evidence_json ?? {},
      }).then(() => undefined, () => undefined);
    }
  }
  return id;
}

export async function recordProviderRun(
  investigation_id: string | undefined,
  run: ProviderRunResult,
): Promise<void> {
  const supabase = await createServiceClient();
  const { error } = await supabase.from('ai_provider_runs').insert({
    id: uuidv4(),
    investigation_id: investigation_id ?? null,
    provider: run.provider,
    role: run.role,
    status: run.status,
    latency_ms: run.latency_ms,
    model: run.model ?? null,
    prompt_tokens: run.prompt_tokens ?? null,
    completion_tokens: run.completion_tokens ?? null,
    is_fallback: run.is_fallback,
    fallback_reason: run.fallback_reason ?? null,
    error_code: run.error_code ?? null,
    error_message: run.error_message ?? null,
    safe_metadata: {},
    finished_at: new Date().toISOString(),
  });
  if (error) console.warn('[ai/persistence] recordProviderRun:', error.message);
}

export async function recordProviderFailure(
  provider: ProviderName,
  cls: { status: string; code?: string; message?: string },
): Promise<void> {
  const supabase = await createServiceClient();
  await supabase.from('ai_provider_failures').insert({
    id: uuidv4(),
    provider,
    failure_type: cls.status,
    error_code: cls.code ?? null,
    error_message: cls.message ?? null,
    occurred_at: new Date().toISOString(),
  }).then(() => undefined, (e) => console.warn('[ai/persistence] recordProviderFailure:', e.message));
}

export async function finalizeInvestigation(
  id: string,
  patch: {
    status: 'completed' | 'failed' | 'partial' | 'skipped';
    deterministic_checks_count?: number;
    deterministic_findings_count?: number;
    records_checked?: number;
    modules_investigated?: string[];
    ai_status?: 'completed' | 'partial' | 'unavailable';
    fallback_used?: boolean;
    fallback_reason?: string;
    critical_count?: number;
    high_count?: number;
    medium_count?: number;
    low_count?: number;
    info_count?: number;
    unresolved_count?: number;
    overall_score?: number;
    error_message?: string;
  },
): Promise<void> {
  const supabase = await createServiceClient();
  const finished_at = new Date().toISOString();
  const startedRow = await supabase.from('ai_investigations').select('started_at').eq('id', id).maybeSingle();
  const startedAt = startedRow.data?.started_at;
  const duration_ms = startedAt ? Date.now() - new Date(startedAt).getTime() : null;
  const { error } = await supabase.from('ai_investigations').update({
    status: patch.status,
    deterministic_checks_count: patch.deterministic_checks_count,
    deterministic_findings_count: patch.deterministic_findings_count,
    records_checked: patch.records_checked,
    modules_investigated: patch.modules_investigated,
    ai_status: patch.ai_status,
    fallback_used: patch.fallback_used,
    fallback_reason: patch.fallback_reason,
    critical_count: patch.critical_count,
    high_count: patch.high_count,
    medium_count: patch.medium_count,
    low_count: patch.low_count,
    info_count: patch.info_count,
    unresolved_count: patch.unresolved_count,
    overall_score: patch.overall_score,
    error_message: patch.error_message,
    finished_at,
    duration_ms,
  }).eq('id', id);
  if (error) console.warn('[ai/persistence] finalizeInvestigation:', error.message);
}

export async function persistComparison(c: ComparisonResult): Promise<void> {
  const supabase = await createServiceClient();
  const { error } = await supabase.from('ai_comparisons').insert({
    id: uuidv4(),
    investigation_id: c.investigation_id,
    gemini_report_id: c.gemini_report_id ?? null,
    openrouter_report_id: c.openrouter_report_id ?? null,
    deterministic_report_id: c.deterministic_report_id ?? null,
    agreements_count: c.counts.agreements,
    gemini_only_count: c.counts.gemini_only,
    openrouter_only_count: c.counts.openrouter_only,
    disagreements_count: c.counts.disagreements,
    verified_count: c.counts.verified,
    human_review_count: c.counts.human_review,
    comparison_json: c.comparison_json,
  });
  if (error) console.warn('[ai/persistence] persistComparison:', error.message);
}

export async function persistVerification(
  investigation_id: string | undefined,
  r: MemberVerificationResult,
): Promise<void> {
  const supabase = await createServiceClient();
  const { error } = await supabase.from('ai_verification_results').insert({
    id: uuidv4(),
    investigation_id: investigation_id ?? null,
    member_id: r.member_id ?? null,
    member_number: r.member_number ?? null,
    overall_status: r.overall_status,
    verification_score: r.verification_score,
    fields_checked: r.fields_checked,
    fields_verified: r.fields_verified,
    fields_mismatched: r.fields_mismatched,
    field_results: r.field_results,
  });
  if (error) console.warn('[ai/persistence] persistVerification:', error.message);
}

export async function persistHealthSnapshots(snaps: ProviderHealthSnapshot[]): Promise<void> {
  for (const s of snaps) {
    try {
      await snapshotHealthRow(s);
    } catch (e) {
      console.warn('[ai/persistence] persistHealthSnapshots:', e instanceof Error ? e.message : e);
    }
  }
}

async function snapshotHealthRow(s: ProviderHealthSnapshot): Promise<void> {
  const supabase = await createServiceClient();
  await supabase.from('ai_health_snapshots').insert({
    id: uuidv4(),
    provider: s.provider,
    status: s.status,
    availability_pct: s.availability_pct,
    avg_latency_ms: s.avg_latency_ms ?? null,
    success_count: s.success_count,
    failure_count: s.failure_count,
    timeout_count: s.timeout_count,
    rate_limited_count: s.rate_limited_count,
    fallback_count: s.fallback_count,
    last_success_at: s.last_success_at ?? null,
    last_failure_at: s.last_failure_at ?? null,
  });
}

// ---------------------------------------------------------------------------
// READ QUERIES (for the admin console UI / API routes)
// ---------------------------------------------------------------------------

export async function listInvestigations(limit = 20, scope?: string): Promise<any[]> {
  const supabase = await createServiceClient();
  // NOTE: the schema column is `finished_at` (NOT `completed_at`) and
  // `duration_ms` / `info_count` exist — selecting a non-existent column makes
  // PostgREST error out and return null, which caused the "No investigations
  // yet" bug even when investigations existed (req. #28).
  let q = supabase
    .from('ai_investigations')
    .select('id, investigation_number, scope, trigger, status, ai_status, overall_score, critical_count, high_count, medium_count, low_count, info_count, unresolved_count, records_checked, modules_investigated, initiated_by, started_at, finished_at, duration_ms, fallback_used')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (scope) q = q.eq('scope', scope);
  const { data, error } = await q;
  if (error) console.warn('[ai/persistence] listInvestigations:', error.message);
  return data ?? [];
}

export async function getInvestigation(id: string): Promise<any | null> {
  const supabase = await createServiceClient();
  const { data } = await supabase.from('ai_investigations').select('*').eq('id', id).maybeSingle();
  return data ?? null;
}

export async function listReports(investigationId: string): Promise<any[]> {
  const supabase = await createServiceClient();
  // NOTE: the schema column is `report_id` (NOT `report_ref`); `summary` is
  // NOT a column — it lives inside `report_json.summary`. Selecting a
  // non-existent column makes PostgREST error out and return null (req. #28).
  const { data, error } = await supabase
    .from('ai_reports')
    .select('id, report_id, provider, scope, model, latency_ms, records_checked, checks_performed, findings_count, critical_count, high_count, medium_count, low_count, info_count, report_json, created_at')
    .eq('investigation_id', investigationId)
    .order('created_at', { ascending: false });
  if (error) console.warn('[ai/persistence] listReports:', error.message);
  // Surface the summary from report_json so the UI can display it.
  return (data ?? []).map((r) => ({
    ...r,
    summary: r.report_json?.summary ?? '',
    root_cause_analysis: r.report_json?.root_cause_analysis ?? '',
    recommendations: r.report_json?.recommendations ?? [],
    findings: r.report_json?.findings ?? [],
  }));
}

export async function getReport(id: string): Promise<any | null> {
  const supabase = await createServiceClient();
  const { data } = await supabase.from('ai_reports').select('*').eq('id', id).maybeSingle();
  return data ?? null;
}

/**
 * Load all findings (with evidence) for an investigation (req. #27 Evidence tab).
 * Returns the deep fields (location, expected/actual/difference, affected_records).
 */
export async function listFindings(investigationId: string): Promise<any[]> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from('ai_findings')
    .select('id, report_id, finding_code, title, module, category, description, severity, confidence, verification_status, human_review_required, root_cause, recommendation, sources, location, expected_value, actual_value, difference, affected_records, is_systemic, related_tables, is_verified, created_at')
    .eq('investigation_id', investigationId)
    .order('created_at', { ascending: true });
  if (error) console.warn('[ai/persistence] listFindings:', error.message);
  return data ?? [];
}

export async function getComparison(investigationId: string): Promise<any | null> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from('ai_comparisons')
    .select('*')
    .eq('investigation_id', investigationId)
    .maybeSingle();
  return data ?? null;
}

export async function listProviderRuns(investigationId?: string, limit = 50): Promise<any[]> {
  const supabase = await createServiceClient();
  let q = supabase
    .from('ai_provider_runs')
    .select('id, investigation_id, provider, role, status, model, latency_ms, is_fallback, fallback_reason, error_code, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (investigationId) q = q.eq('investigation_id', investigationId);
  const { data } = await q;
  return data ?? [];
}

export async function getLatestHealth(): Promise<Record<string, any>> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from('ai_health_snapshots')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2);
  const out: Record<string, any> = {};
  for (const row of data ?? []) {
    if (!out[row.provider]) out[row.provider] = row; // first = latest per provider
  }
  return out;
}

export async function getVerificationResult(investigationId: string): Promise<any | null> {
  const supabase = await createServiceClient();
  // NOTE: the schema table is `ai_verification_results` (migration 030),
  // NOT `ai_member_verification_results` — the old name always returned null
  // so the UI never showed verification results (req. #28).
  const { data } = await supabase
    .from('ai_verification_results')
    .select('*')
    .eq('investigation_id', investigationId)
    .maybeSingle();
  return data ?? null;
}

// ---------------------------------------------------------------------------
// SCHEDULES
// ---------------------------------------------------------------------------

export async function listSchedules(): Promise<any[]> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from('ai_investigation_schedules')
    .select('*')
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function upsertSchedule(s: {
  id?: string;
  name: string;
  scope: string;
  cadence: 'daily' | 'weekly' | 'monthly' | 'on_demand';
  is_enabled: boolean;
  day_of_week?: number | null;
  day_of_month?: number | null;
  time_of_day?: string | null;
  created_by?: string;
}): Promise<any> {
  const supabase = await createServiceClient();
  const row: Record<string, unknown> = {
    name: s.name,
    scope: s.scope,
    cadence: s.cadence,
    is_enabled: s.is_enabled,
    day_of_week: s.day_of_week ?? null,
    day_of_month: s.day_of_month ?? null,
    time_of_day: s.time_of_day ?? null,
  };
  if (s.id) {
    const { data } = await supabase.from('ai_investigation_schedules').update(row).eq('id', s.id).select('*').single();
    return data;
  }
  if (s.created_by) row.created_by = s.created_by;
  row.next_run_at = computeNextRun(s.cadence, s.day_of_week, s.day_of_month, s.time_of_day);
  const { data } = await supabase.from('ai_investigation_schedules').insert(row).select('*').single();
  return data;
}

export async function deleteSchedule(id: string): Promise<void> {
  const supabase = await createServiceClient();
  await supabase.from('ai_investigation_schedules').delete().eq('id', id);
}

export async function listDueSchedules(): Promise<any[]> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from('ai_investigation_schedules')
    .select('*')
    .eq('is_enabled', true)
    .neq('cadence', 'on_demand')
    .lte('next_run_at', new Date().toISOString());
  return data ?? [];
}

export async function markScheduleRun(id: string, nextRun: string | null): Promise<void> {
  const supabase = await createServiceClient();
  await supabase
    .from('ai_investigation_schedules')
    .update({ last_run_at: new Date().toISOString(), next_run_at: nextRun })
    .eq('id', id);
}

function computeNextRun(
  cadence: 'daily' | 'weekly' | 'monthly' | 'on_demand',
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
  timeOfDay?: string | null,
): string | null {
  if (cadence === 'on_demand') return null;
  const now = new Date();
  const [hh, mm] = (timeOfDay || '03:00').split(':').map(Number);
  const next = new Date(now);
  next.setHours(hh ?? 3, mm ?? 0, 0, 0);
  if (cadence === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (cadence === 'weekly') {
    const target = dayOfWeek ?? 1;
    const cur = next.getDay();
    let delta = (target - cur + 7) % 7;
    if (delta === 0 && next <= now) delta = 7;
    next.setDate(next.getDate() + delta);
  } else if (cadence === 'monthly') {
    const target = dayOfMonth ?? 1;
    next.setDate(target);
    next.setMonth(next.getMonth() + (next <= now ? 1 : 0));
  }
  return next.toISOString();
}

