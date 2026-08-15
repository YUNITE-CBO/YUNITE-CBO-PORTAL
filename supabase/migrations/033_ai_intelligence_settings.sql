-- ===================================================================
-- 033: AI Intelligence settings (dual mode toggle)
--
-- The AI Intelligence dashboard showed "Dual Mode: OFF" with no way to
-- turn it on from the UI — the only control was the AI_DUAL_MODE env var,
-- which requires a Render redeploy to change. This makes Dual AI Mode a
-- first-class, persistent, admin-toggleable organization setting under a
-- new 'ai' configuration category, governed by the same ConfigurationService
-- + audit/history framework as every other settings surface.
--
-- Resolution precedence (investigation.engine.ts): the DB setting
-- `ai.dual_mode` is the source of truth when `dualMode === 'auto'` (the
-- dashboard default). The AI_DUAL_MODE env var remains as a deployment-time
-- fallback/override only. Explicit per-run 'single'/'dual' selections from
-- the dashboard still take precedence over both.
--
-- Idempotent: safe to re-run.
-- ===================================================================

-- 1. Register the 'ai' configuration category (if not present).
INSERT INTO configuration_categories (code, name, description, icon, color, sort_order)
VALUES ('ai', 'AI Intelligence', 'Dual-AI investigation, providers, and forensic engine', 'cpu', '#7C3AED', 15)
ON CONFLICT (code) DO NOTHING;

-- 2. Seed the AI settings rows under the 'ai' category.
-- ON CONFLICT DO UPDATE (not NOTHING) so that if a row was lazily created by
-- the application (upsertSetting) before this migration ran, running this
-- migration fills in the full metadata (description, data_type, help_text,
-- display_order, is_public) that the lazy insert may have omitted.
INSERT INTO settings (key, value, category, description, data_type, is_public, display_order, help_text)
VALUES
  ('ai.dual_mode', 'false', 'ai', 'Dual AI Mode — run Gemini and OpenRouter as two independent (blind) investigators for full-system and member-verification scopes, then reconcile their findings via the comparison engine. When OFF, only the primary provider runs.', 'boolean', false, 1, 'Turning this ON runs both AI providers per investigation (higher cost/latency, deeper coverage). The dashboard "AI Mode" dropdown still lets you force single/dual per run regardless of this toggle.'),
  ('ai.investigations.enabled', 'true', 'ai', 'Master switch for the AI Intelligence investigation engine. When OFF, manual and scheduled investigations are blocked (deterministic engines still run; AI providers are skipped).', 'boolean', false, 2, 'Disable to pause all AI provider calls without removing configuration.'),
  ('ai.alerts.critical_enabled', 'true', 'ai', 'Emit internal YUNITE notifications (and best-effort email) to super admins whenever an investigation produces CRITICAL findings.', 'boolean', false, 3, 'No sensitive financial values are sent in email; full evidence stays in the Admin Console.')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  data_type = EXCLUDED.data_type,
  is_public = EXCLUDED.is_public,
  display_order = EXCLUDED.display_order,
  help_text = EXCLUDED.help_text;

-- 3. Link all 'ai' settings to the 'ai' configuration category.
UPDATE settings s
SET config_category_id = cc.id
FROM configuration_categories cc
WHERE cc.code = 'ai' AND s.category = 'ai' AND s.config_category_id IS NULL;
