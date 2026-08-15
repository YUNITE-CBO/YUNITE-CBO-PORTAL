# YUNITE-CBO-PORTAL

## Project Overview
Next.js 14 (App Router) enterprise portal for Community-Based Organizations.
Backend: Supabase (Postgres + Storage). Auth: custom JWT sessions (jose) stored in cookies.

## Key Commands
- `npm run dev` â€“ start dev server
- `npm run build` â€“ production build
- `npm run type-check` â€“ `tsc --noEmit`
- `npm test` â€“ jest (test files live in `tests/`)
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
- `tests/auth.test.ts` and `tests/integration.test.ts` each declared the same
  top-level identifiers (API_BASE_URL, TEST_EMAIL, CookieJar) with no
  `import`/`export`, so `tsc --noEmit` treated them as global scripts and
  reported duplicate-identifier errors. Fixed by adding `export {}` to each
  file, making them modules with file-local scope. (`tsc --noEmit` is now
  fully clean; these two suites still fail at runtime because they need a
  live server via `fetch` â€” that's expected, not a type error.)
- **Notification content (subject/body)**: migration 004 created `notifications`
  with legacy `title`/`message` (NOT NULL). Migration 005 intended `subject`/`body`
  but its `CREATE TABLE IF NOT EXISTS` was skipped (table existed) and its ALTERs
  never added `subject`/`body`, so the service + frontend (which read
  `subject`/`body`) rendered blank notification content in the bell dropdown and
  notifications page â€” only the unread count (from `status`) worked. Migration 028
  reconciles this: adds `subject`/`body`, backfills from `title`/`message`, and a
  trigger keeps `title`/`message` in sync with `subject`/`body` for any legacy
  consumer. The service + `auth-notification.service.ts` now insert both pairs.
  A new `GET /api/notifications/[id]` route (session-scoped: recipient or
  super_admin only; optional `?mark_read=true`) and `/dashboard/notifications/[id]`
  page let users open the full body of a notification. The bell dropdown rows and
  the notifications list/history rows now link to that detail page and auto
  mark-read on open. Deploy step: run migration 028 in Supabase SQL Editor.
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

## Workflow & Automation Engine (existing infrastructure + gaps)
A substantial notification/automation stack already exists in
`src/lib/services/notifications/` but has critical dead-code gaps:
- **Event service** (`event.service.ts`): `notificationEventService.emit(event)`
  is event-driven and LIVE â€” called from `member-registration.service.ts`,
  `loan.service.ts`, `transaction.engine.ts`, and `/api/members/[id]`. Logs to
  `notification_event_logs`, matches `EVENT_TEMPLATE_MAPPINGS` (member/savings/
  loan/fine/contribution), resolves recipients, calls `notificationService.sendFromTemplate`.
  Helpers: `emitMemberRegistered`, `emitLoanApplication`, `emitSavingsDeposit`.
- **Schedule service** (`schedule.service.ts`): `scheduleService.processDueSchedules()`
  + `executeSchedule()` reads `notification_schedules` where `next_run_at <= now`,
  resolves recipients (`all_members`/`active_members`/`admins`/`loans_overdue`/
  `welfare_pending`), sends from template, advances `next_run_at`. **BUT
  `processDueSchedules()` HAS ZERO CALLERS** â€” there is no cron/Vercel cron/Render
  cron (`render.yaml` has no cron block) and no `node-cron`. Schedules never fire.
- **Statement service** (`statement.service.ts`, 957 lines): generates member/
  org/loan/savings statements into `notification_statements` with
  opening/closing/transactions. Already supports member_weekly/member_monthly/
  organization_summary. `buildOrgSummary` exists. **No forecast engine** (only
  historical).
- **Notification service** (`notification.service.ts`): `sendFromTemplate(code,
  recipient, variables, opts)` sends in-app + enqueues `email_queue` row.
- **API routes** all exist: `notifications/events`, `notifications/schedules`,
  `notifications/statements`, `notifications/templates`, `notifications/preferences`,
  `notifications/actions` (email queue processing), `audit`.
- **Settings UI** (`src/app/dashboard/settings/page.tsx`, 1487 lines): renders
  `configuration_categories` with config-status badges. The "Workflow â€” Not Set"
  the user sees = the `workflow` config category seeded in migration 007
  (line ~142: `('workflow','Workflow','Approval workflows and automation',
  'git-branch','#0891B2',13)`). Shows "Not Set" because no `settings` rows under it
  have values.
- **Approval workflow**: `member_approval_workflow` table (migration 007) is a real
  stage machine (documentationâ†’reviewâ†’approvalâ†’completed/rejected) for member
  registration. `members.workflow_stage` + `update_member_workflow_stage()` fn.
  No generalized approval engine for loans/transaction reversals.
- **Meetings**: `meetings` + `meeting_attendance` tables exist (migration 004) but
  NO service/route/UI â€” purely schema. No meeting events in EVENT_TEMPLATE_MAPPINGS.
- **Schema conflict (must reconcile)**: migrations 005 and 012 define CONFLICTING
  columns for `notification_statements`, `notification_event_logs`,
  `notification_preferences`, `email_queue`, `notification_delivery_history`.
  Services assume the richer 005 schema (`recipient_email`/`title`/`summary`/
  `generated_data`/`schedule_id` on statements; `event_id`/`status`/`received_at`
  on event_logs; `owner_type`/`owner_id` on preferences). A reconciliation migration
  is needed before building on top â€” verify live DB columns first.
- **Missing for a real engine**: (1) a cron/scheduler runtime to call
  `processDueSchedules()`; (2) a `member_financial_obligations` view/table
  centralizing loan+savings+membership+welfare+fines with due/upcoming/overdue/
  partial/paid/waived status; (3) configurable reminder lead times
  (7/3/1-day-before); (4) a unified `automation_runs` history table
  (statements generated / emails sent / no-email skipped); (5) email retry logic;
  (6) financial forecast engine (30/90-day); (7) super-admin alert center with
  critical/warning/info tiers.
- **Phase 1 IMPLEMENTED** (the clock + foundation): migration
  `025_workflow_automation_engine.sql` reconciles the 005/012 schema conflicts
  with idempotent `ADD COLUMN IF NOT EXISTS`, adds `automation_runs` (unified
  history) + `automation_locks` (row mutex vs overlapping cron) + the
  `member_financial_obligations` VIEW (loans+fines; contributions/welfare later),
  seeds `workflow.*` toggles + reminder lead times under the `workflow` config
  category, seeds default weekly/monthly statement schedules, and 7 new
  templates (statement.weekly/monthly, loan.payment_due/overdue, fine.outstanding,
  admin.obligation_overdue, admin.financial_forecast).
  `src/lib/services/automation/runner.service.ts` = `automationRunner.tick()`
  orchestrator: acquires a 5-min TTL lock, runs `emailService.processQueue()` +
  `scheduleService.processDueSchedules()` + obligations reminders + weekly/monthly
  statement cadence, each gated by `workflow.*` toggles and wrapped so one step's
  failure can't abort others, all logged to `automation_runs`. The obligations step
  reads the view and emits overdue/due-today reminders through the LIVE
  `notificationService.sendFromTemplate` with per-day idempotency keys.
  `/api/cron/automation` (GET+POST) is `CRON_SECRET`-protected (header or query),
  added to `publicReadPaths` in `src/middleware.ts` (it cannot use session auth
  since Render cron carries no cookie). `render.yaml` adds a `cron` service
  (`yunite-automation-tick`, `*/5 * * * *`) that curls the endpoint with the
  `X-Cron-Secret` header, plus `CRON_SECRET` env var on the web service.
  **Deploy steps**: run migration 025 in Supabase SQL Editor; set `CRON_SECRET`
  (same value) on both the web service and cron service in Render Dashboard;
  set `AUTOMATION_ENDPOINT` to `https://<web-service>.onrender.com/api/cron/automation`.
- **Still to build (Phases 2-5)**: (P2) configurable 7/3/1-day-before + overdue
  repeat logic in the obligations step (currently overdue+due-today only);
  contributions/welfare rows in the obligations view; (P3) financial forecast
  engine (30/90-day) + super-admin alert tiers (critical/warning/info); (P4)
  replace the "Workflow â€” Not Set" badge in `dashboard/settings/page.tsx` with a
  real WorkflowsSettingsSection control panel + Automation History view reading
  `automation_runs`; (P5) meetings service/route/UI on the existing `meetings`
  table + meeting events in EVENT_TEMPLATE_MAPPINGS + generalized approval
  workflows for loans/transaction reversals.
- **Phase 2 IMPLEMENTED** (obligations engine completed): migration
  `026_obligations_contributions_welfare.sql` replaces the
  `member_financial_obligations` view to add contributions + welfare rows
  (expected from `contributions.monthly_default` / `welfare.monthly_amount`
  settings; paid from current-month `contribution_monthly` /
  `welfare_deposit` transactions; due_date = last day of month), adds a
  `last_day_of_month()` SQL helper, a reminder-lookup index on `notifications`,
  and 4 new templates (contribution.due/overdue, welfare.due/overdue).
  `runner.service.ts` `processObligationsReminders()` refactored with
  `decideReminder()` + `templateFor()`: upcoming reminders fire on configurable
  lead days (7/3/1), due-today fires, overdue repeats every
  `overdue_repeat_days` (default 7) via `days_overdue % repeat === 0` (no per-row
  DB lookback needed). Per-day idempotency keys still guard same-tick de-dup.
- **Phase 4 IMPLEMENTED** (settings UI): `WorkflowsSettingsSection.tsx`
  component replaces the generic "Workflow â€” Not Set" badge with a real control
  panel â€” toggle switches for every `workflow.*` boolean, number inputs for lead
  times/cadence days, grouped into Engine/Channels/Reminders/Statements/Meetings/
  Alerts sections, saved via `PUT /api/configuration` (same audit framework as
  the rest of settings). Includes an Automation History table reading
  `automation_runs` and a "Run Now" button. Wired into the settings page:
  `workflow` added to `ActiveSection` type + category icon + render branch.
  Two new session-authenticated routes: `GET /api/automation/runs` (history,
  admin+) and `POST /api/automation/trigger` (manual tick, admin+) â€” the latter
  lets admins force a tick without the CRON_SECRET the cron route needs.
- **Phase 3 IMPLEMENTED** (forecast + alert tiers): `forecast.service.ts`
  `financialForecastService.generate()` blends trailing-90-day actuals
  (avg daily net extrapolated forward) with known upcoming loan repayments
  (monthly_repayment Ă— months, capped at remaining) and expected monthly
  contributions/welfare (settings Ă— active member count) into 30/90-day
  projections + current cash position. `generateAlerts()` derives
  critical/warning/info tiers (negative cash position = critical; negative 30d
  projection = critical; overdue obligations/defaulted loans = warning; pending
  approvals = info). Wired into the runner as a 5th step
  `processForecastAndAlerts()`: forecast emailed to super admins on the monthly
  statement day via `admin.financial_forecast`; alert tiers evaluated every tick
  and emitted as in-app notifications (per-day idempotent). Exported from the
  automation barrel.
- **Phase 5 IMPLEMENTED** (meetings): `meetings.service.ts` (create/update +
  broadcast to all active members on create/update/cancel, gated by
  `workflow.meetings.notifications`). `runner.service.ts` gained a `processMeetingReminders()`
  step: parses `workflow.meetings.reminder_offsets` (e.g. "7d,3d,1d,2h") via
  `parseOffsets()` and fires `meeting.reminder` to active members when now is
  within a tick window (~6 min) of an offset before a meeting's start; per
  meeting+offset+member+day idempotency. API routes: `GET/POST /api/meetings`
  and `GET/PUT /api/meetings/[id]` (admin+ for write). Migration 027 seeds
  meeting.created/cancelled/reminder templates + a `meetings` notification
  category. Note: there is no meetings dashboard page yet â€” only the API +
  service + reminders. A full meetings UI page is a follow-on.

## Document Generation & Export Engine (`src/lib/services/reports/`)
A full bank-style document generation engine produces branded, certified,
downloadable PDF/CSV documents for every reportable surface: financial
summary, member register, loan portfolio, transaction ledger, contributions,
fines, member statement of account, welfare fund, and organization summary.
- **Brand** (`brand.ts`): single source of truth for org identity (Yunite
  Pamoja CBO, Nairobi/Kariobangi North, info.yunite.ke@gmail.com), the
  navy `#0B2A4A` + luminous green `#22C55E` palette (from the logo),
  inline `LOGO_SVG` + `STAMP_SVG` (so generated HTML is self-contained â€”
  no external asset requests during headless rendering), copyright text,
  and `formatMoney`/`formatDate`/`formatDateTime` helpers.
- **Renderer** (`report-renderer.ts`): `renderDocument(ctx, payload)` builds
  the full HTML â€” letterhead (logo + org identity + accent bar), report
  title/eyebrow, meta block (type/period/ref/issued-by/currency), body
  (KPIs + tables per report type), a digital certification stamp with
  substituted `__REF__`/`__HASH__`/`__DATE__`/`__VERIFY_URL__` traceability
  fields, and a footer with copyright + doc ref + auth hash + verify URL.
  Each render returns a unique `doc_ref` (`YP-DOC/<TYPE>/...`) and a
  SHA-256 `auth_hash` (16 hex chars) for traceability.
- **Data service** (`report-data.service.ts`): `reportDataService`
  aggregates live data from the transaction ledger + domain tables via
  `createServiceClient()` for all 9 report types. Member statements derive
  opening/closing balances + per-account breakdown via
  `transactionEngine.calculateBalance`.
- **PDF/CSV** (`document-generator.ts`): `htmlToPdf(html)` renders via
  headless Chromium using `puppeteer-core` (NOT `puppeteer` â€” see the
  BUILD FAILURE note below for why `puppeteer`'s `install.mjs` postinstall
  must be avoided). The browser is bundled in puppeteer's cache
  (`~/.cache/puppeteer`), populated by `scripts/install-browser.js` which
  runs as the npm `postinstall` hook during `npm ci`. NO system package or
  root install is needed. `resolveChromium()` prefers an explicit
  `PUPPETEER_EXECUTABLE_PATH`/`CHROMIUM_PATH`/`CHROME_PATH` override (only
  if it exists on disk â€” a stale env var pointing at a missing path is
  skipped, not fatal), then probes the cache directory directly (via
  `@puppeteer/browsers`' `getInstalledBrowsers()`, NOT
  `puppeteer.executablePath()`, which honors `PUPPETEER_EXECUTABLE_PATH`
  and would miss the cache when that env var is stale), then common system
  Chromium paths.
  **Why a custom postinstall**: `puppeteer-core` ships NO postinstall
  download step (unlike `puppeteer`), so nothing populates the browser
  cache during `npm ci`. `scripts/install-browser.js` does it instead,
  calling `@puppeteer/browsers`' `install()` directly with the build pinned
  in `puppeteer-core`'s revisions (so the binary matches the driver â€” using
  "stable"/latest instead crashes with "Navigating frame was detached"),
  ignoring `PUPPETEER_SKIP_DOWNLOAD`/`PUPPETEER_EXECUTABLE_PATH`.
  **Gotcha**: do NOT pass `--single-process` to `puppeteer.launch` â€” it
  breaks modern Chrome (131+) with "Target.setDiscoverTargets: Target
  closed". The browser is cached per-process; `closeBrowser()` must be
  called in long-lived test/lambda contexts to let the process exit.
  `reportToCsv()` produces spreadsheet exports directly (no browser needed).
