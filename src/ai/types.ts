/**
 * YUNITE AI Intelligence Engine — core domain types.
 *
 * The database and deterministic YUNITE business engines are the source of
 * truth. AI providers (Gemini, OpenRouter) are an intelligence/
 * interpretation layer: they investigate the system through controlled,
 * read-only tools and produce reports. AI never writes business data, never
 * invents financial values, and never receives raw credentials or PII.
 *
 * These types are shared by the provider abstraction, the deterministic
 * engines, the investigation/comparison/report engines, and the API/UI.
 */

/** Investigation scopes (mirrors the DB CHECK constraint). */
export type InvestigationScope =
  | 'database'
  | 'cross_module'
  | 'business_rules'
  | 'api'
  | 'financial'
  | 'member_verification'
  | 'full_system';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Confidence = 'confirmed' | 'high' | 'medium' | 'low';
export type ProviderName = 'gemini' | 'openrouter';
export type VerificationStatus =
  | 'confirmed'
  | 'requires_verification'
  | 'verified'
  | 'rejected'
  | 'unverified';

/** A single piece of evidence backing a finding (DB vs API vs display). */
export interface EvidenceItem {
  source_label: string;
  source_type: 'database' | 'api' | 'display' | 'configuration' | 'calculation' | 'provider';
  field?: string;
  expected_value?: string;
  actual_value?: string;
  difference?: string;
  evidence_json?: Record<string, unknown>;
}

/** A finding produced by a deterministic check or an AI provider. */
export interface Finding {
  finding_code: string;
  title: string;
  module?: string;
  category?: string;
  description: string;
  severity: Severity;
  confidence: Confidence;
  verification_status: VerificationStatus;
  human_review_required: boolean;
  root_cause?: string;
  recommendation?: string;
  sources: string[]; // ['gemini'] | ['openrouter'] | ['deterministic'] | ['gemini','openrouter']
  evidence: EvidenceItem[];
}

/** The structured report returned by a provider (or the deterministic engine). */
export interface ProviderReport {
  provider: ProviderName | 'deterministic';
  scope: InvestigationScope;
  modules_investigated: string[];
  records_checked: number;
  checks_performed: number;
  findings: Finding[];
  summary: string;
  root_cause_analysis?: string;
  recommendations: string[];
  model?: string;
  latency_ms?: number;
  /** Raw structured AI payload, sanitized (no secrets/PII). */
  report_json: Record<string, unknown>;
}

/** Provider run result metadata (for health tracking + audit). */
export interface ProviderRunResult {
  provider: ProviderName;
  role: 'primary' | 'fallback';
  status: 'success' | 'failed' | 'timeout' | 'rate_limited' | 'skipped' | 'unavailable';
  latency_ms: number;
  is_fallback: boolean;
  fallback_reason?: string;
  error_code?: string;
  error_message?: string;
  model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
}

/** Comparison result reconciling two provider reports. */
export interface ComparisonResult {
  investigation_id: string;
  gemini_report_id?: string;
  openrouter_report_id?: string;
  deterministic_report_id?: string;
  agreements: Finding[];
  gemini_only: Finding[];
  openrouter_only: Finding[];
  disagreements: { gemini: Finding; openrouter: Finding; reason: string }[];
  verified_findings: Finding[];
  human_review: Finding[];
  counts: {
    agreements: number;
    gemini_only: number;
    openrouter_only: number;
    disagreements: number;
    verified: number;
    human_review: number;
  };
  comparison_json: Record<string, unknown>;
}

/** Member-lookup verification field-level result. */
export interface VerificationFieldResult {
  field: string;
  database?: string;
  api?: string;
  display?: string;
  match: boolean;
  severity: Severity;
  note?: string;
}

export interface MemberVerificationResult {
  member_id?: string;
  member_number?: string;
  overall_status: 'verified' | 'warning' | 'critical_mismatch' | 'unavailable';
  verification_score: number; // 0..100
  fields_checked: number;
  fields_verified: number;
  fields_mismatched: number;
  field_results: VerificationFieldResult[];
}

/** Health snapshot for a provider. */
export interface ProviderHealthSnapshot {
  provider: ProviderName;
  status: 'healthy' | 'degraded' | 'unavailable' | 'unknown';
  availability_pct: number;
  avg_latency_ms?: number;
  success_count: number;
  failure_count: number;
  timeout_count: number;
  rate_limited_count: number;
  fallback_count: number;
  last_success_at?: string;
  last_failure_at?: string;
}

/** Investigation context handed to providers + deterministic engines. */
export interface InvestigationContext {
  investigation_id: string;
  scope: InvestigationScope;
  member_id?: string; // for member_verification scope
  deterministic_findings: Finding[]; // results of deterministic checks
  tools_payload: Record<string, unknown>; // sanitized, read-only data snapshot
}
