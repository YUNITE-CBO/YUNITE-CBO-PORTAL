-- 030_ai_intelligence_engine.sql
--
-- YUNITE AI INTELLIGENCE, INVESTIGATION & CONSISTENCY ENGINE
--
-- Persistence layer for the Dual-AI investigation system (Gemini +
-- OpenRouter). The database and deterministic YUNITE business engines
-- remain the source of truth; AI is an intelligence/interpretation layer
-- only. AI never writes business data. AI-generated findings are stored
-- as observations, never as authoritative state.
--
-- Design principles mirrored in the schema:
--   * Every investigation has a deterministic phase whose findings are
--     persisted independently of the AI phase (AI can fail; determinism
--     never fails the underlying investigation).
--   * Provider reports are stored separately so neither provider can read
--     the other's conclusions before producing an independent report.
--   * Comparisons reconcile the two independent reports against each
--     other and against the deterministic findings.
--   * Member-lookup verification records DB vs API vs display deltas.
--   * Provider health is snapshotted every investigation so admins can see
--     historical trending (today vs yesterday vs last week).

-- ============================================
-- AI INVESTIGATIONS (one per run)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_investigations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investigation_number TEXT UNIQUE NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN (
        'database', 'cross_module', 'business_rules', 'api',
        'financial', 'member_verification', 'full_system'
    )),
    trigger TEXT NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'scheduled', 'cron', 'api')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'partial', 'skipped'
    )),

    -- Deterministic phase summary (independent of AI).
    deterministic_checks_count INTEGER DEFAULT 0,
    deterministic_findings_count INTEGER DEFAULT 0,
    records_checked INTEGER DEFAULT 0,
    modules_investigated TEXT[] DEFAULT '{}',

    -- AI phase summary (may be unavailable if both providers fail).
    ai_status TEXT CHECK (ai_status IN ('completed', 'partial', 'unavailable')),
    primary_provider TEXT DEFAULT 'gemini',
    fallback_provider TEXT DEFAULT 'openrouter',
    fallback_used BOOLEAN DEFAULT FALSE,
    fallback_reason TEXT,

    -- Overall roll-up severity counts.
    critical_count INTEGER DEFAULT 0,
    high_count INTEGER DEFAULT 0,
    medium_count INTEGER DEFAULT 0,
    low_count INTEGER DEFAULT 0,
    info_count INTEGER DEFAULT 0,
    unresolved_count INTEGER DEFAULT 0,

    overall_score INTEGER, -- 0..100 system health percentage

    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    duration_ms BIGINT,

    initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_investigations_scope ON ai_investigations(scope);
CREATE INDEX IF NOT EXISTS idx_ai_investigations_status ON ai_investigations(status);
CREATE INDEX IF NOT EXISTS idx_ai_investigations_started_at ON ai_investigations(started_at);

-- ============================================
-- AI REPORTS (one per provider per investigation)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id TEXT UNIQUE NOT NULL,
    investigation_id UUID NOT NULL REFERENCES ai_investigations(id) ON DELETE CASCADE,

    provider TEXT NOT NULL CHECK (provider IN ('gemini', 'openrouter', 'comparison', 'deterministic')),
    -- 'deterministic' rows store the deterministic engine's own report.
    -- 'comparison' rows store the reconciled combined analysis.

    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scope TEXT NOT NULL,
    modules_investigated TEXT[] DEFAULT '{}',
    records_checked INTEGER DEFAULT 0,
    checks_performed INTEGER DEFAULT 0,

    findings_count INTEGER DEFAULT 0,
    critical_count INTEGER DEFAULT 0,
    high_count INTEGER DEFAULT 0,
    medium_count INTEGER DEFAULT 0,
    low_count INTEGER DEFAULT 0,
    info_count INTEGER DEFAULT 0,

    -- The full structured AI report (summary, root-cause, recommendations).
    -- Stored as JSONB so the original reasoning is preserved verbatim.
    report_json JSONB NOT NULL DEFAULT '{}'::jsonb,

    latency_ms BIGINT,
    model TEXT,
    confidence_summary JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_reports_investigation ON ai_reports(investigation_id);
