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

/** Investigation depth level (req. #25). */
export type InvestigationDepth = 'quick' | 'standard' | 'deep' | 'forensic';

/** Dual AI mode option (req. #8). 'auto' honors AI_DUAL_MODE env. */
export type DualModeOption = 'auto' | 'single' | 'dual';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Confidence = 'confirmed' | 'high' | 'medium' | 'low';
export type ProviderName = 'gemini' | 'openrouter';
export type VerificationStatus =
  | 'confirmed'
  | 'requires_verification'
  | 'verified'
  | 'rejected'
  | 'unverified';

/**
 * The exact location of a problem (req. #2, #3).
 *
 * Every finding SHOULD populate whichever location fields the system has
 * enough information to identify. Fields are optional because not every
 * finding touches every layer (e.g. a pure DB duplicate has no frontend
 * component). The deterministic engines populate as many fields as they can;
 * AI providers are instructed to fill the same structure.
 */
export interface FindingLocation {
  /** Logical module, e.g. 'savings', 'loans', 'compliance'. */
  module?: string;
  /** Finer-grained area within the module, e.g. 'Member Account Balance'. */
  submodule?: string;

  // --- Database layer ---
  database?: {
    table?: string;
    field?: string;
    record_id?: string;
    stored_value?: string;
  };

  // --- Backend layer (req. #6) ---
  backend?: {
    module?: string;       // e.g. 'SavingsModule'
    controller?: string;   // e.g. 'SavingsController'
    service?: string;      // e.g. 'SavingsService'
    route?: string;        // e.g. 'GET /api/members/:id/financials'
    method?: string;       // e.g. 'GET'
    response_value?: string;
  };

  // --- Frontend layer (req. #16) ---
  frontend?: {
    application?: string;   // e.g. 'member-lookup-frontend'
    page?: string;          // e.g. '/dashboard'
    component?: string;     // e.g. 'FinancialSummary'
    field?: string;         // e.g. 'outstandingLoan'
    displayed_value?: string;
  };

  // --- Member context ---
  member_id?: string;
  member_number?: string;

  // --- Business rule / calculation source ---
  business_rule?: string;       // e.g. 'shares = floor(savings / share_value)'
  source_calculation?: string;  // human-readable formula used
}

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

/**
 * A finding produced by a deterministic check or an AI provider.
 *
 * Deepened (req. #1, #2, #3): every finding carries a `location` pinpointing
 * the database field, backend route/service, frontend component, and member
 * involved, plus expected/actual/difference, affected records, and a root
 * cause (or explicit "NOT CONFIRMED").
 */
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

  // --- Deep forensic fields (req. #2, #3) ---
  location?: FindingLocation;
  /** The value the system SHOULD have (from the authoritative source). */
  expected_value?: string;
  /** The value the system ACTUALLY has (at the layer where the bug manifests). */
  actual_value?: string;
  /** Numeric or textual difference. */
  difference?: string;
  /** Record IDs / member numbers affected by this finding (req. #21). */
  affected_records?: string[];
  /** Whether the issue is isolated (one record) or systemic (many). */
  is_systemic?: boolean;
  /** Related database tables involved in the finding (req. #21). */
  related_tables?: string[];
  /** Whether this finding has been cross-verified (both AIs or deterministic). */
  is_verified?: boolean;
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

/**
 * Member-lookup verification field-level result (req. #16).
 *
 * Deepened: traces a value through every layer —
 *   DATABASE → CALCULATION → BACKEND API → MEMBER LOOKUP API → FRONTEND DISPLAY
 * — and identifies the exact layer where a mismatch occurs.
 */
export interface VerificationFieldResult {
  field: string;
  database?: string;
  calculation?: string;
  api?: string;
  member_lookup?: string;
  display?: string;
  match: boolean;
  severity: Severity;
  note?: string;
  /** The layer where the first divergence occurs (req. #16). */
  mismatch_layer?: 'database' | 'calculation' | 'api' | 'member_lookup' | 'display' | 'none';
  /** Frontend component displaying this field, when known. */
  frontend_component?: string;
  expected_value?: string;
  actual_value?: string;
  difference?: string;
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
  /** Full member data graph used for the investigation (req. #13). */
  member_graph?: MemberDataGraph;
  /** Report sections (req. #17). */
  sections?: MemberReportSections;
}

/**
 * The complete relationship map for a member (req. #13).
 * Built by the member-forensic engine before any checks run.
 */
export interface MemberDataGraph {
  profile?: Record<string, unknown>;
  compliance?: Record<string, unknown>[];
  accounts?: Record<string, unknown>[];
  savings_transactions?: Record<string, unknown>[];
  shares?: Record<string, unknown> | null;
  contributions?: Record<string, unknown>[];
  welfare?: Record<string, unknown>[];
  fines?: Record<string, unknown>[];
  loans?: Record<string, unknown>[];
  loan_repayments?: Record<string, unknown>[];
  documents?: Record<string, unknown>[];
  notifications?: Record<string, unknown>[];
  meetings?: Record<string, unknown>[];
  /** Layered balances for cross-layer comparison (req. #5, #15). */
  layers?: {
    database?: Record<string, number | undefined>;
    calculation?: Record<string, number | undefined>;
    api?: Record<string, number | undefined>;
    member_lookup?: Record<string, number | undefined>;
    display?: Record<string, number | undefined>;
  };
}

/** Member report sections (req. #17). */
export interface MemberReportSections {
  member_profile?: { summary: string; data?: Record<string, unknown> };
  compliance?: { summary: string; issues?: string[] };
  financial_position?: { summary: string; data?: Record<string, unknown> };
  data_consistency?: { summary: string; findings?: string[] };
  api_consistency?: { summary: string; findings?: string[] };
  member_lookup_consistency?: { summary: string; findings?: string[] };
  business_rule_compliance?: { summary: string; findings?: string[] };
  anomalies?: { summary: string; items?: string[] };
  ai_evaluation?: { summary: string; gemini?: string; openrouter?: string };
  final_evaluation?: { summary: string };
}

/** A module entry in the module-level health map (req. #20). */
export interface ModuleHealthEntry {
  module: string;
  status: 'healthy' | 'warning' | 'inconsistent';
  findings_count: number;
  critical_count: number;
  high_count: number;
  affected_members?: number;
  affected_records?: number;
  total_difference?: string;
  /** Finding codes that belong to this module (for drill-down). */
  finding_codes?: string[];
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

/** A member search candidate (req. #11, #18). */
export interface MemberSearchCandidate {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  id_number?: string;
  status: string;
  /** Which identifiers matched the query. */
  matched_by: string[];
}

/** Investigation context handed to providers + deterministic engines. */
export interface InvestigationContext {
  investigation_id: string;
  scope: InvestigationScope;
  member_id?: string; // for member_verification scope
  depth?: InvestigationDepth; // req. #25
  dual_mode?: DualModeOption; // req. #8
  deterministic_findings: Finding[]; // results of deterministic checks
  tools_payload: Record<string, unknown>; // sanitized, read-only data snapshot
}
