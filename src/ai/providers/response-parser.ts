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

  return {
    finding_code: String(raw?.finding_code ?? `F-${idx + 1}`),
    title: String(raw?.title ?? 'Untitled finding'),
    module: raw?.module ?? undefined,
    category: raw?.category ?? undefined,
    description: String(raw?.description ?? ''),
    severity,
    confidence,
    // AI-sourced findings start unverified until reconciled.
    verification_status: 'unverified' as VerificationStatus,
    human_review_required: Boolean(raw?.human_review_required),
    root_cause: raw?.root_cause ?? undefined,
    recommendation: raw?.recommendation ?? undefined,
    sources: [provider],
    evidence,
  };
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
