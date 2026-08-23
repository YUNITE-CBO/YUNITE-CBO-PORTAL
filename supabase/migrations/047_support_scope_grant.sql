-- ===================================================================
-- 047: Grant support.read + support.create to the member-lookup portal
--
-- Live failure fixed here: the member portal's "Submit a request"
-- returned "API client lacks permission support.create". The support
-- ticket endpoints (migration 046 / manifest support.list +
-- support.create) are authorized for API-key clients by explicit
-- module.action scopes in api_client_permissions — and no client had
-- the new scopes yet.
--
-- This migration grants support.read + support.create to every ACTIVE
-- API client that either (a) is the member-lookup portal
-- (client_type = 'lookup'), or (b) already holds members.read — the
-- member-lookup portal's client definitely qualifies via (b) even if it
-- was registered under a different client_type. A client that can
-- already read all member records can reasonably file/read member
-- support tickets; admins can revoke either scope per client in
-- Settings → API Keys if a specific client should not have it.
--
-- Idempotent: UNIQUE(client_id, module, action) + ON CONFLICT DO NOTHING.
-- ===================================================================

WITH eligible_clients AS (
  SELECT c.id
  FROM api_clients c
  WHERE c.status = 'active'
    AND (
      c.client_type = 'lookup'
      OR EXISTS (
        SELECT 1 FROM api_client_permissions p
        WHERE p.client_id = c.id AND p.module = 'members' AND p.action = 'read'
      )
    )
)
INSERT INTO api_client_permissions (client_id, module, action)
SELECT e.id, m.module, m.action
FROM eligible_clients e
CROSS JOIN (VALUES ('support', 'read'), ('support', 'create')) AS m(module, action)
ON CONFLICT (client_id, module, action) DO NOTHING;
