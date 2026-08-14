/**
 * Shared AI response parser.
 *
 * Both providers return model output that must be coerced into the
 * ProviderReport schema. This centralizes:
 *  - robust JSON extraction (models sometimes wrap JSON in prose/markdown)
 *  - field normalization + clamping to allowed enums
 *  - evidence attachment
 *  - confidence/verification defaults (AI output is never "confirmed" by
 *    itself; only deterministic checks or both providers confirm a finding)
 */

import type {
  Confidence,
  EvidenceItem,
  Finding,
  FindingLocation,
  InvestigationContext,
  ProviderReport,
  Severity,
  VerificationStatus,
} from '../types';

const SEVERITIES = new Set<Severity>(['critical', 'high', 'medium', 'low', 'info']);
const CONFIDENCES = new Set<Confidence>(['confirmed', 'high', 'medium', 'low']);
const SOURCE_TYPES = new Set<EvidenceItem['source_type']>([
  'database', 'api', 'display', 'configuration', 'calculation', 'provider',
]);

/** Extract the first balanced JSON object/array from a model text response. */
export function extractJson(raw: string): unknown {
  if (!raw) return null;
  let text = raw.trim();
  // Strip ```json ... ``` fences.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // Try direct parse first.
  try {
    return JSON.parse(text);
  } catch {
    // fall through to brace/bracket scanning.
  }
  const start = text.search(/[{[]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function clamp<T>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value as T) ? (value as T) : fallback;
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function parseFinding(raw: any, provider: string, idx: number): Finding {
  const evidence: EvidenceItem[] = asArray<any>(raw?.evidence).map((e) => ({
    source_label: String(e?.source_label ?? 'unknown'),
    source_type: clamp(e?.source_type, SOURCE_TYPES, 'provider'),
    field: e?.field != null ? String(e.field) : undefined,
    expected_value: e?.expected_value != null ? String(e.expected_value) : undefined,
    actual_value: e?.actual_value != null ? String(e.actual_value) : undefined,
    difference: e?.difference != null ? String(e.difference) : undefined,
    evidence_json: e?.evidence_json ?? undefined,
  }));

  const severity = clamp<Severity>(raw?.severity, SEVERITIES, 'medium');
  // AI output is never auto-"confirmed" — only deterministic checks or the
  // comparison engine can confirm a finding. Downgrade to "high".
  let confidence = clamp<Confidence>(raw?.confidence, CONFIDENCES, 'medium');
  if (confidence === 'confirmed') confidence = 'high';

  // Extract the deep location (req. #2, #3) — AI providers are instructed to
  // fill this; if absent, we still accept the finding (location stays undefined).
  const location = parseLocation(raw?.location);

  return {
    finding_code: String(raw?.finding_code ?? `F-${idx + 1}`),
    title: String(raw?.title ?? 'Untitled finding'),
    module: raw?.module ?? location?.module ?? undefined,
    category: raw?.category ?? undefined,
    description: String(raw?.description ?? ''),
    severity,
    confidence,
    // AI-sourced findings start unverified until reconciled.
    verification_status: 'unverified' as VerificationStatus,
    human_review_required: Boolean(raw?.human_review_required),
    root_cause: raw?.root_cause != null ? String(raw.root_cause) : undefined,
    recommendation: raw?.recommendation != null ? String(raw.recommendation) : undefined,
    sources: [provider],
    evidence,
    location,
    expected_value: raw?.expected_value != null ? String(raw.expected_value) : undefined,
    actual_value: raw?.actual_value != null ? String(raw.actual_value) : undefined,
    difference: raw?.difference != null ? String(raw.difference) : undefined,
    affected_records: asArray<string>(raw?.affected_records).map(String),
    is_systemic: typeof raw?.is_systemic === 'boolean' ? raw.is_systemic : undefined,
    related_tables: asArray<string>(raw?.related_tables).map(String),
    is_verified: false,
  };
}

/** Coerce a raw AI location object into a typed FindingLocation. */
function parseLocation(raw: any): FindingLocation | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const loc: FindingLocation = {};
  if (raw.module != null) loc.module = String(raw.module);
  if (raw.submodule != null) loc.submodule = String(raw.submodule);
  if (raw.database && typeof raw.database === 'object') {
    loc.database = {
      table: raw.database.table != null ? String(raw.database.table) : undefined,
      field: raw.database.field != null ? String(raw.database.field) : undefined,
      record_id: raw.database.record_id != null ? String(raw.database.record_id) : undefined,
      stored_value: raw.database.stored_value != null ? String(raw.database.stored_value) : undefined,
    };
  }
  if (raw.backend && typeof raw.backend === 'object') {
    loc.backend = {
      module: raw.backend.module != null ? String(raw.backend.module) : undefined,
      controller: raw.backend.controller != null ? String(raw.backend.controller) : undefined,
      service: raw.backend.service != null ? String(raw.backend.service) : undefined,
      route: raw.backend.route != null ? String(raw.backend.route) : undefined,
      method: raw.backend.method != null ? String(raw.backend.method) : undefined,
      response_value: raw.backend.response_value != null ? String(raw.backend.response_value) : undefined,
    };
  }
  if (raw.frontend && typeof raw.frontend === 'object') {
    loc.frontend = {
      application: raw.frontend.application != null ? String(raw.frontend.application) : undefined,
      page: raw.frontend.page != null ? String(raw.frontend.page) : undefined,
      component: raw.frontend.component != null ? String(raw.frontend.component) : undefined,
      field: raw.frontend.field != null ? String(raw.frontend.field) : undefined,
      displayed_value: raw.frontend.displayed_value != null ? String(raw.frontend.displayed_value) : undefined,
    };
  }
  if (raw.member_id != null) loc.member_id = String(raw.member_id);
  if (raw.member_number != null) loc.member_number = String(raw.member_number);
  if (raw.business_rule != null) loc.business_rule = String(raw.business_rule);
  if (raw.source_calculation != null) loc.source_calculation = String(raw.source_calculation);
  // Only return if at least one field is populated.
  return Object.values(loc).some((v) => v !== undefined) ? loc : undefined;
}

/**
 * Normalize a parsed model payload into a ProviderReport. Throws on a payload
 * that is not a usable object.
 */
export function normalizeReport(
  parsed: unknown,
  ctx: InvestigationContext,
  provider: ProviderReport['provider'],
  model?: string,
  latencyMs?: number,
): ProviderReport {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI response was not a JSON object');
  }
  const obj = parsed as Record<string, unknown>;
  const rawFindings = asArray<any>(obj.findings);
  const findings: Finding[] = rawFindings.map((f, i) => parseFinding(f, provider, i));

  return {
    provider,
    scope: ctx.scope,
    modules_investigated: ctx.tools_payload ? Object.keys(ctx.tools_payload) : [],
    records_checked: Number(obj.records_checked ?? findings.length),
    checks_performed: Number(obj.checks_performed ?? findings.length),
    findings,
    summary: String(obj.summary ?? ''),
    root_cause_analysis: obj.root_cause_analysis != null ? String(obj.root_cause_analysis) : undefined,
    recommendations: asArray<string>(obj.recommendations).map(String),
    model,
    latency_ms: latencyMs,
    report_json: obj as Record<string, unknown>,
  };
}
