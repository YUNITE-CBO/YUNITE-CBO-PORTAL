-- ===================================================================
-- 048: Grant meetings.read to the member-lookup portal API client
--
-- Closes member-lookup-frontend/API_GAPS.md gap #2: the portal's home
-- page showed "Upcoming meeting details will appear here once the YUNITE
-- meetings service is connected" because meetings were only reachable at
-- the session-auth GET /api/meetings — not through the API-key gateway.
-- The new GET /api/v1/meetings endpoint (manifest id meetings.list,
-- scope meetings.read) fixes the endpoint half; this migration fixes the
-- authorization half by granting meetings.read to every ACTIVE API
-- client that either (a) is the member-lookup portal
-- (client_type = 'lookup'), or (b) already holds members.read — the
-- portal client definitely qualifies via (b). Meetings contain no
-- financial data; a client trusted to read member records can reasonably
-- read the meeting schedule. Admins can revoke the scope per client in
-- Settings → API Keys.
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
SELECT e.id, 'meetings', 'read'
FROM eligible_clients e
ON CONFLICT (client_id, module, action) DO NOTHING;
