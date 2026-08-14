-- 031_ai_forensic_deep_findings.sql
--
-- YUNITE AI INTELLIGENCE — DEEP FORENSIC UPGRADE
--
-- Extends the AI schema to support forensic-grade findings (req. #1-#32):
--   * Every finding carries a `location` JSONB pinning the database
--     table/field/record, backend route/service, frontend component, and
--     member, plus expected/actual/difference, affected_records, is_systemic.
--   * Investigations record their depth (quick/standard/deep/forensic) and
--     dual-mode option (auto/single/dual) so the UI + cron can drive them.
--   * Module health map is derived from findings at read time (no table
--     needed) but we add an index to speed the per-module aggregation.
--
-- All ALTERs are idempotent (ADD COLUMN IF NOT EXISTS) so this migration is
-- safe to re-run and safe on DBs that already ran migration 030.

-- ============================================
-- DEEP FINDING COLUMNS (req. #2, #3)
-- ============================================
ALTER TABLE ai_findings ADD COLUMN IF NOT EXISTS location JSONB;
ALTER TABLE ai_findings ADD COLUMN IF NOT EXISTS expected_value TEXT;
ALTER TABLE ai_findings ADD COLUMN IF NOT EXISTS actual_value TEXT;
ALTER TABLE ai_findings ADD COLUMN IF NOT EXISTS difference TEXT;
ALTER TABLE ai_findings ADD COLUMN IF NOT EXISTS affected_records TEXT[] DEFAULT '{}';
ALTER TABLE ai_findings ADD COLUMN IF NOT EXISTS is_systemic BOOLEAN;
ALTER TABLE ai_findings ADD COLUMN IF NOT EXISTS related_tables TEXT[] DEFAULT '{}';
ALTER TABLE ai_findings ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;

-- Index the module + severity for the module health map drill-down.
CREATE INDEX IF NOT EXISTS idx_ai_findings_module ON ai_findings(module);
CREATE INDEX IF NOT EXISTS idx_ai_findings_module_severity ON ai_findings(module, severity);

-- ============================================
-- INVESTIGATION DEPTH + DUAL MODE (req. #8, #25)
-- ============================================
ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS depth TEXT DEFAULT 'standard'
    CHECK (depth IN ('quick', 'standard', 'deep', 'forensic'));
ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS dual_mode TEXT DEFAULT 'auto'
    CHECK (dual_mode IN ('auto', 'single', 'dual'));

COMMENT ON COLUMN ai_findings.location IS
'Forensic location: {module, submodule, database:{table,field,record_id,stored_value}, backend:{module,controller,service,route,method,response_value}, frontend:{application,page,component,field,displayed_value}, member_id, member_number, business_rule, source_calculation}.';

COMMENT ON COLUMN ai_investigations.depth IS
'Investigation depth: quick (basic checks), standard (cross-module), deep (db+backend+api+rules+frontend), forensic (everything + dual-AI).';

COMMENT ON COLUMN ai_investigations.dual_mode IS
'Dual AI mode: auto (honor AI_DUAL_MODE env), single (one provider), dual (both providers independently).';
