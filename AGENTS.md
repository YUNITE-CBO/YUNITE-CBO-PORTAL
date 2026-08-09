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