- **Export orchestrator** (`document-export.service.ts`):
  `documentExportService.generate(opts)` gathers data â†’ renders HTML â†’
  generates PDF/CSV â†’ persists an immutable audit row in
  `generated_documents` (best-effort; warns on failure per project
  convention). `listHistory()` + `verifyByRef()` power the history table
  and public verification.
- **Migration 029** (`029_generated_documents.sql`): the
  `generated_documents` audit ledger (doc_ref UNIQUE, auth_hash, report_type,
  format, period, member_id, generated_by, IP/UA, expires_at, revoked*) +
  `generated_document_verifications` view. Run in Supabase SQL Editor on
  deploy.
- **API routes**: `GET /api/reports` (catalog), `GET|POST
  /api/reports/generate` (download â€” POST for JSON body, GET for `<a href>`
  convenience; both staff+ gated, both record the audit row), `GET
  /api/reports/history` (audit trail), and **public** `GET
  /api/reports/verify/[ref]` (no auth â€” anyone holding a printed doc can
  authenticate it). The middleware lets GET `/api/*` through and the routes
  do their own `getAuthenticatedUser` check; the public verify route needs
  no session.
- **UI**: `src/app/dashboard/reports/page.tsx` replaced the stub `alert()`
  with real PDF/CSV download buttons per report type, a period selector,
  a branded letterhead preview banner, a document-history table, and an
  inline `VerifyWidget`. `src/app/dashboard/members/[id]/page.tsx` got
  "Statement (PDF)"/"CSV" buttons on the Personal Information card.
  Public `src/app/verify/page.tsx` (landing form) + `src/app/verify/[ref]/page.tsx`
  (result page) let external parties verify a document by ref.
