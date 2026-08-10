-- ===================================================================
-- 024: Seed API gateway configuration settings
--
-- The API gateway (migration 023) stores clients, keys, permissions,
-- request logs, and endpoint overrides in dedicated tables. This
-- migration seeds a few gateway-level configuration toggles into the
-- existing settings table under the 'api' configuration category
-- (already created in migration 007) so they are governed by the same
-- configuration framework (ConfigurationService) and visible in the
-- System Configuration UI alongside the dedicated API management console.
--
-- These are organization-level toggles only; client/key/endpoint
-- management is NOT duplicated here.
--
-- Idempotent: safe to re-run.
-- ===================================================================

INSERT INTO settings (key, value, category, description, data_type, is_public, display_order, help_text)
VALUES
  ('api.gateway.enabled', 'true', 'api', 'Master switch for the YUNITE API gateway (/api/v1). When false, only session-authenticated portal requests are accepted; API-key access is rejected.', 'boolean', false, 1, 'Disable to block all external API-key access while keeping the portal running.'),
  ('api.gateway.public_docs_enabled', 'true', 'api', 'Expose the public API documentation (OpenAPI/Swagger) and the unauthenticated health endpoint metadata without authentication.', 'boolean', true, 2, 'When enabled, integration partners can discover the API contract anonymously.'),
  ('api.gateway.rate_limit.public', '30', 'api', 'Maximum requests per minute for anonymous/public tier clients.', 'number', false, 3, 'Default 30 req/min.'),
  ('api.gateway.rate_limit.standard', '120', 'api', 'Maximum requests per minute for standard tier API clients.', 'number', false, 4, 'Default 120 req/min.'),
  ('api.gateway.rate_limit.privileged', '600', 'api', 'Maximum requests per minute for privileged tier API clients (e.g. the admin portal).', 'number', false, 5, 'Default 600 req/min.'),
  ('api.gateway.key_expiry_days', '365', 'api', 'Default validity period in days for newly generated API keys. Leave 0 for no expiry.', 'number', false, 6, '0 means keys never expire.')
ON CONFLICT (key) DO NOTHING;

-- Ensure all 'api' settings are linked to the 'api' configuration category.
UPDATE settings s
SET config_category_id = cc.id
FROM configuration_categories cc
WHERE cc.code = 'api' AND s.category = 'api' AND s.config_category_id IS NULL;
