# YUNITE-CBO-PORTAL

## Project Overview
Next.js 14 (App Router) enterprise portal for Community-Based Organizations.
Backend: Supabase (Postgres + Storage). Auth: custom JWT sessions (jose) stored in cookies.

## Key Commands
- `npm run dev` – start dev server
- `npm run build` – production build
- `npm run type-check` – `tsc --noEmit`
- `npm test` – jest (test files live in `tests/`)
- DB migrations: `supabase/migrations/*.sql`; manual ones: `supabase/MANUAL_MIGRATION_*.sql`
  (run via Supabase SQL Editor at https://sprlwlxjhhmazxpflhnb.supabase.co/project/-/sql)

## Known Gotchas
- **Session id linkage**: The JWT `session_id` MUST equal the `user_sessions.id`
  of the row created at login. `src/lib/api/principal.ts` resolves sessions by
  `user_sessions.id` using the JWT's `session_id`; if they diverge the gateway
  throws "Session has been revoked" for every authenticated `/api/v1` request
  (including the API Keys & Gateway settings UI). AuthService.login() generates
  one session id and passes it to both generateToken (JWT) and createSession
  (row id). Do not reintroduce independent uuidv4() calls for these.
- **CORS on the gateway** (`src/lib/api/cors.ts`, wired in `src/middleware.ts`):
  cross-origin `/api/v1` access is opt-in via the `YUNITE_API_CORS_ORIGINS` env
  var (comma-separated exact origins). Unset = same-origin only (no CORS
  headers, locked down). Set a single `*` = any origin but NO credentials
  (API-key-only integrations). Otherwise reflect allowlisted origins with
  `Access-Control-Allow-Credentials: true` (cookie + Bearer both work). Preflight
  (`OPTIONS`) is handled in middleware; actual responses get headers via
  `applyCorsHeaders`. `tests/api-gateway-consistency.test.ts` guards this.
- `tests/auth.test.ts` and `tests/integration.test.ts` declare duplicate top-level
  identifiers (API_BASE_URL, TEST_EMAIL, CookieJar). `tsc --noEmit` reports these but
  they are pre-existing and harmless to the build. Filter them with `grep -v tests/`.
- The `settings` table's optional columns from migration 007 (`is_encrypted`,
  `is_public`, `data_type`, `display_order`, `help_text`, etc.) were only
  partially applied on the live DB. Selecting a non-existent column makes
  PostgREST error out and breaks all setting updates. Migration 022 re-applies
  all of migration 007's ALTER statements idempotently. The configuration
  service now selects only `value, data_type` and derives encryption from
  `data_type === 'password'` so a missing optional column cannot break
  setting updates.
- Optional audit/history inserts (`configuration_history`, `audit_logs`) are wrapped in
  try-catch and only `console.warn` on failure; they must never fail the main setting update.

## Conventions
- Service role Supabase client: `createServiceClient()` from `@/lib/supabase/server`.
- Commits use `openhands` author + `Co-authored-by: openhands <openhands@all-hands.dev>`.

## YUNITE API Gateway (`/api/v1`)
- The gateway exposes existing business engines through one controlled boundary.
  Every `/api/v1` route is a thin file that calls `createHandler(endpointId, handler)`
  from `src/lib/api/handler.ts`. The wrapper applies: request-id, endpoint
  active check, principal resolution (session cookie OR `Authorization: Bearer
  yk_...`), authorization, rate limiting, execution, error handling, and request
  logging (operational metadata only - no secrets).
- **Endpoint manifest** (`src/lib/api/manifest.ts`) is the single source of truth
  for endpoint metadata (id, method, path, module, action, auth, minRole,
  financial, rateLimitPerMinute). Adding an endpoint = add a manifest entry AND
  its route file. The `createHandler('id')` id MUST exist in the manifest or the
  wrapper throws 500 "Unknown endpoint". `tests/api-gateway-consistency.test.ts`
  guards this - run it after touching any v1 route.
- **Auth/permissions**: session auth reuses the role matrix in
  `src/lib/auth/authorization.ts` (super_admin bypasses). API-key auth uses the
  explicit `module.action` scopes granted to the client
  (`api_client_permissions`). The `api.*` management endpoints are
  `super_admin`-only (the `api` module is intentionally NOT in the PERMISSIONS
  matrix, so only super_admin - which bypasses - can access them).
- **API keys** are stored only as SHA-256 hashes (`hashApiKey`); the raw key is
  shown once at generation. Prefixes: `yk_live_` / `yk_test_`.
- **Permission scopes**: a scope is `module.action` derived from the endpoint
  manifest. `AVAILABLE_SCOPES` (manifest.ts) dedups by `module.action` and
  excludes the internal `api` module → **37 distinct grantable scopes**. Grants
  MUST be validated against `AVAILABLE_SCOPES` via `parseScopeList`
  (`src/lib/api/scopes.ts`) before storing in `api_client_permissions`; the
  `api_client_permissions` table is free-form TEXT with no FK, so unvalidated
  grants become dead/typo rows that never match `authorize()`. The scope editor
  in `ApiSettingsSection.tsx` is shown on both create and edit
  (`showScopesEditor`); hiding it on create silently produces scopeless clients.
- **API settings UI**: Settings -> System Configuration -> API Keys
  (`src/components/settings/ApiSettingsSection.tsx`) drives the
  `/api/v1/management/*` surface (clients, keys, scopes, endpoint overrides,
  logs, overview). Super_admin only; the section renders a restricted notice for
  others. Gateway-level toggles also live as `api.*` rows in the `settings`
  table under the `api` configuration category (migration 024).
- **API docs**: OpenAPI 3.0 at `GET /api/v1/docs/openapi.json` (generated from
  the manifest via `src/lib/api/openapi.ts`), docs index at `GET /api/v1/docs`,
  Swagger UI at `/dashboard/api-docs`. See `API.md` (YUNITE API Gateway section).
