-- ===================================================================
-- 039: Add 'unity_fund' to the ai_investigations.scope CHECK constraint.
--
-- The Unity Fund Consistency Engine (src/ai/engines/unity-fund.consistency.engine.ts),
-- the investigation orchestrator's scope dispatcher (pickDeterministic),
-- and the tools payload builder (buildToolsPayload case 'unity_fund') all
-- support the 'unity_fund' scope, and the public /api/v1/unity-fund/* surface
-- (balance, donations, expenditures, grants, liabilities, organization-loans,
-- pending, reconciliation, sources, summary, transactions) is a first-class
-- investigation target. But migration 030's column CHECK enumerated only
-- seven scopes and omitted 'unity_fund', so createInvestigation() failed the
-- Postgres constraint and a Super Admin could never actually launch a Unity
-- Fund investigation through the API or dashboard.
--
-- Idempotent: safe to re-run. Drops the old check and re-adds it with the
-- full scope set (mirrors the migration 019 / 037 pattern).
-- ===================================================================

ALTER TABLE ai_investigations DROP CONSTRAINT IF EXISTS ai_investigations_scope_check;

ALTER TABLE ai_investigations ADD CONSTRAINT ai_investigations_scope_check
    CHECK (scope IN (
        'database', 'cross_module', 'business_rules', 'api',
        'financial', 'unity_fund', 'member_verification', 'full_system'
    ));

COMMENT ON COLUMN ai_investigations.scope IS
'Investigation scope: database, cross_module, business_rules, api, financial, unity_fund, member_verification, full_system. unity_fund runs the Unity Fund reconciliation engine against the authoritative UnityFundEngine ledger.';