CREATE INDEX IF NOT EXISTS idx_ai_reports_provider ON ai_reports(provider);
CREATE INDEX IF NOT EXISTS idx_ai_reports_created_at ON ai_reports(created_at);

-- ============================================
-- AI FINDINGS (per report)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES ai_reports(id) ON DELETE CASCADE,
    investigation_id UUID NOT NULL REFERENCES ai_investigations(id) ON DELETE CASCADE,

    finding_code TEXT NOT NULL,
    title TEXT NOT NULL,
    module TEXT,
    category TEXT,
    description TEXT NOT NULL,

    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('confirmed', 'high', 'medium', 'low')),

    -- Reconciliation outcome (populated by the comparison engine).
    -- 'confirmed' = confirmed by deterministic checks or both providers.
    -- 'requires_verification' = AI disagreement or unverified AI claim.
    verification_status TEXT DEFAULT 'unverified' CHECK (verification_status IN (
        'confirmed', 'requires_verification', 'verified', 'rejected', 'unverified'
    )),
    human_review_required BOOLEAN DEFAULT FALSE,

    root_cause TEXT,
    recommendation TEXT,

    -- Cross-provider attribution (filled by comparison engine).
    sources TEXT[] DEFAULT '{}', -- e.g. ['gemini','openrouter','deterministic']

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_findings_report ON ai_findings(report_id);
CREATE INDEX IF NOT EXISTS idx_ai_findings_investigation ON ai_findings(investigation_id);
CREATE INDEX IF NOT EXISTS idx_ai_findings_severity ON ai_findings(severity);
CREATE INDEX IF NOT EXISTS idx_ai_findings_verification ON ai_findings(verification_status);

-- ============================================
-- AI EVIDENCE (supports each finding)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finding_id UUID NOT NULL REFERENCES ai_findings(id) ON DELETE CASCADE,
    investigation_id UUID NOT NULL REFERENCES ai_investigations(id) ON DELETE CASCADE,

    source_label TEXT NOT NULL, -- e.g. 'stored balance', 'transaction total', 'backend api'
    source_type TEXT CHECK (source_type IN ('database', 'api', 'display', 'configuration', 'calculation', 'provider')),
    field TEXT,
    expected_value TEXT,
    actual_value TEXT,
    difference TEXT,
    evidence_json JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_evidence_finding ON ai_evidence(finding_id);

-- ============================================
-- AI PROVIDER RUNS (one per provider invocation)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_provider_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investigation_id UUID REFERENCES ai_investigations(id) ON DELETE CASCADE,

    provider TEXT NOT NULL CHECK (provider IN ('gemini', 'openrouter')),
    role TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'fallback')),

    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'timeout', 'rate_limited', 'skipped')),
    latency_ms BIGINT,

    model TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,

    is_fallback BOOLEAN DEFAULT FALSE,
    fallback_reason TEXT,

    error_code TEXT,
    error_message TEXT,

    -- Never store prompts/responses containing secrets or raw PII here.
    -- Only sanitized operational metadata.
    safe_metadata JSONB DEFAULT '{}'::jsonb,

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_runs_investigation ON ai_provider_runs(investigation_id);
CREATE INDEX IF NOT EXISTS idx_ai_provider_runs_provider ON ai_provider_runs(provider);
CREATE INDEX IF NOT EXISTS idx_ai_provider_runs_started_at ON ai_provider_runs(started_at);

-- ============================================
-- AI PROVIDER FAILURES (dedicated failure log)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_provider_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL CHECK (provider IN ('gemini', 'openrouter')),
    failure_type TEXT NOT NULL CHECK (failure_type IN ('timeout', 'unavailable', 'error', 'rate_limited', 'auth', 'invalid_response')),
    error_code TEXT,
    error_message TEXT,
    latency_ms BIGINT,
    investigation_id UUID REFERENCES ai_investigations(id) ON DELETE SET NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_failures_provider ON ai_provider_failures(provider);
CREATE INDEX IF NOT EXISTS idx_ai_provider_failures_occurred_at ON ai_provider_failures(occurred_at);