- **Tests**: `tests/report-renderer.test.ts` (brand identity, formatters,
  letterhead/stamp/traceability, per-type bodies), `tests/report-document.test.ts`
  (CSV export + period resolver), `tests/smoke-pdf.test.ts` (real Chromium
  PDF render â†’ valid `%PDF-` buffer; uses `closeBrowser()` + `--forceExit`).
  Run report tests with:
  `npx jest tests/report- --testTimeout=90000 --forceExit`
  (Chromium comes from the puppeteer cache; no `PUPPETEER_EXECUTABLE_PATH`
  needed. If a system Chromium is preferred locally, set
  `PUPPETEER_EXECUTABLE_PATH` to it before running.)
- **Deploy steps**: run migration 029 in Supabase SQL Editor. Chromium for
  PDF generation is installed automatically by the `postinstall` hook
  (`scripts/install-browser.js`, run during `npm ci`) which force-downloads
  the pinned Chrome build into puppeteer's cache. This works regardless of
  `PUPPETEER_EXECUTABLE_PATH`/`PUPPETEER_SKIP_DOWNLOAD` env values, so stale
  Render Dashboard env vars can no longer break PDF generation. No manual
  Chromium setup, root, or apt-get is needed.
- **CRITICAL â€” live Render was running STALE code (PDF "Chromium executable
  not found")**: on 2026-08-13 the Reports & Documents page threw "Export
  failed: Chromium executable not found ... downloaded during `npm ci`
  (puppeteer postinstall); ensure PUPPETEER_SKIP_DOWNLOAD is unset ...". That
  error string is from commit `4f98ac1`, NOT the repo HEAD `477f7b5` (whose
  message names `scripts/install-browser.js`). So the live deployment was
  running an older build than `main`; the repo's fixes simply hadn't been
  deployed. The OLD `resolveChromium()` used `puppeteer.executablePath()`,
  which honors a stale `PUPPETEER_EXECUTABLE_PATH` (set in the Render
  Dashboard to a cache path that didn't exist at runtime) â†’ skipped the
  bundled cache and fell through to system paths (none on Render free tier)
  â†’ hard fail. `resolveChromium()` was hardened: it is now async and uses
  `@puppeteer/browsers`' `getInstalledBrowsers()` (env-agnostic â€” reads the
  cache directly, so a stale `PUPPETEER_EXECUTABLE_PATH` can no longer mask
  the bundled browser; an empty cache dir returns [] cleanly instead of the
  old readdirSync loop that produced zero candidates). `SYSTEM_PATHS` was
  expanded to include the real binaries `/usr/lib/chromium/chromium`,
  `/usr/lib/chromium-browser/chromium`, and `/usr/bin/google-chrome-stable`
  (some distros ship `/usr/bin/chromium` as a tiny shell *wrapper* whose real
  ~300 MB binary lives in `/usr/lib/chromium/`). Verified locally: clean env,
  stale-env-pointing-at-missing-path, AND empty-cache-dir all render PDFs.
  **Action to fix the live site: redeploy `main` (the repo HEAD already
  contained the working fix; this commit hardens it). Also clear the stale
  `PUPPETEER_EXECUTABLE_PATH`/`PUPPETEER_SKIP_DOWNLOAD`/`CHROME_BIN` env vars
  in the Render Dashboard â€” `render.yaml` deliberately does NOT set them;
  setting `PUPPETEER_EXECUTABLE_PATH` makes puppeteer's own postinstall skip
  the download. After redeploy, confirm the postinstall log shows
  `[install-browser] chrome <build> already cached at ...` (or "downloading").**
- **BUILD FAILURE (2026-08-13, FIXED by switching `puppeteer` â†’ `puppeteer-core`)**:
  the build FAILED during `npm ci` with puppeteer's own `install.mjs` throwing
  `Failed to set up chrome v131.0.6778.204! [cause]: The browser folder
  (.../chrome/linux-131.0.6778.204) exists but the executable is missing`.
  Render persists `/opt/render/.cache` across builds; a prior build left a
  CORRUPT chrome entry (folder present, binary absent), and
  `@puppeteer/browsers`' `install()` THROWS on a corrupt folder instead of
  re-downloading â€” aborting `npm ci` before our root `postinstall`
  (`scripts/install-browser.js`) ever ran. The PREVIOUS fix
  (`render.yaml` setting `PUPPETEER_SKIP_DOWNLOAD="true"`) did NOT work in
  practice: Render only applies `envVars` from a blueprint when the blueprint
  is explicitly synced to the service; a manual deploy or a stale Dashboard
  override leaves the env var absent, so `install.mjs` still ran and crashed.
  FIX (robust, repo-self-contained): the app now imports `puppeteer-core`
  (NOT `puppeteer`). `puppeteer-core` ships NO `install.mjs` postinstall
  step, so `npm ci` can NEVER crash on a corrupt browser cache regardless of
  env vars. The single Chrome build we use is installed by our own
  `postinstall` (`scripts/install-browser.js`) directly via
  `@puppeteer/browsers`' `install()` (gated by NO env var), which is also
  hardened against the corrupt-cache bug: it `existsSync()`s the listed
  `executablePath`, and if missing, `uninstall()`s the corrupt entry and
  re-downloads. `render.yaml` still sets `PUPPETEER_SKIP_DOWNLOAD="true"` as
  belt-and-suspenders but it is no longer load-bearing. We do NOT set
  `PUPPETEER_EXECUTABLE_PATH` (stale values mask the bundled cache at
  runtime); the document generator probes the cache via
  `getInstalledBrowsers()`. Verified locally: corrupt chrome cache (folder
  present, executable missing, stale `.metadata`) + NO skip env var â†’
  `npm ci` succeeds (no install.mjs to crash), `install-browser.js` detects
  the corrupt chrome, reinstalls, and `getInstalledBrowsers()` finds a
  working executable; PDF smoke test passes with `puppeteer-core`. NOTE: if
  the build STILL fails, the Render build cache itself is corrupt â€” clear it
  via Render Dashboard â†’ Service â†’ Settings â†’ Manual Deploy â†’ "Clear build
  cache & deploy".

## AI Intelligence Engine (`src/ai/`) — Dual-AI Investigation & QA
A production-grade dual-AI investigation + consistency engine. Gemini and
OpenRouter independently investigate YUNITE through read-only, PII-sanitized
tools, produce separate reports, and a comparison engine reconciles them.
**The database + deterministic engines remain the source of truth — AI
investigates the system, it does not become the system.** AI never invents
financial values, never modifies financial records, never runs arbitrary SQL,
and never receives DB credentials/service-role keys (the sanitizer strips
passwords/tokens/api keys/PII before anything reaches a provider).
- **Provider abstraction** (`src/ai/providers/`): the rest of the engine
  depends ONLY on the `AiProvider` interface, never a concrete provider.
  Gemini + OpenRouter both implement it and receive the SAME context + tools
  payload (so neither sees the other's conclusions before producing its
  report — dual-AI independence).
- **Failover** (`failover.ts`): primary Gemini → secondary OpenRouter. The
  `AI_FAILFAST_TIMEOUT_MS` (default 1000ms) is a FAILURE-DETECTION probe
  only — it does NOT cap max generation duration. A valid slow generation
  runs to completion. Both-fail → deterministic findings still produced
  (investigation marked `partial`, `ai_status = unavailable`).
- **Deterministic engines** (`src/ai/engines/`): database-consistency,
  financial-consistency (independent `SUM(transactions)` vs stored balance),
  cross-module, business-rules (CONFIG vs IMPLEMENTATION vs DB vs DISPLAY),
  api-consistency (read-only GETs only), member-verification (DB → API →
  MEMBER LOOKUP DISPLAY per-field). Always run before AI; AI explains the
  discrepancy, never guesses the calc.
- **Comparison engine** (`comparison.engine.ts`): agreements, gemini-only,
  openrouter-only, disagreements (marked `REQUIRES VERIFICATION` — never
  auto-promoted to fact), verified (deterministic-aligned), human-review.
- **Orchestrator** (`investigation.engine.ts`): `runInvestigation(scope,
  memberId?)` → deterministic → dual independent AI → comparison → persist →
  alert. Scope `full_system` / `member_verification` run BOTH providers.
- **Alerting** (`alerting.service.ts`): CRITICAL findings → internal YUNITE
  notification (per-day idempotent) + best-effort email. **No sensitive
  financial values in email** — full evidence stays in the Admin Console.
  Wired into `runInvestigation` AND the cron route.
- **Migration 030** (`030_ai_intelligence_engine.sql`): `ai_investigations`,
  `ai_reports`, `ai_findings`, `ai_evidence`, `ai_provider_runs`,
  `ai_provider_failures`, `ai_comparisons`, `ai_member_verification_results`,
  `ai_health_snapshots`, `ai_investigation_schedules`. Run in Supabase SQL
  Editor on deploy.
- **API routes** (`/api/ai/*`): `health`, `investigations` (GET list / POST
  run / `[id]` detail / `[id]/compare`), `reports/[id]`, `member-verification`
  (POST), `schedules` (GET / POST super_admin / `[id]` PUT+DELETE
  super_admin). All session-authenticated via `src/app/api/ai/_guard.ts`
  (`requireAdminAuth` mirrors `automation/trigger`; `requireSuperAdmin` for
  schedule writes). Cron route `/api/cron/ai-investigations` is
  `CRON_SECRET`-protected (no session) and added to `publicReadPaths` in
  `src/middleware.ts`.
- **Admin Console**: `/dashboard/ai-intelligence` (nav link added in
  `dashboard/layout.tsx`). Six sections — Overview, Gemini (independent),
  OpenRouter (independent), AI Comparison, Report History, Schedules. The
  Gemini + OpenRouter tabs are deliberately kept separate so an admin can
  inspect one provider's reasoning without the other's.
- **render.yaml**: `yunite-ai-investigations-tick` cron service
  (`*/30 * * * *`) curls the CRON_SECRET endpoint. Web service env vars:
  `AI_PROVIDER`, `AI_DUAL_MODE`, `GEMINI_API_KEY`, `GEMINI_MODEL`,
  `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`,
  `AI_FAILFAST_TIMEOUT_MS`, optional `MEMBER_LOOKUP_VERIFY_URL`/`_SECRET`,
  and `CRON_SECRET` (shared with the existing automation cron).
- **Performance**: member lookup is NEVER blocked by AI — the normal flow
  is untouched. AI verification runs on demand / async / via scheduled jobs.
- **Tests**: `tests/ai-intelligence.test.ts` (22: parsing, prompt, PII +
  secret sanitization, comparison, scoring, failover incl. slow-generation
  not truncated + both-fail), `tests/ai-member-verification.test.ts` (6:
  VERIFIED / CRITICAL DISPLAY MISMATCH on intentional wrong value / DB-vs-API
  drift / unavailable-display fallback / identity mismatch / read-only
  assertion). Run: `npx jest tests/ai-intelligence tests/ai-member-verification`.
  Full doc: `AI_INTELLIGENCE.md`.
- **DEEP FORENSIC UPGRADE** (migration 031 + engine/persistence/UI rewrite):
  The AI engine was upgraded from a summary/reporting assistant into a **deep
  forensic system investigator**. Every finding now carries a full `location`
  (FindingLocation: database table/field/record, backend module/controller/
  service/route/method, frontend application/page/component/field, member_id/
  member_number, business_rule, source_calculation), `expected_value`,
  `actual_value`, `difference`, `affected_records`, `is_systemic`,
  `related_tables`, and `is_verified`. The AI prompt DEMANDS this level of
  detail and the response-parser extracts it. A finding at the level of
  "FIN-0047 — Savings Module → Member Account Balance, MBR-00123, DB
  member_accounts.savings_balance KES 20,000 vs ledger KES 18,500, Δ KES
  1,500, backend GET /api/members/:id/financials, frontend
  member-lookup-frontend/FinancialSummary, root cause: desync" is now the
  standard, not the exception (req. #1, #2, #3, #32).
  - **Financial engine** deepened: each balance finding traces DATABASE
    (independent ledger) → CALCULATION (engine) → STORED (balance_after) with
    the exact table/field, backend route/service, and a systemic flag when >3
    members affected (req. #5, #15, #21).
  - **Member verification engine** deepened: each field result now traces the
    value through DATABASE → CALCULATION → BACKEND API → MEMBER LOOKUP →
    FRONTEND DISPLAY and identifies the EXACT layer where the first divergence
    occurs (`mismatch_layer`), plus the frontend component (req. #16).
    `runMemberForensic` (depth deep/forensic) builds the complete member data
    graph (profile/compliance/accounts/savings/shares/contributions/welfare/
    fines/loans/repayments/documents/notifications + layered balances) and
    produces the sectioned member report (Member Profile / Compliance /
    Financial Position / Data Consistency / API Consistency / Member Lookup
    Consistency / Business Rule Compliance / Anomalies / AI Evaluation / Final
    Evaluation) (req. #12, #13, #14, #15, #17).
  - **Comparison engine** deepened: findings are now matched by a deep location
    key (module + DB table/field + backend route + frontend component + member)
    so two providers reporting the SAME field at the SAME location are
    correlated even when their wording differs entirely. Disagreements are
    classified by type (severity / root-cause / value-difference / expected-
    value difference) with a human-readable reason. Disputed findings are never
    auto-promoted to fact (req. #10, #29).
  - **Module health map** (`module-health.engine.ts`): `buildModuleHealthMap()`
    aggregates findings into a per-module health (healthy/warning/inconsistent)
    with affected-members/records counts and total difference. GET
    `/api/ai/module-health` powers the clickable map (req. #20, #21).
  - **Member search**: `searchMembers(query)` matches name/number/id/phone/
    email server-side and returns candidates with matched_by fields. POST
    `/api/ai/member-search` drives the UI candidate selection (never guesses
    when multiple match) (req. #11, #18).
  - **Investigation depth** (req. #25): `runInvestigation` accepts `depth`
    (quick/standard/deep/forensic; member verification defaults to 'deep') and
    `dualMode` (auto/single/dual). Stored on `ai_investigations.depth` +
    `.dual_mode` (migration 031).
  - **Dual AI mode** (req. #8): 'single' = one provider; 'dual' = both
    independently (blind). 'auto' honors AI_DUAL_MODE env for dual scopes.
    PARTIAL DUAL INVESTIGATION: if one provider fails, the other's report is
    preserved (req. #30).
  - **Persistence bugs FIXED** (req. #28 — root cause of "No investigations
    yet" + report loading failures): `listInvestigations` selected `completed_at`
    (column is `finished_at`) + missing `duration_ms`/`info_count` → PostgREST
    errored → null → UI showed "No investigations yet" even when rows existed.
    `listReports` selected `report_ref` (column is `report_id`) + `summary`
    (not a column — lives in `report_json.summary`). `getVerificationResult`
    queried `ai_member_verification_results` (table is `ai_verification_results`).
    All three fixed; `listFindings` added to load deep fields for the detail
    view; `persistReport` now stores location/expected/actual/difference/
    affected_records/is_systemic/related_tables/is_verified on each finding.
  - **Dashboard UI** (`dashboard/ai-intelligence/page.tsx`) completely
    redesigned: 14 tabs (Overview / Critical Findings / Modules / Database /
    Backend / APIs / Business Rules / Member Lookup / Gemini / OpenRouter /
    Comparison / Evidence / Recommendations / History) + Schedules. Module
    health map with click-through drill-down. Member search with candidate
    selection. `DeepFindingCard` renders the full forensic location + value
    comparison + evidence chain. Depth selector + dual-mode toggle in the
    actions bar. History table with AI-status + partial-dual indicator.
    `VerificationResultView` shows the full layer trace with mismatch_layer
    per field (req. #26, #27).
  - **Migration 031** (`031_ai_forensic_deep_findings.sql`): adds `location`
    (JSONB), `expected_value`, `actual_value`, `difference`, `affected_records`
    (TEXT[]), `is_systemic`, `related_tables` (TEXT[]), `is_verified` to
    `ai_findings`; `depth` + `dual_mode` to `ai_investigations`; indexes on
    `ai_findings(module)` + `(module, severity)`. Idempotent (ADD COLUMN IF
    NOT EXISTS). Run in Supabase SQL Editor on deploy.
  - **Tests**: `tests/ai-forensic-deep.test.ts` (18: deep finding model,
    response-parser location extraction, prompt depth/dual mode, comparison
    deep-location matching + disagreement classification, module health map
    aggregation/sorting/normalization, acceptance-criteria FIN-0047 detail,
    score-accompanies-evidence). Total AI tests: 46 (28 original + 18 new),
    all passing. Run: `npx jest tests/ai- --testTimeout=15000 --forceExit`.
  - **Deploy steps**: run migration 031 in Supabase SQL Editor (after 030).

- **AI Intelligence settings (Dual Mode toggle)**: the AI Intelligence
  dashboard's "Dual Mode: OFF" stat card previously reflected ONLY the
  `AI_DUAL_MODE` env var (a Render redeploy to change, no UI control). The
  per-run "AI Mode" dropdown only affected the next run, not a persistent
  setting. Fixed: Dual AI Mode is now a first-class, persistent,
  admin-toggleable organization setting. Migration `033_ai_intelligence_settings.sql`
  creates an `ai` configuration category + three settings rows
  (`ai.dual_mode`, `ai.investigations.enabled`, `ai.alerts.critical_enabled`).
  `src/ai/settings.ts` is the resolver: `resolveDualMode(dualMode)` returns
  'single'/'dual' honoring precedence — explicit per-run 'single'/'dual' wins;
  'auto' uses the DB `ai.dual_mode` setting (source of truth), then the
  `AI_DUAL_MODE` env var (deployment-time fallback), then OFF.
  `isAiInvestigationsEnabled()` / `isAiCriticalAlertsEnabled()` gate the AI
  provider phase + alerting respectively (both default ON if the row is
  absent, so the engine keeps working before migration 033 is applied).
  `investigation.engine.ts` uses these: when the master switch is OFF the AI
  provider phase is skipped entirely (deterministic findings still produced,
  `ai_status='unavailable'`); dual mode runs both providers only for
  dual-capable scopes (full_system / member_verification) when the effective
  mode is 'dual'. `alerting.service.ts` honors `ai.alerts.critical_enabled`.
  New routes: `GET/PUT /api/ai/settings` (admin+, delegates to
  ConfigurationService so audit/history is honored, rejects unknown keys).
  `/api/ai/health` now returns `configured.dual_mode` from the DB setting
  (with `dual_mode_source: 'setting'|'env'`) + an `ai_settings` map. Dashboard
  (`dashboard/ai-intelligence/page.tsx`): a prominent ON/OFF switch in the
  actions bar persists via `PUT /api/ai/settings` and the StatCard reflects
  it. Settings → System Configuration gets a new **AI Intelligence** tab
  (`AiSettingsSection.tsx`) with all three toggles + the dual-mode explainer.
  **Deploy steps**: run migration 033 in Supabase SQL Editor. The `AI_DUAL_MODE`
  env var is no longer load-bearing (DB setting wins) but is honored as a
  fallback if the setting row is absent. Tests: `tests/ai-settings.test.ts`
  (13: precedence DB>env, explicit override, defaults, non-fatal on DB error).
  Run: `npx jest tests/ai- --testTimeout=15000 --forceExit`.

## Conventions
- **API route segment config**: every `src/app/api/**/route.ts` MUST export
  `export const dynamic = 'force-dynamic';` (after the imports). Without it,
  Next.js tries to statically render the route at build time and any access to
  `request.url`, `request.nextUrl.searchParams`, `request.cookies`, or
  `request.headers` throws `DYNAMIC_SERVER_USAGE` at runtime (the
  "couldn't be rendered statically because it used `request.url`" /
  `request.cookies` / `nextUrl.searchParams` errors seen in production on
  `/api/configuration`, `/api/audit`, `/api/admin/login-activity`,
  `/api/members/lookup`). The v1 gateway routes are equally affected since
  `createHandler` (`src/lib/api/handler.ts`) reads `request.headers` and
  `request.nextUrl.pathname`. All 49 currently-existing API routes now carry
  this export; any NEW route file must add it too.
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
- **Auth/permissions**: `authorize()` (`src/lib/api/principal.ts`) is the
  gateway's single authorization boundary. For **session (cookie)** auth it
  honors the manifest endpoint's `minRole` via the role hierarchy
  (`getRoleLevel` from `src/lib/auth/authorization.ts`); super_admin bypasses.
  Endpoints with no `minRole` (the `auth.*` own-session/profile/password
  surface) are identity-scoped, so any authenticated session user is allowed.
  The legacy `PERMISSIONS` matrix in `authorization.ts` is NOT consulted by
  the gateway â€” it omits `compliance`, `statements`, `dashboard`, and `auth`,
  which previously caused false 403s for non-super_admin portal users. Do not
  reintroduce `hasPermission` delegation in `authorize()`; the manifest
  `minRole` is the source of truth (guarded by
  `tests/api-gateway-consistency.test.ts` â†’ "session-auth authorization
  honors manifest minRole"). API-key auth uses the explicit `module.action`
  scopes granted to the client (`api_client_permissions`). The `api.*`
  management endpoints are `super_admin`-only (minRole `super_admin`).
- **API keys** are stored only as SHA-256 hashes (`hashApiKey`); the raw key is
  shown once at generation. Prefixes: `yk_live_` / `yk_test_`.
- **Permission scopes**: a scope is `module.action` derived from the endpoint
  manifest. `AVAILABLE_SCOPES` (manifest.ts) dedups by `module.action` and
  excludes the internal `api` module â†’ **37 distinct grantable scopes**. Grants
  MUST be validated against `AVAILABLE_SCOPES` via `parseScopeList`
  (`src/lib/api/scopes.ts`) before storing in `api_client_permissions`; the
  `api_client_permissions` table is free-form TEXT with no FK, so unvalidated
  grants become dead/typo rows that never match `authorize()`. The scope editor
  in `ApiSettingsSection.tsx` is shown on both create and edit
  (`showScopesEditor`); hiding it on create silently produces scopeless clients.
  The scope list is fetched from the public `GET /api/v1/docs`
  (`available_scopes`) and loaded once on mount via `loadScopes` â€” do NOT tie
  scope loading to the Endpoints tab; the editor renders on the Clients tab and
  empty scopes there = a "0 selected" editor with no checkboxes.
- **API settings UI**: Settings -> System Configuration -> API Keys
  (`src/components/settings/ApiSettingsSection.tsx`) drives the
  `/api/v1/management/*` surface (clients, keys, scopes, endpoint overrides,
  logs, overview). Super_admin only; the section renders a restricted notice for
  others. Gateway-level toggles also live as `api.*` rows in the `settings`
  table under the `api` configuration category (migration 024).
- **API docs**: OpenAPI 3.0 at `GET /api/v1/docs/openapi.json` (generated from
  the manifest via `src/lib/api/openapi.ts`), docs index at `GET /api/v1/docs`,
  Swagger UI at `/dashboard/api-docs`. See `API.md` (YUNITE API Gateway section).

## Member Lookup Portal (`member-lookup-frontend/`)
A **standalone, futuristic, public-facing** member verification + account
portal that lives inside this repo but deploys **independently to Vercel**
(separate Vercel project, root dir = `member-lookup-frontend`). It
**consumes the existing YUNITE backend** (`/api/v1`) via a server-side API
key â€” it does NOT rebuild or replace any backend logic. The backend stays
the single source of truth for all data/calculations.
- **BFF + stateless JWT session pattern**: server routes hold `YUNITE_API_KEY`
  (env, never shipped to browser). Verification (`POST /api/auth/verify`)
  matches `first_name` + `phone` + `id_number` **server-side** against real
  member records (there is no dedicated verify endpoint â€” see
  `member-lookup-frontend/API_GAPS.md`), then issues a short-lived signed
  JWT (jose/HS256, `MEMBER_SESSION_SECRET`) in an httpOnly+Secure+SameSite=Lax
  cookie binding ONLY `member_id`. Every member-data route resolves the
  member from that JWT â€” never from a URL path â€” so cross-member access is
  impossible. `src/middleware.ts` guards all `/dashboard/*`.
- **Env vars**: `YUNITE_API_BASE_URL`, `YUNITE_API_KEY` (server-only),
  `MEMBER_SESSION_SECRET`, `MEMBER_SESSION_TTL_SECONDS` (default 1800),
  `NEXT_PUBLIC_APP_URL`. `.env.example` documents them.
- **Pages**: public home (live clock, upcoming meetings [graceful],
  rotating YUNITE + motivational messages, "Access my member account" CTA);
  dashboard (overview, savings&shares, contributions, welfare, loans w/
  progress, fines, transactions w/ filter, statement [graceful on backend
  500], notifications, profile [masked ID], support [org contact + FAQ]).
- **Gotcha â€” `/api/v1/members/{id}` returns the member *workspace***
  (`{ member, accounts, compliance, transactions, documents, loans, fines }`),
  NOT a bare member. `member.service.ts` `getMember()` extracts `.member`.
  Do not assume `getMember` returns the workspace.
- **Gotcha â€” logout is stateless**: `POST /api/auth/logout` clears the
  browser cookie, but a captured token remains valid until its short TTL
  expires. This is standard for stateless sessions and acceptable for a
  read-only portal. Do not add a server-side token blocklist for this.
- **Verified against live backend** (2026-08-13): all member-data routes
  return real data (savings=300, shares=3, contributions=100, welfare=0,
  fines=50, loans=220 for the test member); no-cookie & tampered-cookie â†’
  401; `tsc --noEmit` clean; `next build` clean (28 routes).
- **Backend gaps** (handled gracefully, never fabricated): see
  `member-lookup-frontend/API_GAPS.md` â€” no `members.verify` endpoint, no
  `/api/v1/meetings` (only session-auth `/api/meetings`), statement endpoint
  500s on live DB, contributions list not member-filterable (use
  transactions), no support-ticket endpoint.
