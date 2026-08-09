-- ===================================================================
-- YUNITE API — Central API Gateway tables
--
-- Introduces the controlled API layer for the YUNITE ecosystem:
--   Application → YUNITE API (/api/v1) → Existing Services → Database
--
-- This migration creates the tables that back API clients, API keys,
-- per-client permission scopes, request logging, and endpoint-level
-- overrides (active/inactive, rate-limit overrides). The existing
-- business engines and database remain the source of truth; these
-- tables only govern access to and observability of the gateway.
--
-- All secrets (API key material) are stored ONLY as a SHA-256 hash.
-- The raw key is shown once at generation time and never persisted.
-- ===================================================================

-- -------------------------------------------------------------------
-- api_clients: an application that communicates with YUNITE API
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  client_type   TEXT NOT NULL DEFAULT 'third_party'
                CHECK (client_type IN ('admin_portal','lookup','mobile','third_party')),
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','inactive','suspended')),
  description   TEXT,
  default_tier  TEXT NOT NULL DEFAULT 'standard'
                CHECK (default_tier IN ('public','standard','privileged')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  deactivated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_clients_status ON api_clients(status);

-- -------------------------------------------------------------------
-- api_client_permissions: scopes granted to a client (module.action)
-- Mirrors the role-based permission strings used by the authorization
-- framework (e.g. members.read, transactions.reverse).
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_client_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
  module      TEXT NOT NULL,
  action      TEXT NOT NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, module, action)
);

CREATE INDEX IF NOT EXISTS idx_api_client_perms_client ON api_client_permissions(client_id);

-- -------------------------------------------------------------------
-- api_keys: revocable, expiring credentials for a client.
-- key_hash   = sha256(raw_key)  — the ONLY persisted form.
-- key_prefix = visible identifier (e.g. "yk_live_ab12") for display.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key_prefix    TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','revoked','expired','rotating')),
  environment   TEXT NOT NULL DEFAULT 'live'
                CHECK (environment IN ('live','test')),
  expires_at    TIMESTAMPTZ,
  last_used_at  TIMESTAMPTZ,
  last_used_ip  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  revoked_at    TIMESTAMPTZ,
  revoked_by    UUID,
  revoke_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_client ON api_keys(client_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);

-- -------------------------------------------------------------------
-- api_request_logs: one row per gateway request for observability.
-- NOTE: no request bodies, no auth headers, no key material, no
-- passwords are ever stored here — only operational metadata.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_request_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     TEXT NOT NULL,
  client_id      UUID REFERENCES api_clients(id) ON DELETE SET NULL,
  client_name    TEXT,
  user_id        UUID,
  user_email     TEXT,
  auth_mode      TEXT NOT NULL
                 CHECK (auth_mode IN ('session','api_key','anonymous','denied')),
  method         TEXT NOT NULL,
  path           TEXT NOT NULL,
  endpoint_id    TEXT,
  status_code    INTEGER NOT NULL,
  duration_ms    INTEGER NOT NULL DEFAULT 0,
  ip_address     TEXT,
  user_agent     TEXT,
  error_code     TEXT,
  is_error       BOOLEAN NOT NULL DEFAULT FALSE,
  is_rate_limited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_logs_request_id ON api_request_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_client ON api_request_logs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_status ON api_request_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint ON api_request_logs(endpoint_id);

-- -------------------------------------------------------------------
-- api_endpoint_overrides: allow Super Admin to disable an endpoint or
-- override its rate limit without a code change. The endpoint manifest
-- (defined in code) remains the source of truth for metadata; this
-- table only overrides runtime behaviour.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_endpoint_overrides (
  endpoint_id     TEXT PRIMARY KEY,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  rate_limit_per_minute INTEGER,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID
);

-- -------------------------------------------------------------------
-- Seed the default admin-portal client. The existing web portal is the
-- first YUNITE API client; it authenticates via session (cookie), so it
-- does not require an API key, but it is tracked as a client for
-- observability and to model the ecosystem uniformly.
-- -------------------------------------------------------------------
INSERT INTO api_clients (id, name, slug, client_type, status, description, default_tier)
SELECT '00000000-0000-0000-0000-000000000001',
       'YUNITE Admin Portal',
       'admin-portal',
       'admin_portal',
       'active',
       'The built-in administrative web portal. Authenticates via user session (cookie), not API key.',
       'privileged'
WHERE NOT EXISTS (SELECT 1 FROM api_clients WHERE slug = 'admin-portal');