-- ============================================
-- AI COMPARISONS (reconciled result of two provider reports)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investigation_id UUID NOT NULL REFERENCES ai_investigations(id) ON DELETE CASCADE,
    gemini_report_id UUID REFERENCES ai_reports(id) ON DELETE SET NULL,
    openrouter_report_id UUID REFERENCES ai_reports(id) ON DELETE SET NULL,
    deterministic_report_id UUID REFERENCES ai_reports(id) ON DELETE SET NULL,

    agreements_count INTEGER DEFAULT 0,
    gemini_only_count INTEGER DEFAULT 0,
    openrouter_only_count INTEGER DEFAULT 0,
    disagreements_count INTEGER DEFAULT 0,
    verified_count INTEGER DEFAULT 0,
    human_review_count INTEGER DEFAULT 0,

    -- The full comparison breakdown as JSONB.
    comparison_json JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_comparisons_investigation ON ai_comparisons(investigation_id);

-- ============================================
-- AI VERIFICATION RESULTS (member-lookup DB vs API vs display)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_verification_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investigation_id UUID REFERENCES ai_investigations(id) ON DELETE SET NULL,
    member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    member_number TEXT,

    overall_status TEXT NOT NULL CHECK (overall_status IN ('verified', 'warning', 'critical_mismatch', 'unavailable')),
    verification_score INTEGER, -- 0..100

    fields_checked INTEGER DEFAULT 0,
    fields_verified INTEGER DEFAULT 0,
    fields_mismatched INTEGER DEFAULT 0,

    -- Per-field deltas: [{field, database, api, display, match, severity}]
    field_results JSONB NOT NULL DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_verification_results_member ON ai_verification_results(member_id);
CREATE INDEX IF NOT EXISTS idx_ai_verification_results_status ON ai_verification_results(overall_status);
CREATE INDEX IF NOT EXISTS idx_ai_verification_results_created_at ON ai_verification_results(created_at);

-- ============================================
-- AI HEALTH SNAPSHOTS (per-investigation provider health)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_health_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL CHECK (provider IN ('gemini', 'openrouter')),
    status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unavailable', 'unknown')),
    availability_pct NUMERIC(5,2) DEFAULT 100,
    avg_latency_ms BIGINT,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    timeout_count INTEGER DEFAULT 0,
    rate_limited_count INTEGER DEFAULT 0,
    fallback_count INTEGER DEFAULT 0,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_health_snapshots_provider ON ai_health_snapshots(provider);
CREATE INDEX IF NOT EXISTS idx_ai_health_snapshots_snapshot_at ON ai_health_snapshots(snapshot_at);

-- ============================================
-- AI INVESTIGATION SCHEDULES (configurable)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_investigation_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    scope TEXT NOT NULL,
    cadence TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly', 'on_demand')),
    is_enabled BOOLEAN DEFAULT TRUE,
    day_of_week INTEGER, -- 0=Sun..6=Sat (for weekly)
    day_of_month INTEGER, -- 1..31 (for monthly)
    time_of_day TEXT, -- 'HH:MM' 24h
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_schedules_next_run ON ai_investigation_schedules(next_run_at);
CREATE INDEX IF NOT EXISTS idx_ai_schedules_enabled ON ai_investigation_schedules(is_enabled);

-- ============================================
-- SEED DEFAULT SCHEDULES
-- ============================================
INSERT INTO ai_investigation_schedules (name, scope, cadence, is_enabled, time_of_day)
VALUES
    ('Daily Database Consistency Scan', 'database', 'daily', FALSE, '02:00'),
    ('Weekly Full System Investigation', 'full_system', 'weekly', FALSE, '03:00')
ON CONFLICT DO NOTHING;

-- ============================================
-- updated_at trigger for schedules
-- ============================================
CREATE TRIGGER update_ai_schedules_updated_at BEFORE UPDATE ON ai_investigation_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE ai_investigations IS
'Dual-AI investigation run ledger. Deterministic findings are persisted independently of the AI phase so AI failure never loses the underlying investigation.';
