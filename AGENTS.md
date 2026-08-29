# YUNITE-CBO-PORTAL

## Project Overview
Next.js 14 (App Router) enterprise portal for Community-Based Organizations.
Backend: Supabase (Postgres + Storage). Auth: custom JWT sessions (jose) stored in cookies.

## Key Commands
- `npm run dev` ‚îú–≤—Ç–í–º—Ç–ê–¨ start dev server
- `npm run build` ‚îú–≤—Ç–í–º—Ç–ê–¨ production build
- `npm run type-check` ‚îú–≤—Ç–í–º—Ç–ê–¨ `tsc --noEmit`
- `npm test` ‚îú–≤—Ç–í–º—Ç–ê–¨ jest (test files live in `tests/`)
- DB migrations: `supabase/migrations/*.sql`; manual ones: `supabase/MANUAL_MIGRATION_*.sql`
  (run via Supabase SQL Editor at https://sprlwlxjhhmazxpflhnb.supabase.co/project/-/sql)

## Known Gotchas
- **`@vercel/functions` `waitUntil()` is a no-op outside Vercel**: it resolves
  to `getContext().waitUntil?.(promise)` — with no request context (Render's
  plain Node runtime, Jest) nothing attaches a rejection handler to the
  promise. Any promise handed to `waitUntil()` must therefore NEVER reject,
  or it surfaces on Render as an unhandled rejection and crashes the
  long-lived Node process (Node >= 15 default). `runDueSchedules()` in
  `src/app/api/cron/ai-investigations/background.ts` is kept total (never
  rejects) via a last-resort catch; keep it that way if the background work
  is refactored. Guarded by `tests/ai-cron-resilience.test.ts`.
- **Email delivery (Gmail API primary, SMTP fallback ‚Äî the "38 failed
  notifications" fix, migration 043)**: three defects combined to fail every
  queued email: (a) `gmailApiAdapter.isGmailApiConfigured()` used OR logic, so
  ONE stray `GOOGLE_*` env var routed all sends to an unconfigured Gmail API ‚Üí
  NOT_CONFIGURED ‚Üí nonRetryable ‚Üí permanently failed, with NO SMTP fallback in
  `EmailService.send()`; (b) `encodeEmail()` put the RECIPIENT in the `From:`
  header (Gmail rejects every such send) ‚Äî it now takes the sender email as a
  third arg and is exported for tests; (c) `processQueue()` ignored
  `scheduled_for`, burning all 3 retries within minutes on the 5-min cron tick
  (now `.lte('scheduled_for', now)`; `retryFailed()` resets `scheduled_for`).
  `send()` is now Gmail-first ‚Üí SMTP fallback on ANY Gmail failure; a send is
  non-retryable only when BOTH channels fail with configuration errors.
  `gmailApiAdapter.isAvailable()` (async: integrations toggle + complete
  env/DB credentials) is the gate ‚Äî never the sync env check. The Gmail
  adapter's 401 re-auth retry is bounded (`retryOnAuth` param) to prevent
  infinite recursion. Migration 043 requeues all `failed` email_queue rows and
  moves their linked notifications back to `queued`. GOOGLE_* env vars are
  declared in render.yaml (sync:false). Tests:
  `tests/email-delivery-fallback.test.ts` (18: AND-logic config gating, From
  header, base64url, Gmail‚ÜíSMTP fallback routing, combined-error semantics).
- **Email outage 2026-08-22 (total delivery failure, diagnosed live + fixed)**:
  BOTH channels were down at once ‚Äî (a) the `GOOGLE_REFRESH_TOKEN` was revoked
  by Google (`invalid_grant: Token has been expired or revoked` from
  oauth2.googleapis.com/token; the DB `gmail.refresh_token` was the same dead
  value), so every Gmail API send failed auth; (b) Render free tier blocks
  outbound SMTP (port 587), so the fallback timed out ("Connection timeout").
  Failure signature in `email_queue.error_message`: `Gmail API: Failed to
  obtain Gmail access token | SMTP: Connection timeout`. Code fixes
  (commit 95c1cf3): the adapter now captures Google's real token error
  (`lastTokenError`) and surfaces it in `send()`/`testConnection()` with a
  re-authorization hint (also makes `isConfigurationError` match
  `invalid_grant` ‚Üí correctly non-retryable), and `processQueue()` re-queues
  rows stuck in `processing` for >10 min (a crashed run had orphaned one).
  IMPORTANT for Render free tier: SMTP can NEVER work there ‚Äî Gmail API is the
  only viable channel, so a revoked refresh token = total email outage until
  re-authorized via `scripts/generate-gmail-refresh-token.js` (needs the
  Google account owner's browser consent) + updating `GOOGLE_REFRESH_TOKEN`
  in Render Dashboard. The SMTP credentials themselves are VALID (both the env
  `SMTP_PASS` and the DB `smtp.password` authenticate to smtp.gmail.com:587) ‚Äî
  delivery works from any network that allows outbound 587 (verified: backlog
  drained end-to-end, real emails delivered to the super admin inbox).

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
  live server via `fetch` ‚îú–≤—Ç–í–º—Ç–ê–≠ that's expected, not a type error.)
- **Notification content (subject/body)**: migration 004 created `notifications`
  with legacy `title`/`message` (NOT NULL). Migration 005 intended `subject`/`body`
  but its `CREATE TABLE IF NOT EXISTS` was skipped (table existed) and its ALTERs
  never added `subject`/`body`, so the service + frontend (which read
  `subject`/`body`) rendered blank notification content in the bell dropdown and
  notifications page ‚îú–≤—Ç–í–º—Ç–ê–≠ only the unread count (from `status`) worked. Migration 028
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
  is event-driven and LIVE ‚îú–≤—Ç–í–º—Ç–ê–≠ called from `member-registration.service.ts`,
  `loan.service.ts`, `transaction.engine.ts`, and `/api/members/[id]`. Logs to
  `notification_event_logs`, matches `EVENT_TEMPLATE_MAPPINGS` (member/savings/
  loan/fine/contribution), resolves recipients, calls `notificationService.sendFromTemplate`.
  Helpers: `emitMemberRegistered`, `emitLoanApplication`, `emitSavingsDeposit`.
- **Schedule service** (`schedule.service.ts`): `scheduleService.processDueSchedules()`
  + `executeSchedule()` reads `notification_schedules` where `next_run_at <= now`,
  resolves recipients (`all_members`/`active_members`/`admins`/`loans_overdue`/
  `welfare_pending`), sends from template, advances `next_run_at`. **BUT
  `processDueSchedules()` HAS ZERO CALLERS** ‚îú–≤—Ç–í–º—Ç–ê–≠ there is no cron/Vercel cron/Render
  cron (`render.yaml` has no cron block) and no `node-cron`. Schedules never fire.
- **Statement service** (`statement.service.ts`, 957 lines): generates member/
  org/loan/savings statements into `notification_statements` with
  opening/closing/transactions. Already supports member_weekly/member_monthly/
  organization_summary. `buildOrgSummary` exists. **No forecast engine** (only
  historical).
- **Notification service** (`notification.service.ts`): `sendFromTemplate(code,
  recipient, variables, opts)` sends in-app + enqueues `email_queue` row.
- **Unread-first list ordering** (fa3927d): `getForRecipient()` orders
  `read_at DESC NULLS FIRST` then `created_at DESC` ‚Äî unread (read_at IS NULL)
  float to the top, read sink below, newest-first within each group, and
  pagination applies AFTER ordering so page 1 always carries the unread
  (previously pure created_at DESC interleaved read/unread by date, forcing
  users to scroll past read messages to find unread ones). Both markAsRead
  and markAllAsRead set read_at, so NULL reliably means unread. One
  server-side fix covers the bell dropdown, notifications page, the v1
  gateway route, and the member-lookup portal. Tests:
  `tests/notification-ordering.test.ts` (4).
- **API routes** all exist: `notifications/events`, `notifications/schedules`,
  `notifications/statements`, `notifications/templates`, `notifications/preferences`,
  `notifications/actions` (email queue processing), `audit`.
- **Settings UI** (`src/app/dashboard/settings/page.tsx`, 1487 lines): renders
  `configuration_categories` with config-status badges. The "Workflow ‚îú–≤—Ç–í–º—Ç–ê–≠ Not Set"
  the user sees = the `workflow` config category seeded in migration 007
  (line ~142: `('workflow','Workflow','Approval workflows and automation',
  'git-branch','#0891B2',13)`). Shows "Not Set" because no `settings` rows under it
  have values.
- **Approval workflow**: `member_approval_workflow` table (migration 007) is a real
  stage machine (documentation‚îú–≤—Ç–ê–∞—Ç–ê–©review‚îú–≤—Ç–ê–∞—Ç–ê–©approval‚îú–≤—Ç–ê–∞—Ç–ê–©completed/rejected) for member
  registration. `members.workflow_stage` + `update_member_workflow_stage()` fn.
  No generalized approval engine for loans/transaction reversals.
- **Meetings**: `meetings` + `meeting_attendance` tables exist (migration 004) but
  NO service/route/UI ‚îú–≤—Ç–í–º—Ç–ê–≠ purely schema. No meeting events in EVENT_TEMPLATE_MAPPINGS.
- **Schema conflict (must reconcile)**: migrations 005 and 012 define CONFLICTING
  columns for `notification_statements`, `notification_event_logs`,
  `notification_preferences`, `email_queue`, `notification_delivery_history`.
  Services assume the richer 005 schema (`recipient_email`/`title`/`summary`/
  `generated_data`/`schedule_id` on statements; `event_id`/`status`/`received_at`
  on event_logs; `owner_type`/`owner_id` on preferences). A reconciliation migration
  is needed before building on top ‚îú–≤—Ç–í–º—Ç–ê–≠ verify live DB columns first.
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
  replace the "Workflow ‚îú–≤—Ç–í–º—Ç–ê–≠ Not Set" badge in `dashboard/settings/page.tsx` with a
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
  component replaces the generic "Workflow ‚îú–≤—Ç–í–º—Ç–ê–≠ Not Set" badge with a real control
  panel ‚îú–≤—Ç–í–º—Ç–ê–≠ toggle switches for every `workflow.*` boolean, number inputs for lead
  times/cadence days, grouped into Engine/Channels/Reminders/Statements/Meetings/
  Alerts sections, saved via `PUT /api/configuration` (same audit framework as
  the rest of settings). Includes an Automation History table reading
  `automation_runs` and a "Run Now" button. Wired into the settings page:
  `workflow` added to `ActiveSection` type + category icon + render branch.
  Two new session-authenticated routes: `GET /api/automation/runs` (history,
  admin+) and `POST /api/automation/trigger` (manual tick, admin+) ‚îú–≤—Ç–í–º—Ç–ê–≠ the latter
  lets admins force a tick without the CRON_SECRET the cron route needs.
- **Phase 3 IMPLEMENTED** (forecast + alert tiers): `forecast.service.ts`
  `financialForecastService.generate()` blends trailing-90-day actuals
  (avg daily net extrapolated forward) with known upcoming loan repayments
  (monthly_repayment ‚îÄ–í—Ç–ê–§ months, capped at remaining) and expected monthly
  contributions/welfare (settings ‚îÄ–í—Ç–ê–§ active member count) into 30/90-day
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
  category. Note: there is no meetings dashboard page yet ‚îú–≤—Ç–í–º—Ç–ê–≠ only the API +
  service + reminders. A full meetings UI page is a follow-on.

## Member Registration (full-profile capture)
`POST /api/members` -> `MemberRegistrationService.register()` creates a member
at `status='pending'`, generates `member_number` `YUN-YYYYMMDD-####`, then
creates 5 accounts (savings/shares/contributions/welfare/fines), legacy
`compliance_records`, an `audit_logs` row, and emits `member.registered` via
`notificationEventService`. A DB trigger (`on_member_created_compliance`) also
auto-creates `member_compliance` rows for every required `document_categories`
row (module='members') + a `member_approval_workflow` row at 'documentation'.
The registration form (`src/app/dashboard/members/page.tsx`) captures the
**full editable profile in one flow**: Personal (name, email, phone, ID, KRA
PIN, DOB, gender, marital_status, nationality), Contact (physical/postal
address, alt phone/email), Employment (occupation, employer, employer
address), Next of Kin, and Emergency Contact. The Zod schema in
`src/app/api/members/route.ts` strips empty strings before validation so
optional `.email()` fields left blank by the form don't 400. `MemberRegistrationData`
and the member INSERT carry all these fields so a member can be fully onboarded
without later edits. Note: the membership.* settings (min age, max members,
require_approval, allow_self_registration) and member.categories/groups are
seeded (migrations 010/011) but NOT yet enforced by registration. Approval is a
manual admin action on `/dashboard/members/[id]` (PUT status->active upserts
`member_approval_workflow` to 'completed').

## Document Generation & Export Engine (`src/lib/services/reports/`)
A full bank-style document generation engine produces branded, certified,
downloadable PDF/CSV documents for every reportable surface: financial
summary, member register, **member profile**, loan portfolio, transaction
ledger, contributions, fines, member statement of account, welfare fund, and
organization summary.
- **Member Profile (`member_profile`)**: a certified document carrying ALL
  personal information for a member (personal / contact / employment / next
  of kin / emergency contact / communication preferences / membership
  details). With `member_id` ‚Üí one member; WITHOUT `member_id` ‚Üí ALL members
  (one profile per page, bulk register of profiles). Data getter:
  `reportDataService.getMemberProfiles(memberId?)` ‚Äî it deliberately uses
  `select('*')` (NOT a fixed column list) because optional migration-011
  columns may be absent on a not-yet-migrated DB and a fixed list would make
  PostgREST error out; missing columns simply read back as null. pdfmake
  template: `src/modules/documents/templates/profile-reports.ts`
  (`memberProfileTemplate`, doc-number prefix `MBR-PRF`). UI: "ü™™ Profile
  (PDF)" button on the member detail Personal Information card
  (`members/[id]/page.tsx`, via `generateMemberDocument`), and the Member
  Profile card on `/dashboard/reports` (PDF = all members, CSV = full-column
  export). No financial values ‚Üí the data-quality reconciliation block is
  skipped for this type.
- **Gotcha ‚Äî pdfmake pageBreak**: `pageBreak()` in
  `src/modules/documents/utils/headers.ts` must return `{ text: ' ', pageBreak:
  'after' }` ‚Äî a bare `{ pageBreak: 'after' }` node is rejected by pdfmake with
  "Unrecognized document structure".
- **Brand** (`brand.ts`): single source of truth for org identity. The
  canonical fallback carries ONLY non-invented facts: name `YUNITE PAMOJA
  CBO`, city `Nairobi`, country `Kenya`, currency `KES`. It deliberately
  carries NO registration number, email, phone, address, or website in code
  —Ç–ê–§ those are org-specific and MUST come from Settings (a fabricated reg. no.
  on a certified document is a legal liability). The navy `#0B2A4A` +
  luminous green `#22C55E` palette, inline `LOGO_SVG` + `STAMP_SVG`,
  copyright text, and `formatMoney`/`formatDate`/`formatDateTime` helpers
  live here. `OrgIdentity` is the brand static; `ResolvedOrgIdentity`
  (styles) is the settings-merged profile used at render time.
- **Org identity resolver** (`src/modules/documents/styles/yunite-document.styles.ts`
  —Ç–ñ–¢ `resolveOrgIdentity()`): the ONLY function templates/generators call to
  get org identity. Reads `organization.name`, `registration_number`,
  `email`, `phone`, `address`, `website`, `logo_url`, `currency` from
  `settingsService` (DB), merging over the brand fallback. Exposes
  `registrationNumberConfigured` (bool) so headers render a visible
  'Not Configured' indicator instead of a blank when the reg. no. is unset
  —Ç–ê–§ never a fabricated number. Cached per-process; `_resetOrgIdentityCache()`
  for tests.
- **Logo resolver** (`resolveLogoDataUri()` in the same styles module):
  resolves the official org logo as a base64 data URI for embedding in PDFs.
  Order: `organization.logo_url` setting (if it points at a readable local
  file) —Ç–ñ–¢ `public/branding/logo.png`. Returns `null` when no PNG is
  available; templates then render the org name as text (never a substitute
  icon). pdfmake blocks remote URLs + local FS access internally, so the
  logo MUST be read here as base64 and passed as a data-URI `image` node.
  `_resetLogoCache()` for tests.
- **Data reconciliation engine** (`src/lib/services/reports/report-data-quality.service.ts`):
  `reportDataQualityService` cross-checks stored financial values against the
  authoritative ledger and NEVER mutates data. `reconcileLoansOrg()` compares
  `loans.amount_paid` (stored) vs `SUM(loan_repayment transactions WHERE
  reversed=false)` (ledger) + internal consistency (`amount_due == total_amount
  —Ç–ò–¢ amount_paid`). `reconcileFinesOrg()` does the same for fines vs
  `fine_payment` txns. `reconcileMemberStatement()` compares each
  account-breakdown value against `transactionEngine.calculateAllBalances()`.
  `reconcileOrganization()` aggregates into a `DataQualityReport` (overall
  verified/requires_reconciliation/unavailable + a REAL verified/total
  percentage —Ç–ê–§ never an invented number) with traceability metadata
  (`sourceTable`, `sourceField`, `calculationSource`, `calculationMethod`,
  `retrievedAt`). Wired into `DocumentExportService.generate()` —Ç–ñ–¢ envelope
  `dataQuality`; rendered as a `dataQualityBlock` on the PDF. See
  `docs/DOCUMENT_DATA_SOURCE_MATRIX.md` for the full field—Ç–ñ–¢source matrix.
- **Renderer** (`report-renderer.ts`): `renderDocument(ctx, payload)` builds
  the full HTML —Ç–ê–§ letterhead (logo + org identity + accent bar), report
  title/eyebrow, meta block (type/period/ref/issued-by/currency), body
  (KPIs + tables per report type), a digital certification stamp with
  substituted `__REF__`/`__HASH__`/`__DATE__`/`__VERIFY_URL__` traceability
  fields, and a footer with copyright + doc ref + verify URL. The
  letterhead renders 'Reg. Not Configured' when the reg. no. is unset and
  omits empty contact lines (never invents them). Each render returns a
  unique `doc_ref` (`YP-DOC/<TYPE>/...`) and a SHA-256 `auth_hash` (16 hex
  chars) for traceability.
- **Data service** (`report-data.service.ts`): `reportDataService`
  aggregates live data from the transaction ledger + domain tables via
  `createServiceClient()` for all 9 report types. Member statement
  `getMemberStatement()` builds the **account breakdown from
  `transactionEngine.calculateAllBalances(memberId)`** (the single source of
  truth) —Ç–ê–§ NOT per-type `calculateBalance`. This matters because: (a) **shares
  are DERIVED** (`floor(savings / share_value)`) and there is NO `shares` account
  row, so `calculateBalance(memberId, 'shares')` returns 0 —Ç–ê–§ the old code showed
  `Shares Ksh 0.00` instead of the real share count; (b) **loans outstanding =
  `SUM(loans.amount_due)` over active loans** (the `loans` table), NOT the
  transaction-ledger sum on the loans account (where `loan_repayment` is NOT
  subtracted, so it would diverge the moment a repayment is made). The statement
  credit/debit classification is a **net-worth** model (`NET_DEBIT_TYPES`):
  liability-increasing postings (`fine_posting`, `loan_disbursement`) are DEBITS
  (reduce member net position), and liability-reducing ones (`fine_payment`,
  `loan_repayment`) are CREDITS —Ç–ê–§ this mirrors `TransactionEngine.isDebitTransaction`
  extended for the net-position view. The old code classified `fine_posting` +
  `loan_disbursement` as credits, producing `totalCredits=650, totalDebits=0`.
  `document-export.service.ts` now passes the rendered statement's
  `closingBalance`+`accountBreakdown` into `reconcileMember` so the data-quality
  check validates the ACTUAL document values (the old call passed nothing —Ç–ñ–¢ the
  reconciliation compared every breakdown value against 0 —Ç–ñ–¢ always flagged
  "Member Statement Balances requires reconciliation" —Ç–ñ–¢ the 67% you saw).
  Financial summary, org summary, and welfare reports all sum from
  `transactions WHERE reversed=false` (never stored balance snapshots).
- **PDF/CSV** (`document-generator.ts`): `htmlToPdf(html)` renders via
  headless Chromium using `puppeteer-core` (NOT `puppeteer` ‚îú–≤—Ç–í–º—Ç–ê–≠ see the
  BUILD FAILURE note below for why `puppeteer`'s `install.mjs` postinstall
  must be avoided). The browser is bundled in puppeteer's cache
  (`~/.cache/puppeteer`), populated by `scripts/install-browser.js` which
  runs as the npm `postinstall` hook during `npm ci`. NO system package or
  root install is needed. `resolveChromium()` prefers an explicit
  `PUPPETEER_EXECUTABLE_PATH`/`CHROMIUM_PATH`/`CHROME_PATH` override (only
  if it exists on disk ‚îú–≤—Ç–í–º—Ç–ê–≠ a stale env var pointing at a missing path is
  skipped, not fatal), then probes the cache directory directly (via
  `@puppeteer/browsers`' `getInstalledBrowsers()`, NOT
  `puppeteer.executablePath()`, which honors `PUPPETEER_EXECUTABLE_PATH`
  and would miss the cache when that env var is stale), then common system
  Chromium paths.
  **Why a custom postinstall**: `puppeteer-core` ships NO postinstall
  download step (unlike `puppeteer`), so nothing populates the browser
  cache during `npm ci`. `scripts/install-browser.js` does it instead,
  calling `@puppeteer/browsers`' `install()` directly with the build pinned
  in `puppeteer-core`'s revisions (so the binary matches the driver ‚îú–≤—Ç–í–º—Ç–ê–≠ using
  "stable"/latest instead crashes with "Navigating frame was detached"),
  ignoring `PUPPETEER_SKIP_DOWNLOAD`/`PUPPETEER_EXECUTABLE_PATH`.
  **Gotcha**: do NOT pass `--single-process` to `puppeteer.launch` ‚îú–≤—Ç–í–º—Ç–ê–≠ it
  breaks modern Chrome (131+) with "Target.setDiscoverTargets: Target
  closed". The browser is cached per-process; `closeBrowser()` must be
  called in long-lived test/lambda contexts to let the process exit.
  `reportToCsv()` produces spreadsheet exports directly (no browser needed).
- **Export orchestrator** (`document-export.service.ts`):
  `documentExportService.generate(opts)` gathers data ‚îú–≤—Ç–ê–∞—Ç–ê–© renders HTML ‚îú–≤—Ç–ê–∞—Ç–ê–©
  generates PDF/CSV ‚îú–≤—Ç–ê–∞—Ç–ê–© persists an immutable audit row in
  `generated_documents` (best-effort; warns on failure per project
  convention). `listHistory()` + `verifyByRef()` power the history table
  and public verification.
- **Migration 029** (`029_generated_documents.sql`): the
  `generated_documents` audit ledger (doc_ref UNIQUE, auth_hash, report_type,
  format, period, member_id, generated_by, IP/UA, expires_at, revoked*) +
  `generated_document_verifications` view. Run in Supabase SQL Editor on
  deploy.
- **API routes**: `GET /api/reports` (catalog), `GET|POST
  /api/reports/generate` (download ‚îú–≤—Ç–í–º—Ç–ê–≠ POST for JSON body, GET for `<a href>`
  convenience; both staff+ gated, both record the audit row), `GET
  /api/reports/history` (audit trail), and **public** `GET
  /api/reports/verify/[ref]` (no auth ‚îú–≤—Ç–í–º—Ç–ê–≠ anyone holding a printed doc can
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
- **Tests**: `tests/report-renderer.test.ts` (brand identity ‚Äî the corrected
  YUNITE PAMOJA CBO identity with NO invented registration number/contacts,
  formatters, letterhead/stamp/traceability, per-type bodies),
  `tests/report-document.test.ts` (CSV export + period resolver),
  `tests/smoke-pdf.test.ts` (real Chromium PDF render ‚Üí valid `%PDF-` buffer;
  uses `closeBrowser()` + `--forceExit`), and `tests/document-data-integrity.test.ts`
  (10 tests: org identity never invents reg. no.; loan/fine reconciliation
  detects stored-vs-ledger divergence + verifies when consistent; aggregate
  data-quality report uses a REAL verified/total percent; documents change
  when underlying ledger data changes via `transactionEngine.calculateBalance`).
  Run report tests with:
  `npx jest tests/report- tests/document-data-integrity --testTimeout=90000 --forceExit`
  (Chromium comes from the puppeteer cache; no `PUPPETEER_EXECUTABLE_PATH`
  needed. If a system Chromium is preferred locally, set
  `PUPPETEER_EXECUTABLE_PATH` to it before running.)
- **Data Source Matrix** (`docs/DOCUMENT_DATA_SOURCE_MATRIX.md`): internal
  traceability matrix mapping every document field to its authoritative
  source (module ‚Üí service ‚Üí DB table ‚Üí field ‚Üí calculation engine ‚Üí
  validation status). Governing principle: _never prioritize document
  appearance over data correctness._ Consult before adding new document
  fields.
- **Deploy steps**: run migration 029 AND migration 035
  (`035_official_org_identity.sql`) in Supabase SQL Editor. Migration 035
  corrects any stale `organization.name` seed to `YUNITE PAMOJA CBO` and
  ensures the `organization.registration_number` / contact settings exist
  (empty by default ‚Äî administrators configure the real values; documents
  show 'Not Configured' until then, never a fabricated number). Chromium for
  PDF generation is installed automatically by the `postinstall` hook
  (`scripts/install-browser.js`, run during `npm ci`) which force-downloads
  the pinned Chrome build into puppeteer's cache. This works regardless of
  `PUPPETEER_EXECUTABLE_PATH`/`PUPPETEER_SKIP_DOWNLOAD` env values, so stale
  Render Dashboard env vars can no longer break PDF generation. No manual
  Chromium setup, root, or apt-get is needed.
- **CRITICAL ‚îú–≤—Ç–í–º—Ç–ê–≠ live Render was running STALE code (PDF "Chromium executable
  not found")**: on 2026-08-13 the Reports & Documents page threw "Export
  failed: Chromium executable not found ... downloaded during `npm ci`
  (puppeteer postinstall); ensure PUPPETEER_SKIP_DOWNLOAD is unset ...". That
  error string is from commit `4f98ac1`, NOT the repo HEAD `477f7b5` (whose
  message names `scripts/install-browser.js`). So the live deployment was
  running an older build than `main`; the repo's fixes simply hadn't been
  deployed. The OLD `resolveChromium()` used `puppeteer.executablePath()`,
  which honors a stale `PUPPETEER_EXECUTABLE_PATH` (set in the Render
  Dashboard to a cache path that didn't exist at runtime) ‚îú–≤—Ç–ê–∞—Ç–ê–© skipped the
  bundled cache and fell through to system paths (none on Render free tier)
  ‚îú–≤—Ç–ê–∞—Ç–ê–© hard fail. `resolveChromium()` was hardened: it is now async and uses
  `@puppeteer/browsers`' `getInstalledBrowsers()` (env-agnostic ‚îú–≤—Ç–í–º—Ç–ê–≠ reads the
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
  in the Render Dashboard ‚îú–≤—Ç–í–º—Ç–ê–≠ `render.yaml` deliberately does NOT set them;
  setting `PUPPETEER_EXECUTABLE_PATH` makes puppeteer's own postinstall skip
  the download. After redeploy, confirm the postinstall log shows
  `[install-browser] chrome <build> already cached at ...` (or "downloading").**
- **BUILD FAILURE (2026-08-13, FIXED by switching `puppeteer` ‚îú–≤—Ç–ê–∞—Ç–ê–© `puppeteer-core`)**:
  the build FAILED during `npm ci` with puppeteer's own `install.mjs` throwing
  `Failed to set up chrome v131.0.6778.204! [cause]: The browser folder
  (.../chrome/linux-131.0.6778.204) exists but the executable is missing`.
  Render persists `/opt/render/.cache` across builds; a prior build left a
  CORRUPT chrome entry (folder present, binary absent), and
  `@puppeteer/browsers`' `install()` THROWS on a corrupt folder instead of
  re-downloading ‚îú–≤—Ç–í–º—Ç–ê–≠ aborting `npm ci` before our root `postinstall`
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
  present, executable missing, stale `.metadata`) + NO skip env var ‚îú–≤—Ç–ê–∞—Ç–ê–©
  `npm ci` succeeds (no install.mjs to crash), `install-browser.js` detects
  the corrupt chrome, reinstalls, and `getInstalledBrowsers()` finds a
  working executable; PDF smoke test passes with `puppeteer-core`. NOTE: if
  the build STILL fails, the Render build cache itself is corrupt ‚îú–≤—Ç–í–º—Ç–ê–≠ clear it
  via Render Dashboard ‚îú–≤—Ç–ê–∞—Ç–ê–© Service ‚îú–≤—Ç–ê–∞—Ç–ê–© Settings ‚îú–≤—Ç–ê–∞—Ç–ê–© Manual Deploy ‚îú–≤—Ç–ê–∞—Ç–ê–© "Clear build
  cache & deploy".

## AI Intelligence Engine (`src/ai/`) —Ç–ê–§ Dual-AI Investigation & QA
A production-grade dual-AI investigation + consistency engine. Gemini and
OpenRouter independently investigate YUNITE through read-only, PII-sanitized
tools, produce separate reports, and a comparison engine reconciles them.
**The database + deterministic engines remain the source of truth —Ç–ê–§ AI
investigates the system, it does not become the system.** AI never invents
financial values, never modifies financial records, never runs arbitrary SQL,
and never receives DB credentials/service-role keys (the sanitizer strips
passwords/tokens/api keys/PII before anything reaches a provider).
- **Provider abstraction** (`src/ai/providers/`): the rest of the engine
  depends ONLY on the `AiProvider` interface, never a concrete provider.
  Gemini + OpenRouter both implement it and receive the SAME context + tools
  payload (so neither sees the other's conclusions before producing its
  report —Ç–ê–§ dual-AI independence).
- **Failover** (`failover.ts`): primary Gemini —Ç–ñ–¢ secondary OpenRouter. The
  `AI_FAILFAST_TIMEOUT_MS` (default 1000ms) is a FAILURE-DETECTION probe
  only —Ç–ê–§ it does NOT cap max generation duration. A valid slow generation
  runs to completion. Both-fail —Ç–ñ–¢ deterministic findings still produced
  (investigation marked `partial`, `ai_status = unavailable`).
- **Deterministic engines** (`src/ai/engines/`): database-consistency,
  financial-consistency (independent `SUM(transactions)` vs stored balance),
  cross-module, business-rules (CONFIG vs IMPLEMENTATION vs DB vs DISPLAY),
  api-consistency (read-only GETs only), member-verification (DB —Ç–ñ–¢ API —Ç–ñ–¢
  MEMBER LOOKUP DISPLAY per-field). Always run before AI; AI explains the
  discrepancy, never guesses the calc.
- **Comparison engine** (`comparison.engine.ts`): agreements, gemini-only,
  openrouter-only, disagreements (marked `REQUIRES VERIFICATION` —Ç–ê–§ never
  auto-promoted to fact), verified (deterministic-aligned), human-review.
- **Orchestrator** (`investigation.engine.ts`): `runInvestigation(scope,
  memberId?)` —Ç–ñ–¢ deterministic —Ç–ñ–¢ dual independent AI —Ç–ñ–¢ comparison —Ç–ñ–¢ persist —Ç–ñ–¢
  alert. Scope `full_system` / `member_verification` run BOTH providers.
- **Alerting** (`alerting.service.ts`): CRITICAL findings —Ç–ñ–¢ internal YUNITE
  notification (per-day idempotent) + best-effort email. **No sensitive
  financial values in email** —Ç–ê–§ full evidence stays in the Admin Console.
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
  `dashboard/layout.tsx`). Six sections —Ç–ê–§ Overview, Gemini (independent),
  OpenRouter (independent), AI Comparison, Report History, Schedules. The
  Gemini + OpenRouter tabs are deliberately kept separate so an admin can
  inspect one provider's reasoning without the other's.
- **render.yaml**: `yunite-ai-investigations-tick` cron service
  (`*/30 * * * *`) curls the CRON_SECRET endpoint. Web service env vars:
  `AI_PROVIDER`, `AI_DUAL_MODE`, `GEMINI_API_KEY`, `GEMINI_MODEL`,
  `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`,
  `AI_FAILFAST_TIMEOUT_MS`, optional `MEMBER_LOOKUP_VERIFY_URL`/`_SECRET`,
  and `CRON_SECRET` (shared with the existing automation cron).
- **Performance**: member lookup is NEVER blocked by AI —Ç–ê–§ the normal flow
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
  "FIN-0047 —Ç–ê–§ Savings Module —Ç–ñ–¢ Member Account Balance, MBR-00123, DB
  member_accounts.savings_balance KES 20,000 vs ledger KES 18,500, ‚ï¨–§ KES
  1,500, backend GET /api/members/:id/financials, frontend
  member-lookup-frontend/FinancialSummary, root cause: desync" is now the
  standard, not the exception (req. #1, #2, #3, #32).
  - **Financial engine** deepened: each balance finding traces DATABASE
    (independent ledger) —Ç–ñ–¢ CALCULATION (engine) —Ç–ñ–¢ STORED (balance_after) with
    the exact table/field, backend route/service, and a systemic flag when >3
    members affected (req. #5, #15, #21).
  - **Member verification engine** deepened: each field result now traces the
    value through DATABASE —Ç–ñ–¢ CALCULATION —Ç–ñ–¢ BACKEND API —Ç–ñ–¢ MEMBER LOOKUP —Ç–ñ–¢
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
  - **Persistence bugs FIXED** (req. #28 —Ç–ê–§ root cause of "No investigations
    yet" + report loading failures): `listInvestigations` selected `completed_at`
    (column is `finished_at`) + missing `duration_ms`/`info_count` —Ç–ñ–¢ PostgREST
    errored —Ç–ñ–¢ null —Ç–ñ–¢ UI showed "No investigations yet" even when rows existed.
    `listReports` selected `report_ref` (column is `report_id`) + `summary`
    (not a column —Ç–ê–§ lives in `report_json.summary`). `getVerificationResult`
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
  'single'/'dual' honoring precedence —Ç–ê–§ explicit per-run 'single'/'dual' wins;
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
  it. Settings —Ç–ñ–¢ System Configuration gets a new **AI Intelligence** tab
  (`AiSettingsSection.tsx`) with all three toggles + the dual-mode explainer.
  **Deploy steps**: run migration 033 in Supabase SQL Editor. The `AI_DUAL_MODE`
  env var is no longer load-bearing (DB setting wins) but is honored as a
  fallback if the setting row is absent. Tests: `tests/ai-settings.test.ts`
  (13: precedence DB>env, explicit override, defaults, non-fatal on DB error).
  Run: `npx jest tests/ai- --testTimeout=15000 --forceExit`.
  **Lazy seeding (upsert)**: the toggle works EVEN BEFORE migration 033 is
  applied. `PUT /api/ai/settings` uses `ConfigurationService.upsertMany`
  (new) —Ç–ñ–¢ `upsertSetting`, which INSERTs the `ai.*` row with full metadata
  (category/description/data_type/help_text) if it doesn't exist, or updates
  it if it does. The insert is defensive: if the live DB is missing an
  optional column from migration 007 (partially-applied), it retries with
  only the guaranteed core columns (key/value/category/description/data_type).
  Concurrent-insert races (PG 23505) fall back to update. Migration 033's
  seed uses `ON CONFLICT DO UPDATE SET` (not NOTHING) so running it later
  enriches any lazily-created rows with full metadata. The dashboard +
  settings section now surface the `details` array from a failed update so
  the real DB error is visible instead of the generic "Some AI settings
  failed to update".

- **AI Intelligence dashboard "stale/accumulated" bug (2026-08-15, FIXED)**:
  the Overview stat cards (Critical/High/Medium/Low counts) showed
  ACCUMULATED totals across ~20 historical investigations (kept growing even
  after fixing problems), while the Module Health Map showed fewer —Ç–ê–§ because
  the health route's `recent_totals` summed severity counts across all recent
  investigations instead of reflecting the LATEST one. The cards now reflect
  CURRENT STATE: `/api/ai/health` (`src/app/api/ai/health/route.ts`) computes
  `recent_totals` from the single latest investigation only (its
  `ai_reports.report_json.counts`), and also returns `accumulated_totals`
  (historical sum) + `latest_investigation` (id/number/scope/ai_status/score)
  for context. The dashboard Overview shows both ("current" big +
  "accumulated across N investigations" small) so an admin can tell current
  state from trend. `page.tsx` auto-loads the latest investigation detail on
  mount via a `useRef` pattern (`openInvestigationRef` + `autoLoadedRef`) so
  the Evidence / Recommendations / Critical / Modules tabs populate without a
  manual click; `runInvestigation` auto-opens the just-run investigation via
  the ref (note: must use the ref, NOT the `openInvestigation` callback in the
  deps array, to avoid a TDZ ReferenceError since `openInvestigation` is
  declared after `runInvestigation`). The Module Health Map no longer slices
  to 18 entries (`MODULE_HEALTH_ORDER` now lists ~22 canonical modules
  including `api`, `member_lookup`, `members`, `transactions`, `settings`,
  `notifications`, `audit_logs`); `buildModuleHealthMap([])` returns a healthy
  entry for every canonical module. The Modules-tab drill-down uses a local
  `normalizeModule` (mirror of the backend aliases) so clicking a normalized
  module (e.g. `member_lookup`) matches findings whose raw `module` is an
  alias (e.g. `member_verification`).
- **AI Intelligence Recommendations were empty (2026-08-15, FIXED)**: the
  Recommendations & Root Causes tab filtered findings to those with
  `root_cause`/`recommendation`, but most deterministic engine findings had
  NEITHER field —Ç–ê–§ only AI-parsed findings carried them. So when AI was
  degraded/unavailable (the common case locally), the tab showed 0 even
  though there were confirmed deterministic findings. Fixed by adding
  `root_cause` + `recommendation` to EVERY deterministic finding in all five
  engines: `database-consistency.engine.ts` (~10 findings), `financial-consistency.engine.ts`
  (~4), `api-consistency.engine.ts` (~6), `business-rules.engine.ts` (~9),
  `cross-module.engine.ts` (~4). The Recommendations tab now sorts by
  severity and shows the module + severity badge; the Evidence tab is now the
  "epicentre of facts": grouped by module, sorted by severity, each finding
  shows the full location chain (DB table/field —Ç–ñ–¢ backend route/service —Ç–ñ–¢
  frontend component —Ç–ñ–¢ member) + expected vs actual + the evidence chain. The
  Comparison tab now explains the degraded/unavailable AI state and surfaces
  the deterministic (confirmed) findings even when no AI comparison exists.
- **Orphan-transactions finding kept re-firing after migration 032
  (2026-08-15, FIXED)**: migration 032 marked the 7 orphan transactions
  `reversed=true` but left `member_id` NULL, and the database-consistency
  engine's check #4 did NOT filter `reversed=false` —Ç–ê–§ so quarantined orphans
  kept getting flagged as "missing member_id" forever (the count never
  dropped). Two fixes: (a) the engine now fetches `member_id, reversed` and
  ignores reversed rows when checking for missing member references
  (`database-consistency.engine.ts`); (b) migration 032 was upgraded to
  BACKFILL `member_id` from the `account_id —Ç–ñ–¢ accounts.member_id` mapping
  (the finding's own recommendation) in Pass 1 —Ç–ê–§ repairing the rows so they
  rejoin the live ledger —Ç–ê–§ and only quarantine (mark reversed) the truly
  unresolvable ones in Pass 2. The `ALTER ... SET NOT NULL` + the
  `prevent_null_member_id` trigger remain. **Deploy step**: re-run migration
  032 in the Supabase SQL Editor (the backfill UPDATE is idempotent —Ç–ê–§ it only
  touches rows where `member_id IS NULL`). After running it + a new
  investigation, DB-001 disappears (or drops to only the unresolvable orphans,
  which are reversed and no longer flagged). NOTE: the BR-002 finding (a loan
  with repayment_period 3 vs default 12) is an allowed per-loan override
  flagged "low / for review" —Ç–ê–§ NOT a data bug; `loan.service.ts` already
  validates `1 <= period <= max`, so it is expected to persist as an info
  finding, not a defect.
- **AI hallucinated a non-existent savings-balance storage (2026-08-15,
  FIXED)**: a member-verification run produced a "critical" DB-001 finding
  claiming `member_financials.savings = 300` conflicted with the ledger sum
  of 100, citing a `SavingsService` and `GET /api/v1/savings/balance` route.
  **All three were AI hallucinations** —Ç–ê–§ there is NO `member_financials`
  table, NO `SavingsService` class, NO `/api/v1/savings/balance` route, and
  `accounts` has NO balance columns (only id/member_id/account_type/status).
  Balances are computed LIVE via `transactionEngine.calculateBalance` (SUM
  of non-reversed, non-reversal transactions —Ç–ñ–¢ correctly 100). The "300"
  the AI saw was `balance_after` on the *reversed* deposit transaction —Ç–ê–§ a
  per-transaction snapshot, correctly excluded from the live balance. Root
  cause: the AI prompt said "never invent values" but never gave the AI the
  actual storage model, so it invented tables/endpoints. Fixed by adding an
  **AUTHORITATIVE STORAGE / CALCULATION MODEL** block to
  `prompt-builder.ts` that explicitly lists what does/doesn't exist
  (accounts columns, the live-calc path, the real balance routes, that
  balance_after is a snapshot not a stored balance, that reversed rows are
  excluded). Also fixed `financial-consistency.engine.ts` whose location
  labels wrongly referenced non-existent `accounts.savings_balance`/
  `${at}_balance` columns (which is what taught the AI the wrong model) —Ç–ê–§
  they now point at `transactions.balance_after (latest snapshot)` +
  `computed: SUM(transactions)`. Guard test added asserting the prompt
  forbids the hallucinated artifacts. **Note**: the already-persisted finding
  in INV-2026-0815-7WUWQ is an immutable historical row (status: unverified)
  —Ç–ê–§ it will NOT vanish from the old investigation; a NEW member-verification
  run after this deploy is what confirms the AI no longer invents it.
- **AI reported "no member data / empty dataset" as a system finding
  (AUD-001 gemini, DATA-001 openrouter —Ç–ê–§ 2026-08-15, FIXED)**: both providers
  independently reported `members: []` as a finding, concluding no member
  profiles/accounts/transactions could be audited. This was NOT a member-data
  defect —Ç–ê–§ it was the AI investigation engine silently feeding the providers
  an empty snapshot. Root cause had three parts: (1) every data getter in
  `src/ai/tools/database-tools.ts` did `const { data } = await ...` WITHOUT
  inspecting `.error` and fell back to `[]`/`0` —Ç–ê–§ Supabase JS returns
  `{ data: null, error }` on auth/network/RLS failure (it does NOT throw), so
  a missing `SUPABASE_SERVICE_ROLE_KEY` (common in local/CI/misconfigured
  deploys) silently turned EVERY collection into an empty array with zero
  signal reaching the AI; (2) the `full_system` scope payload
  (`src/ai/tools/index.ts`) had NO `members` key at all by design —Ç–ê–§ the most
  comprehensive scope omitted member profiles/accounts/transactions entirely,
  so no per-member audit could ever run; (3) `prompt-builder.ts` had NO
  fallback note when key dimensions were empty, so the AI reported the gap as
  a finding instead of recognising a data-availability problem. The
  deterministic engines share the same blind spot (they re-query `members`
  independently but use the same `createServiceClient()` + `?? []` pattern,
  no try/catch, so a DB failure —Ç–ñ–¢ empty member list —Ç–ñ–¢
  `TransactionEngine.calculateBalance` never invoked). Fixed three ways:
  (a) `getDataAvailability()` in `database-tools.ts` —Ç–ê–§ a read-only
  connectivity probe that runs one cheap `members` count, inspects `.error`,
  reports `db_reachable`/`service_key_configured`/`member_count`/`error`, and
  never throws; merged into EVERY scope's payload as `data_availability`;
  (b) `getMembersSampleRaw()` + a `members_sample` key added to `full_system`
  so the comprehensive scope carries a small active-member financial graph
  (financials + loans + fines + contributions + welfare + shares); (c)
  `buildAvailabilityNote()` in `prompt-builder.ts` translates the probe into
  an explicit prompt note —Ç–ê–§ a COLLECTION FAILURE (db unreachable / key
  missing) emits a "DATA AVAILABILITY WARNING" telling the AI NOT to report
  "no member data" as a finding and to flag it as a data-availability gap; a
  reachable-but-empty members table emits a "genuine empty-organization
  state" note (info, not a defect); a reachable DB with members emits a
  positive note. 4 new tests in `tests/ai-intelligence.test.ts` (warning,
  empty-org, positive, back-compat-when-probe-absent). NOTE: the shared
  `createServiceClient()` (`src/lib/supabase/server.ts`) was deliberately
  NOT changed to throw on missing key —Ç–ê–§ it is used by the entire app, not
  just the AI engine; the loud-failure signal lives in the AI tools layer
  where it belongs. **Note**: a separate finding CFG-001 (gemini) claiming
  `contributions.monthly_default = '00'` was a FALSE POSITIVE —Ç–ê–§ the seeded
  value is `'1000'` (migrations 001/007 + `settings.service.ts` app-layer
  fallback), and even `'00'` would parse to `0` identically via
  `Number()`/`parseFloat`/Postgres `::NUMERIC` with no strict-string-compare
  consumer anywhere. No action taken on CFG-001.

## YUNITE Media & Asset Engine (`src/lib/services/media/`)
ONE centralized engine for every image/asset in the system: organization logo,
member profile photos, user profile photos, official stamps, document logos,
and future system assets. **Modules consume the engine; they do NOT implement
their own upload logic.** Upload once ‚Üí store once ‚Üí reuse everywhere ‚Üí replace
centrally ‚Üí remove safely ‚Üí keep the entire system consistent.
- **Single source of truth**: `media_assets` table (asset record: uploaded vs
  external URL) + `media.*` settings (upload limit / allowed types / bucket
  names) + Supabase Storage (binary objects). The `organization.logo_url`,
  `members.profile_photo_url`, and `users.avatar_url` legacy columns are
  MIRRORED from the active asset so existing consumers keep working ‚Äî they are
  NOT the source of truth anymore.
- **Core service** (`media-asset.service.ts`): `mediaAssetService.upload()`
  validates MIME via magic bytes (NOT the extension ‚Äî SVG is blocked; PNG/JPEG/
  WebP confirmed by signature), enforces the central `media.upload_limit_mb`
  size limit, detects dimensions, uploads to the right bucket (branding=public,
  profiles=private), archives the previous active asset (does NOT delete its
  storage object ‚Äî it may be referenced by an immutable generated document),
  creates the new active record (version bump ‚Üí cache-bust `?v=`), mirrors the
  legacy column, invalidates the document-engine logo cache, and audits
  (before/after URL only ‚Äî never file contents). `resolve()` returns the
  cache-busted display URL. `setExternalUrl()` registers a legacy URL (validated
  against protocol/scheme allowlists ‚Äî javascript:/file:/data: rejected).
  `remove()` archives + clears the legacy column + deletes the storage object
  ONLY if no immutable generated document references it. `integrityCheck()`
  surfaces DB-vs-storage discrepancies for the AI engine.
- **Failure handling**: the previous image is NEVER deleted before the new
  upload succeeds. A failed upload rolls back its storage object and leaves the
  existing image untouched. Broken image references are never left behind.
- **Immutability**: generated documents snapshot the logo at generation time
  (the `generated_documents` audit row stores its own envelope). Changing the
  org logo NEVER mutates a previously generated document ‚Äî only newly generated
  documents pick up the current logo via `resolveLogoDataUri()`.
- **Document engine integration**: `resolveLogoDataUri()`
  (`src/modules/documents/styles/yunite-document.styles.ts`) now resolves the
  active ORGANIZATION_LOGO media asset FIRST (fetches its bytes + base64-encodes
  them, re-detecting MIME from magic bytes so a mislabeled file can't slip
  through), then falls back to the local `public/branding/logo.png` /
  `organization.logo_url` file path. pdfmake cannot embed remote URLs, so the
  asset's public URL is fetched + base64-encoded into a data URI.
- **API routes**: `GET/POST/DELETE /api/media/{ownerType}/{ownerId}/{assetType}`
  (POST accepts multipart `file` upload OR JSON `{url}` for legacy URL support).
  `GET /api/media/integrity` (admin+) returns DB-vs-storage findings.
  Permission model (`src/app/api/media/_guard.ts`): org branding/system assets =
  admin+; member photos = staff+; user photos = a user manages their OWN,
  admin+ manages another's. Never bypasses auth/role checks. All routes export
  `dynamic = 'force-dynamic'`.
- **Frontend**: `<YuniteImage>` (`src/components/media/YuniteImage.tsx`) is the
  central DISPLAY component (resolves the asset, handles missing/loading/broken
  states, falls back to an initials avatar / logo placeholder).
  `<YuniteImageUploader>` (`src/components/media/YuniteImageUploader.tsx`) is the
  central UPLOAD component (drag & drop + click + URL mode + preview + Replace +
  Remove + progress + error/success states). Wired into:
  - Settings ‚Üí Organization ‚Üí "Logo Url" field (renders the uploader IN-LINE
    instead of a free-text URL input ‚Äî the primary place admins expect to
    manage the logo; `onChanged=fetchConfiguration` refreshes the settings).
  - Settings ‚Üí Media & Assets (org logo + config + integrity check).
  - Members ‚Üí [id] ‚Üí profile photo uploader (staff+) + the member header now
    DISPLAYS the uploaded photo (`profile_photo_url`) instead of initials-only.
  - User Profile page (`/profile`) ‚Üí avatar uploader (a user manages their OWN
    photo; `onChanged=refreshSession` refreshes the auth context + sidebar
    avatar).
  The dashboard layout sidebar avatar reads `users.avatar_url` (mirrored by the
  engine). The member-lookup frontend receives `profile_photo_url` via the
  `/api/v1/members/{id}` workspace response (mirrored by the engine).
- **Settings UI**: `MediaSettingsSection.tsx` (`src/components/settings/`) =
  org logo uploader + `media.*` config form (saved via `PUT /api/configuration`
  so audit/history is honored) + a media integrity check panel (super_admin).
  The `media` config category is seeded by migration 036 and auto-renders in the
  settings nav.
- **Migration 036** (`036_media_asset_engine.sql`): `media_assets` table (source
  discriminator, owner_type/owner_id/asset_type, storage_bucket/path, public_url,
  external_url, mime/size/dims, version, status), unique-active index (one active
  asset per owner+type), `updated_at` trigger, `media` config category +
  `media.upload_limit_mb` (50)/`media.allowed_types`/`media.bucket.branding`/
  `media.bucket.profiles` settings, ensures `members.profile_photo_url` +
  `users.avatar_url` columns exist, creates `yunite-branding` (public) +
  `yunite-profiles` (private) storage buckets with RLS policies. Idempotent.
  **Deploy step**: run migration 036 in Supabase SQL Editor.
- **Tests**: `tests/media-engine.test.ts` (20: magic-byte MIME detection incl.
  SVG/HTML-disguised-as-PNG rejection + RIFF-not-WebP rejection, PNG dimension
  parsing, URL validation (javascript:/file:/data: rejected), cache-busting
  no-stack + param preservation). Run: `npx jest tests/media-engine`.

## Conventions
- **Member compliance + document verification gotchas (migration 037)**: the
  `documents` table's enhanced columns (`verification_notes`, `is_verified`,
  `verified_by`/`verified_at`, `category_code`, `module`, `entity_type`/
  `entity_id`, `file_size`, `mime_type`, `storage_bucket`/`storage_path`,
  `checksum`, `metadata`, `version`, `is_archived`, `archived_at`/`archived_by`,
  `visibility`, `access_roles`, `tags`, `reminder_sent`/`reminder_count`,
  `uploaded_by_name`, `ip_address`, `original_file_name`, `expiry_date`,
  `is_expired`, soft-delete cols) come from migrations 008/017/021 which were
  NOT reliably applied on the live DB. PostgREST returns "Could not find the
  column <name> in the schema cache" for any select/write referencing a missing
  column (this was the "verification_note" document-verify error). Migration
  037 (`037_reconcile_documents_schema.sql`) re-applies ALL of them
  idempotently + backfills `document_ref`/`category_code`/`module`/`entity_id`
  + reconciles the two CONFLICTING status CHECK constraints: migration 019
  made broad `document_status_check` (draft/pending/under_review/approved/
  rejected/verified/expired/archived/deleted) but migration 021 made a SECOND
  narrow `documents_status_check` (only pending/verified/expired/deleted) that
  silently REJECTED the 'approved'/'rejected' statuses the document service
  writes. 037 drops the narrow one + recreates the broad one. Deploy: run 037.
- **`manual_complete` "Mark All Complete" button (compliance)**: the bug was
  that `member_approval_workflow` UPDATE matched zero rows (no workflow row
  exists for newly registered members) ‚Üí Supabase returns `error: null` (NOT
  an error) ‚Üí the `if (wfError) insert` fallback NEVER ran ‚Üí compliance score
  never persisted, button appeared to do nothing. Fixed in
  `src/app/api/compliance/route.ts` by resolving existence explicitly (select
  id, then update-or-insert). Also `documentService.getMemberComplianceStatus`
  (`src/lib/services/document.service.ts`) used `.single()` which returns null
  when no workflow row exists ‚Üí `approve_member` 404'd with "Compliance not
  found" even after a successful manual_complete. Now uses `.maybeSingle()` +
  DERIVES the compliance score from `member_compliance` + legacy
  `compliance_records` rows when no workflow row exists, so physically-submitted
  hardcopy documents (manually marked complete) can be approved. The
  `MemberComplianceStatus.workflow_id` type is now `string | null`.
- **Member profile edit modals**: `src/app/dashboard/members/[id]/page.tsx`
  `ActionModal` type includes `edit_employment`/`edit_next_of_kin`/
  `edit_emergency`/`edit_preferences`, and the section Edit buttons
  `setActionModal(...)` to those values, but the modal RENDER BLOCKS were
  missing (only `edit_profile`/`edit_contact` existed) ‚Üí clicking did nothing.
  All four modals now exist, bound to `profileForm` and calling
  `handleUpdateProfile` (which PUTs to `/api/members/[id]`). The backend
  `allowedFields` whitelist already accepted employment/next-of-kin/emergency/
  preferences fields; the DB columns exist (migration 001 + 011).
- **Dashboard module UI coverage (all backend modules now have a page)**:
  Every module that had a backend (API + service) but no dedicated, sidebar-
  accessible admin console page now has one (commit 356c0d2):
  - **Meetings** `/dashboard/meetings` ÔøΩ schedule/edit/cancel + create modal,
    upcoming/all filter. Uses GET/POST `/api/meetings` + GET/PUT
    `/api/meetings/[id]`. (No DELETE handler exists on the route ÔøΩ cancel via
    PUT status='cancelled'.) Admin only.
  - **Automation** `/dashboard/automation` ÔøΩ run history table (GET
    `/api/automation/runs?limit=30`), 'Run Now' button (POST
    `/api/automation/trigger` returns `AutomationTickResult` with `steps[]` +
    `totals`), run-detail modal showing the `details` JSON. Admin only.
  - **Media & Assets** `/dashboard/media` ÔøΩ org logo upload/remove
    (POST/DELETE `/api/media/organization/org/ORGANIZATION_LOGO`), integrity
    check (GET `/api/media/integrity`), asset-type reference. Admin only.
    Member/user profile photos remain on their detail pages (this page
    centralizes org-level assets only).
  - **System Status** `/dashboard/system-status` ÔøΩ polls GET `/api/health`
    every 30s; overall/database/application status cards. Super-admin only.
  - **Email Queue** `/dashboard/email-queue` ÔøΩ queue stats (GET
    `/api/notifications/email?action=stats` returns `{pending,processing,
    sent,failed}`), Process Now (POST `?action=process`), Retry Failed (POST
    `?action=retry`), Test SMTP (GET `?action=test`), delivery progress bar.
    Admin only. NOTE: there is no list endpoint for individual email_queue
    rows ÔøΩ only stats; the page shows stats + controls, not a row table.
  - **Login Activity** `/dashboard/admin/login-activity` ÔøΩ pre-existing orphan
    page now linked in the super-admin Administration nav block.
  Sidebar nav (`layout.tsx`) main nav now includes: Meetings, Email Queue,
  Automation, Media & Assets. Super-admin Administration block now includes:
  User Management, API Documentation, System Status, Login Activity. All pages
  follow `'use client'` + `useAuth()` role gating + fetch from existing
  `/api/*` routes (no new backend needed).
- **Dashboard module UI coverage (all backend modules now have a page)**:
  Every module that had a backend (API + service) but no dedicated, sidebar-
  accessible admin console page now has one (commit 356c0d2):
  - **Meetings** `/dashboard/meetings` -- schedule/edit/cancel + create modal,
    upcoming/all filter. Uses GET/POST `/api/meetings` + GET/PUT
    `/api/meetings/[id]`. (No DELETE handler exists on the route -- cancel via
    PUT status='cancelled'.) Admin only.
  - **Automation** `/dashboard/automation` -- run history table (GET
    `/api/automation/runs?limit=30`), 'Run Now' button (POST
    `/api/automation/trigger` returns AutomationTickResult with steps[] +
    totals), run-detail modal showing the details JSON. Admin only.
  - **Media & Assets** `/dashboard/media` -- org logo upload/remove
    (POST/DELETE `/api/media/organization/org/ORGANIZATION_LOGO`), integrity
    check (GET `/api/media/integrity`), asset-type reference. Admin only.
    Member/user profile photos remain on their detail pages.
  - **System Status** `/dashboard/system-status` -- polls GET `/api/health`
    every 30s; overall/database/application status cards. Super-admin only.
  - **Email Queue** `/dashboard/email-queue` -- queue stats (GET
    `/api/notifications/email?action=stats`), Process Now (POST ?action=process),
    Retry Failed (POST ?action=retry), Test SMTP (GET ?action=test), delivery
    progress bar. Admin only. NOTE: no list endpoint for individual email_queue
    rows; only stats + controls.
  - **Login Activity** `/dashboard/admin/login-activity` -- pre-existing orphan
    page now linked in the super-admin Administration nav block.
  Sidebar nav (layout.tsx) main nav now includes: Meetings, Email Queue,
  Automation, Media & Assets. Super-admin Administration block now includes:
  User Management, API Documentation, System Status, Login Activity. All pages
  follow 'use client' + useAuth() role gating + fetch from existing /api/*
  routes (no new backend needed).


- **Member-lookup statement 0 balances + 'temporarily unavailable' (FIXED,
  commit 37ca005)**: the member-lookup portal Statement of Account page showed
  'KES 0.00' for every balance + 'No transactions to show' behind a
  'temporarily unavailable' banner. Two root causes:
  (1) `statementService.generate()` (`statement.service.ts`) did an INSERT into
  `notification_statements` BEFORE generating content and threw on any insert
  error. The 005/012 schema conflict means required columns (`generated_data`,
  `title`, `recipient_email`, ...) can be absent on a not-yet-migrated DB, so
  the insert threw and 500'd the entire `GET /api/v1/members/{id}/statement`
  endpoint. FIX: generation runs FIRST (live ledger = source of truth) and
  persistence is best-effort (try/catch + console.warn). A missing audit row
  never blocks statement generation.
  (2) The member-lookup `statement/route.ts` fallback only ran for status>=500
  and re-fetched balances + transactions INSIDE the catch; if either of those
  also failed the whole route 500'd. FIX: balances + transactions are fetched
  UP FRONT (with per-call .catch fallbacks) so the member ALWAYS sees real
  data. The backend statement endpoint is still tried first (now that it no
  longer 500s, available=true with no banner); on any failure we return
  available=false with the real balances + transactions already in hand.
  The frontend StatementPage already read balances + transactions from
  data.data, so no UI change was needed.
  CORRECTION (2026-08-23): that last claim was WRONG — a third root cause
  remained. `useApi` unwraps the envelope (`setData(body.data)`), so every
  dashboard page must read fields FLAT off `data` (like OverviewPage does
  `data.member`/`data.balances`). But `/api/member/statement` returned
  `{success, available, data: {balances, transactions}}` and StatementPage
  read `data.available`/`data.data.balances` — after unwrapping, `data` IS
  the inner payload, so `available` was undefined (banner always showed the
  default fallback text) and `balances`/`transactions` resolved to `{}`/`[]`
  (permanent KES 0.00 + empty activity, even though the BFF route returned
  real data). FIX: the route now nests `available` INSIDE `data`
  (`{success, data: {available, statement?, balances, transactions, note?}}`)
  and the page reads `data.available`/`data.balances`/`data.transactions`/
  `data.note` flat. Rule: BFF routes for `useApi` consumers must put ALL
  payload fields inside the envelope's `data` — never as envelope siblings
  alongside `success`.

- **Supabase UPDATE-matches-zero-rows pattern**: a PostgREST UPDATE that
  matches zero rows returns `{ data: null, error: null, count: 0 }` ‚Äî it is
  NOT an error. Never gate an insert fallback on `if (error)` after an update
  by a foreign key; resolve existence first (select id `.maybeSingle()`) then
  branch on the result.
- **Compliance score root causes (the '0% with all docs pending' bug)**: five
  separate defects combined to show "Overall Compliance 0%" with every document
  stuck at "pending" even after verifying / Mark All Complete:
  (a) `enterpriseDocumentService.verify()` (`core.service.ts`) updated
  `is_verified`/`verified_by`/`verified_at`/`verification_notes` but NEVER set
  `documents.status` ‚Äî so the row stayed `status='pending'` and the frontend
  (which checks `status==='verified'|'approved'`) counted it as pending ‚Üí 0%.
  verify() now sets `status='verified'` (with a minimal fallback update if the
  enhanced verification columns are missing on a not-yet-migrated DB).
  (b) `MemberDocumentHandler.calculateComplianceScore()` counted ONLY
  `status='approved'`, never `'verified'` ‚Äî so even a successful verify left the
  score 0%. Now `.in('status', ['approved','verified'])`.
  (c) `approve()` was rejected by the narrow migration-021 status CHECK
  constraint (only `pending/verified/expired/deleted`) on a not-yet-migrated DB
  and the old code returned a hard error ‚Üí doc stuck pending. Now falls back to
  `status='verified'`.
  (d) `manual_complete`'s document approval could fail on missing columns / the
  narrow constraint and never fell back; now retries a minimal `status='verified'`
  update. The compliance_records + `member_approval_workflow`
  (`required_documents_complete=true`) are ALWAYS set regardless, so physical
  hardcopy submissions can be approved.
  (e) The frontend `getComplianceStatus()` computed the score only from per-doc
  + per-record status, IGNORING the workflow-backed summary
  (`compliance_score`/`required_documents_complete`) returned by
  `GET /api/compliance`. When `manual_complete` set the workflow flag but the
  per-doc update failed, the UI still showed 0%. The workflow summary is now
  authoritative: `required_documents_complete===true` ‚Üí 100%, each requirement
  row renders complete (green ‚úì + 'Manual ‚úì' badge) regardless of underlying
  doc status. Captured via `workflowCompliance` state in
  `src/app/dashboard/members/[id]/page.tsx`. Migration 037 also updates the SQL
  `calculate_member_compliance_score()` fn to count both 'approved'+'verified'.


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
  the gateway ‚îú–≤—Ç–í–º—Ç–ê–≠ it omits `compliance`, `statements`, `dashboard`, and `auth`,
  which previously caused false 403s for non-super_admin portal users. Do not
  reintroduce `hasPermission` delegation in `authorize()`; the manifest
  `minRole` is the source of truth (guarded by
  `tests/api-gateway-consistency.test.ts` ‚îú–≤—Ç–ê–∞—Ç–ê–© "session-auth authorization
  honors manifest minRole"). API-key auth uses the explicit `module.action`
  scopes granted to the client (`api_client_permissions`). The `api.*`
  management endpoints are `super_admin`-only (minRole `super_admin`).
- **API keys** are stored only as SHA-256 hashes (`hashApiKey`); the raw key is
  shown once at generation. Prefixes: `yk_live_` / `yk_test_`.
- **Permission scopes**: a scope is `module.action` derived from the endpoint
  manifest. `AVAILABLE_SCOPES` (manifest.ts) dedups by `module.action` and
  excludes the internal `api` module ‚îú–≤—Ç–ê–∞—Ç–ê–© **37 distinct grantable scopes**. Grants
  MUST be validated against `AVAILABLE_SCOPES` via `parseScopeList`
  (`src/lib/api/scopes.ts`) before storing in `api_client_permissions`; the
  `api_client_permissions` table is free-form TEXT with no FK, so unvalidated
  grants become dead/typo rows that never match `authorize()`. The scope editor
  in `ApiSettingsSection.tsx` is shown on both create and edit
  (`showScopesEditor`); hiding it on create silently produces scopeless clients.
  The scope list is fetched from the public `GET /api/v1/docs`
  (`available_scopes`) and loaded once on mount via `loadScopes` ‚îú–≤—Ç–í–º—Ç–ê–≠ do NOT tie
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
key ‚îú–≤—Ç–í–º—Ç–ê–≠ it does NOT rebuild or replace any backend logic. The backend stays
the single source of truth for all data/calculations.
- **BFF + stateless JWT session pattern**: server routes hold `YUNITE_API_KEY`
  (env, never shipped to browser). Verification (`POST /api/auth/verify`)
  matches `first_name` + `phone` + `id_number` **server-side** against real
  member records (there is no dedicated verify endpoint ‚îú–≤—Ç–í–º—Ç–ê–≠ see
  `member-lookup-frontend/API_GAPS.md`), then issues a short-lived signed
  JWT (jose/HS256, `MEMBER_SESSION_SECRET`) in an httpOnly+Secure+SameSite=Lax
  cookie binding ONLY `member_id`. Every member-data route resolves the
  member from that JWT ‚îú–≤—Ç–í–º—Ç–ê–≠ never from a URL path ‚îú–≤—Ç–í–º—Ç–ê–≠ so cross-member access is
  impossible. `src/middleware.ts` guards all `/dashboard/*`.
- **Env vars**: `YUNITE_API_BASE_URL`, `YUNITE_API_KEY` (server-only),
  `MEMBER_SESSION_SECRET`, `MEMBER_SESSION_TTL_SECONDS` (default 1800),
  `NEXT_PUBLIC_APP_URL`. `.env.example` documents them.
- **Pages**: public home (live clock, upcoming meetings [graceful],
  rotating YUNITE + motivational messages, "Access my member account" CTA);
  dashboard (overview, savings&shares, contributions, welfare, loans w/
  progress, fines, transactions w/ filter, statement [graceful on backend
  500], notifications, profile [masked ID], support [org contact + FAQ]).
- **Gotcha ‚îú–≤—Ç–í–º—Ç–ê–≠ `/api/v1/members/{id}` returns the member *workspace***
  (`{ member, accounts, compliance, transactions, documents, loans, fines }`),
  NOT a bare member. `member.service.ts` `getMember()` extracts `.member`.
  Do not assume `getMember` returns the workspace.
- **Gotcha ‚îú–≤—Ç–í–º—Ç–ê–≠ logout is stateless**: `POST /api/auth/logout` clears the
  browser cookie, but a captured token remains valid until its short TTL
  expires. This is standard for stateless sessions and acceptable for a
  read-only portal. Do not add a server-side token blocklist for this.
- **Verified against live backend** (2026-08-13): all member-data routes
  return real data (savings=300, shares=3, contributions=100, welfare=0,
  fines=50, loans=220 for the test member); no-cookie & tampered-cookie ‚îú–≤—Ç–ê–∞—Ç–ê–©
  401; `tsc --noEmit` clean; `next build` clean (28 routes).
- **Backend gaps** (handled gracefully, never fabricated): see
  `member-lookup-frontend/API_GAPS.md` ‚îú–≤—Ç–í–º—Ç–ê–≠ no `members.verify` endpoint, no
  `/api/v1/meetings` (only session-auth `/api/meetings`), statement endpoint
  500s on live DB, contributions list not member-filterable (use
  transactions), no support-ticket endpoint.


- **Unity Fund posting/withdrawal UI** (2026-08-16): `src/app/dashboard/unity-fund/page.tsx`
  is now writable, not just read-only. It exposes the Unity Fund's authoritative
  write surface via role-gated action buttons + a modal form:
  - Record Donation / Record Grant (staff+) -> `POST /api/v1/unity-fund/{donations,grants}`
  - Record Organization Loan / Record Expenditure (admin+) -> `POST /api/v1/unity-fund/{organization-loans,expenditures}`
  These delegate to `UnityFundEngine.record{Donation,Grant,OrganizationLoan,Expenditure}`
  -- the engine is the source of truth; the UI never computes balances. The expenditure
  path enforces the available-cash guard (pending receivables are not spendable) and
  surfaces the engine's error message to the user. Role gating mirrors the manifest
  minRole; server-side `createHandler` authorization remains authoritative.
- **AI `unity_fund` scope reachable** (2026-08-16, migration 039): the `ai_investigations`
  scope CHECK now includes `'unity_fund'`, and `POST /api/ai/investigations` +
  `/api/ai/schedules` + the dashboard `SCOPE_LABELS` accept it. A Super Admin can now
  launch and schedule Unity Fund investigations (previously blocked despite the engine
  existing). Run migration 039 in Supabase SQL Editor on deploy.

## Support Ticket System (migration 046)
Closes member-lookup API gap #5: members raise support requests in-app from
the portal instead of only contacting the office directly.
- **Migration 046** (`046_support_tickets.sql`): `support_tickets` table
  (ticket_reference UNIQUE `SUP-YYYYMMDD-XXXX`, category/status CHECK lists
  matching `SUPPORT_TICKET_CATEGORIES`/`SUPPORT_TICKET_STATUSES` in the
  service, `admin_response`/`resolved_by`/`resolved_at`). **The member_id FK
  is ON DELETE CASCADE so the permanent member deletion engine (045) keeps
  working unchanged** — the RPC's final `DELETE FROM members` cascades the
  ticket rows; `MEMBER_DEPENDENCY_MAP` lists it as optional cascade.
  Plus a `support` notification category + 3 templates
  (`support.ticket.received` member confirmation, `admin.support_ticket_received`
  admin alert, `support.ticket.updated` status-change notice to the member).
- **Service** (`src/lib/services/support-ticket.service.ts`):
  `createForMember` (validates member, generates ref, best-effort audit_logs +
  member confirmation + per-admin alerts via `sendFromTemplate`),
  `listForMember`, `listAll` (joins member number/name), `updateStatus`
  (sets/clears resolved_* and notifies the member). All notification sends are
  best-effort so a missing template (pre-migration DB) never fails a write.
- **v1 gateway**: `GET|POST /api/v1/support/tickets` (manifest ids
  `support.list`/`support.create`; scopes `support.read`/`support.create` are
  grantable). **Deploy step: run migration 047
  (`047_support_scope_grant.sql`)** — it auto-grants both scopes to every
  active `lookup`-type client AND any active client already holding
  `members.read` (the portal client qualifies either way;
  `ON CONFLICT DO NOTHING`, idempotent). Without it the portal's ticket
  calls 403 ("API client lacks permission support.create"); the portal BFF
  maps that 403 to a member-friendly "being activated" message.
- **Admin (session-auth)**: `GET /api/support/tickets` + `PATCH
  /api/support/tickets/[id]` (staff+; PATCH validates status against the
  service constants). Dashboard page `/dashboard/support-tickets` (sidebar:
  "Support Tickets") lists tickets with a status filter + a detail modal to
  change status and write the response that is emailed to the member.
- **Member portal**: BFF `GET|POST /api/member/support` (member_id bound from
  the session JWT — never from the request body); `client.ts` gained
  `apiPost()` (retries ONLY network-level failures — a POST that reached the
  server is never retried, to avoid duplicate tickets). The Support page has a
  real Submit-a-request form + a "My requests" list with status badges and the
  office's response.
- **Tests**: `tests/support-tickets.test.ts` (12: ref format, migration static
  guarantees incl. CASCADE FK + template seeds + CHECK-vs-constants, manifest
  endpoints + grantable scopes, deletion-map entry). Run:
  `npx jest tests/support-tickets tests/api-gateway-consistency --forceExit`.
- **Deploy**: run migrations 046 AND 047 in Supabase SQL Editor; redeploy
  both apps. (047 auto-grants the scopes — no manual API Keys UI step.)

## Member Pre-Registration & Smart Auto-Fill (`/register/member`)
A **public** pre-registration layer that collects prospective-member information
through a branded form mirroring the EXACT field set of the existing admin
registration form, **without registering the person as a member**. Submissions
are stored for admin review and linked back to the eventual member. The
existing registration engine remains the source of truth ‚Äî this layer feeds it.
- **Migration 040** (`040_member_registration_submissions.sql`): the
  `member_registration_submissions` table (status `submitted`‚Üí`reviewing`‚Üí
  `registered`/`rejected`/`archived`, terminal-state guards via CHECK, unique
  on `submission_reference`), a `registration` config category + 3 settings
  (`registration.public_enabled` default true, `registration.notify_admins`
  default true, `registration.submission_reference_prefix`), and 4 notification
  templates (`member.submission.received`, `member.submission.reviewing`,
  `member.submission.registered`, `member.submission.rejected`). Run in
  Supabase SQL Editor on deploy.
- **Duplicate rejection + pre-edit update flow (migration 041
  `041_submission_update_intent.sql`, IMPLEMENTED)**: public form submissions
  now have `intent` ('register'|'update') + `existing_member_id` +
  `update_applied_at/by` columns. id_number/phone are HARD identity fields: a
  'register' submission matching an existing member on either is REFUSED with
  `DuplicateMemberError` ‚Üí HTTP 409 `{code:'DUPLICATE_MEMBER', matches}` (email
  matches stay advisory flags). Public lookup route `GET
  /api/member-registration-submissions/lookup?id_number=|phone=` (no session ‚Äî
  the middleware publicReadPaths prefix covers it) returns the member's record
  for pre-fill; exact case-insensitive single-record match only (no fuzzy
  search ‚Üí not enumerable). The public form has an "Already registered? Find
  my record" button next to the ID field (+ a "Load my existing record" button
  on a 409): on a match it enters pre-edit mode ‚Äî whole form pre-filled from
  the on-file data, header switches to "Update My Member Record", submit sends
  `intent:'update'` + `existing_member_id`, and the success screen talks about
  an update request. Admin queue (AutofillFromSubmissionsModal): update-intent
  submissions show a blue "Update request" badge + a "View member ‚Üí" link +
  an "Apply Update to Member" button (PATCH `{status:'applied'}` ‚Üí
  `applyUpdate()`, gated by members.update). `applyUpdate()` writes ONLY
  non-empty submitted fields (never erases with blanks), then closes the
  submission (status 'registered' linked to the UPDATED member). The service
  degrades gracefully if migration 041 hasn't been run: the insert retries
  without the new columns and embeds `intent`/`existing_member_id` in the
  `submitted_data` JSON, which `applyUpdate()` also reads back. Deploy: run
  migration 041 in Supabase SQL Editor. Tests:
  `tests/member-registration-submissions.test.ts` (18: id/phone hard
  rejection, email flag-only, update linkage, lookup fallbacks, applyUpdate
  writes + double-apply refusal, register-refusal, 409 mapping, 201 update).
- **Service** (`src/lib/services/member-registration-submission.service.ts`):
  `create(data, opts)` ‚Äî validates against the SAME Zod schema shape as
  `registrationSchema`, normalizes phone/email, detects duplicates against
  EXISTING members by `id_number`/`phone`/`email` (read-only, never blocks
  submission), persists the row with `submitted_data` (verbatim original) +
  `duplicate_match`, inserts an `audit_logs` row, and notifies admins in-app +
  queues an applicant confirmation email (the applicant is NOT a user/member,
  so the confirmation goes directly to `email_queue` with a rendered template
  body ‚Äî admins get `sendFromTemplate`). `markRegistered(id, memberId,
  memberNumber, adminId)` links a submission to a new member (terminal-state
  guard: refuses double-registration). `reject()` / `archive()` / `refreshDuplicate()`.
  `resolvePublicUrl(origin)` derives `${origin}/register/member`.
- **API routes**: `POST /api/member-registration-submissions` (PUBLIC ‚Äî no
  session; gated by `registration.public_enabled` setting), `GET /api/member-registration-submissions`
  (admin list with search/filter), `GET|PATCH /api/member-registration-submissions/[id]`
  (admin get + status transitions: `mark_reviewing`/`reject`/`archive`/`refresh_duplicate`).
  All routes export `dynamic = 'force-dynamic'`.
- **Public form**: `/register/member` (`PublicMemberRegistrationForm.tsx`) ‚Äî
  branded (navy `#0B2A4A` + green `#22C55E` from `ORG_IDENTITY` in
  `reports/brand.ts`, NOT the `reports` barrel which pulls server-only modules
  into client bundles), the same Personal/Contact/Employment/Next of Kin/
  Emergency Contact sections + fields as the admin form, success screen with
  the submission reference + a clear "this does NOT make you a member" notice.
- **Smart Auto-Fill (admin)**: the existing Members page registration form gained
  an "Auto-fill from Submitted Registrations" button + modal
  (`AutofillFromSubmissionsModal.tsx`). An admin searches, selects an applicant,
  and the EXISTING registration form is populated (editable). Clicking the
  EXISTING "Register Member" button runs the existing registration engine; the
  client sends `_submission_id` so the backend links the submission to the new
  member AFTER registration succeeds (best-effort, never undoes registration).
  Duplicate matches are shown with a "View member ‚Üí" link so the admin can
  reconcile before registering.
- **Post-registration linking**: `POST /api/members` (`src/app/api/members/route.ts`)
  now strips `_submission_id` before validation and, after the existing
  `memberRegistrationService.register()` succeeds, calls
  `memberRegistrationSubmissionService.markRegistered()` ‚Äî this is what prevents
  double-registration from the same submission. Failure to link is logged but
  never fails the registration.
- **Settings UI**: `RegistrationSettingsSection.tsx` (Settings ‚Üí Member
  Registration) shows the public URL (derived from `window.location.origin`),
  a copy button, a QR code (via the public `api.qrserver.com` endpoint ‚Äî no QR
  library dependency), toggle switches for `public_enabled` + `notify_admins`,
  and a "how bulk registration works" explainer. Saved via `PUT /api/configuration`.
- **Middleware**: `/api/member-registration-submissions` added to
  `publicReadPaths` in `src/middleware.ts` so the public POST is reachable
  without a session (admin verbs are gated inside the route handler).
- **Tests**: `tests/member-registration-submissions.test.ts` (9: create stores
  pending + no member; duplicate detection by id_number; markRegistered links
  + refuses double-registration; reject refuses registered; resolvePublicUrl;
  POST /api/members strips `_submission_id` + links; registers normally when
  no submission; public POST 201; public POST 400 on invalid). Run:
  `npx jest tests/member-registration-submissions --forceExit`.
- **Gotcha ‚Äî `ORG_IDENTITY` client import**: the public form is a client
  component ('use client'). Importing from `@/lib/services/reports` (the
  barrel) pulls `document-export.service.ts` ‚Üí `@/lib/supabase/server` ‚Üí
  `next/headers`, which breaks client compilation. Import `ORG_IDENTITY`
  directly from `@/lib/services/reports/brand` (pure module, no server imports).

## Registration Acknowledgement Emails (migration 044)
Two distinct acknowledgement emails, one per stage of the applicant‚Üímember
journey:
- **Pre-registration (submission received)**: `create()` in
  `member-registration-submission.service.ts` calls `sendApplicantConfirmation()`
  when the applicant provided an email. It renders the seeded
  `applicant.submission_received` template (migration 040; subject/body are
  admin-editable) with a built-in fallback copy when the template row is
  missing, inserts a `recipient_type='system'` notification addressed to the
  applicant email, and queues an `email_queue` row with an EXPLICIT
  `scheduled_for` (processQueue filters `.lte('scheduled_for', now)` which
  never matches NULL rows ‚Äî an omitted value can leave the email queued
  forever on DBs where the column default was not applied). It then attempts
  immediate `emailService.processQueue()` (best-effort; the automation cron
  is the fallback). The copy makes clear the applicant is NOT yet a member.
- **Official registration (member registered)**: the `member.registered`
  event previously only notified `all_admins` (admin-facing
  `member.registered` template) ‚Äî the member never got an email. A SECOND
  event mapping in `event.service.ts` now fires
  `member.registration_confirmation` (seeded by migration
  `044_member_registration_acknowledgement.sql`, channels in_app+email) to
  `recipient_type: 'member'`. `emitMemberRegistered` adds `organization_name`
  to the event data via `getOrganizationName()` (settings
  `organization.name` ‚Üí `ORG_IDENTITY.name` fallback). Members without an
  email still get the in-app notification; `sendFromTemplate` logs + skips
  gracefully if migration 044 has not been run.
- **Deploy step**: run migration 044 in Supabase SQL Editor.
- **Tests**: `tests/member-registration-submissions.test.ts` (+3: applicant
  email queued with explicit scheduled_for + immediate processQueue; template
  rendering when seeded; no email when none provided) and
  `tests/member-registration-acknowledgement.test.ts` (4: member.registered
  notifies admins AND the member with member.registration_confirmation;
  member_number/organization_name variables; brand fallback). Run:
  `npx jest tests/member-registration --forceExit`.

## Permanent Member Deletion Engine (migration 045)
Super-Admin-only, atomic, irreversible member deletion. Two deletion levels
exist: **Archive** (pre-existing `DELETE /api/members/[id]` ‚Üí status
'withdrawn', reversible) and **Permanent Delete** (this engine).
- **Migration 045** (`045_permanent_member_deletion.sql`): the
  `permanent_member_deletions` MINIMAL audit table (member_id + member_number
  + deleted_by + deleted_at + reason + per-table deleted_counts ‚Äî NO financial
  history) and `permanently_delete_member(p_member_id, p_admin_id, p_reason,
  p_ip_address, p_user_agent)`, a SECURITY DEFINER Postgres function that
  performs the ENTIRE dependency-ordered deletion. A function executes inside
  ONE database transaction: any failure rolls back EVERYTHING. The function
  guards every optional table (`to_regclass`) and every 004-vs-005 /
  012-vs-005 column shape (notifications.member_id vs recipient_type/
  recipient_id, notification_statements, notification_preferences) so it works
  on partially-migrated DBs. REVOKEd from PUBLIC, EXECUTE granted to
  service_role only. **Deploy step: run migration 045 in Supabase SQL
  Editor** ‚Äî without it the POST route returns EXECUTION_FAILED (and deletes
  nothing).
- **Dependency ordering (mapped from migrations 001-045, not guessed)**:
  member_compliance BEFORE documents (FK document_id);
  notification_delivery_history BEFORE email_queue BEFORE notifications ‚Äî
  the history table references BOTH notifications(notification_id) and
  email_queue(email_queue_id), so the function collects the queue ids
  (notification-linked + direct-to-member-email, incl. the applicant
  confirmation rows with notification_id NULL) and clears history by either
  link before deleting the queue rows;
  loan_interest_receipts BEFORE loans (FK loan_id); transactions BEFORE
  accounts BEFORE members. CASCADE tables (accounts, member_approval_workflow,
  member_status_history, member_committees/projects/meetings,
  loan_interest_receipts) are also deleted explicitly for deterministic
  counts. meetings.chairperson/secretary are SET NULL (meeting records
  preserved); member_registration_submissions.registered_member_id/
  existing_member_id are unlinked (applicant intake record preserved);
  generated_documents + ai_verification_results use their designed
  ON DELETE SET NULL; member_financial_obligations +
  unity_fund_actual_receipts are VIEWS (auto-refresh); audit_logs +
  notification_event_logs are KEPT (append-only operational audit).
- **Live FK failure 2026-08-22 (stale function)**: the live DB aborted a
  deletion with `notification_delivery_history_email_queue_id_fkey` because
  the DEPLOYED function was the original 045 body (history cleared by
  notification_id only); commit 5aee568 fixed it (clear history by
  notification OR queue link before deleting queue rows). A migration edit
  does NOT reach the live DB by itself ‚Äî the function body lives in the
  database, so **re-running migration 045 in the Supabase SQL Editor is the
  deploy step** (idempotent DROP + CREATE OR REPLACE). The rollback was by
  design: the atomic function left zero partial state, so the member was
  safe to delete again after the re-run. Follow-up hardening (8b11403):
  direct-to-member queue rows are matched case-insensitively
  (`lower(to_email) = lower(v_member_email)`) so a case-variant address
  cannot orphan a queue row + its history rows.
- **Deliberate exception**: migration 001's "NEVER delete transactions" rule
  applies to day-to-day operations (use reversals). This engine is the single
  audited Super-Admin exception ‚Äî a permanent deletion removes the member's
  ledger rows inside the atomic transaction. Org totals are computed LIVE
  (SUM over the ledger / views), so they are automatically correct after
  deletion; no stored aggregates need recomputation.
- **Service** (`src/lib/services/member-deletion.service.ts`):
  `MEMBER_DEPENDENCY_MAP` (single source of truth: 30 entries, strategy
  delete/unlink/cascade/set_null/view/audit_keep),
  `scanMemberDependencies()` (read-only scan + live financial state via
  `transactionEngine.calculateAllBalances` + loans/fines/obligations),
  `executePermanentDeletion(memberId, adminId, confirmText)` ‚Äî requires
  confirmText === 'DELETE MEMBER', calls the RPC, then verifies (member gone
  by id AND member_number; zero remaining rows in every member-linked table)
  and throws VERIFICATION_FAILED rather than claim success if anything
  remains. Storage objects (documents bucket + media asset buckets) are
  cleaned up best-effort AFTER commit (storage is not transactional; failure
  never fails the deletion). Audit: the RPC inserts the
  permanent_member_deletions row inside the transaction; the service adds an
  audit_logs row (best-effort, per project convention).
- **Routes**: `GET /api/members/[id]/permanent-delete` (scan preview) and
  `POST /api/members/[id]/permanent-delete` (execute; body
  `{confirm_text: 'DELETE MEMBER', reason?}`), both `requireSuperAdmin` +
  `dynamic = 'force-dynamic'`. `GET /api/admin/member-deletions` lists the
  minimal audit trail (super_admin). The v1 API gateway has NO member-delete
  endpoint ‚Äî permanent deletion is session-auth super_admin only, never
  API-key reachable.
- **UI**: member profile ‚Üí Settings tab ‚Üí red "Danger Zone" card
  (super_admin only): Archive (reversible) vs Permanently Delete (opens a
  modal that live-loads the dependency scan: member name/number, financial
  state, per-module record counts, typed `DELETE MEMBER` confirmation; on
  success shows the completion report ‚Äî per-table deleted counts, post-delete
  org totals, storage cleanup, verification all-clear ‚Äî then returns to the
  members list).
- **Caches/lookup**: there are NO server-side member caches (every read is a
  live query); member-lookup portal + v1 API 404 naturally after deletion
  (stateless member JWTs expire via their short TTL ‚Äî acceptable, documented
  pattern).
- **Tests**: `tests/member-deletion.test.ts` (16: dependency-map completeness,
  migration static guarantees incl. delete ordering + in-transaction audit,
  scan financial state + counts, confirmation gate, full atomic deletion of a
  realistic connected member with other members untouched + org totals
  consistent, full rollback on mid-transaction failure, route auth 403/400/
  200). Run: `npx jest tests/member-deletion --forceExit`.

## Settings Categories: Required/Optional Status + 4 Implemented Categories (migration 042)
- **"Partially Set" mislabeling root cause**: category `configuration_status`
  counted EVERY setting with an empty value as unconfigured, but some settings
  are optional by design (organization contacts/registration number are
  deliberately never fabricated; `smtp.password` comes from env or Gmail
  OAuth). Migration 042 adds `settings.is_required` (default TRUE) and marks
  the deliberately-optional keys FALSE. `computeCategoryStatus()`
  (exported pure function in `configuration.service.ts`, used by both
  `getAllByCategory` + `getByCategory`) computes status over REQUIRED settings
  only: optional-empty no longer blocks 'configured'. Rows are read via
  `select('*')`, so on a not-yet-migrated DB `is_required` is undefined and
  treated as required (legacy behavior preserved).
- **Dead `smtp.username` key**: migration 007 seeded `smtp.username` but the
  email service reads `smtp.user` (migration 005). The dead empty row held
  SMTP at "Partial" forever. 042 preserves any value into `smtp.user` then
  deletes the dead row.
- **The 4 previously-"Not Set" categories** (no settings rows seeded) are now
  implemented with real consumers: **savings** (`savings.min_balance` /
  `savings.max_withdrawal_amount` enforced on `savings_withdrawal` in
  `transaction.engine.ts`; 0 = unrestricted preserves behavior),
  **integrations** (`integrations.gmail_api_enabled` gates
  `gmail-api.adapter.ts`; the consumed `gmail.*` credential keys ‚Äî previously
  never seeded, invisible in the UI ‚Äî are seeded as optional password-type
  rows under the integrations category), **compliance**
  (`compliance.allow_manual_completion` gates the `manual_complete` action in
  `/api/compliance`), **branding** (`branding.tagline` flows into
  `resolveOrgIdentity()` ‚Üí rendered on every generated document header;
  primary/accent colors use the new `color` data_type with a color picker in
  the generic settings form).
- **Settings page UI**: `ActiveSection` union extended with
  savings/integrations/branding/unity_fund; nav icon map + fallback-exclusion
  list updated; generic form shows an "Optional" badge on
  `is_required === false` settings.
- **Tests**: `tests/settings-categories.test.ts` (13: computeCategoryStatus
  semantics incl. pre-migration `is_required === undefined` treated as
  required, all-optional category, whitespace/null values; migration 042
  consistency ‚Äî required seeds must have non-empty defaults, gmail.* seeds,
  smtp.username cleanup). Run: `npx jest tests/settings-categories --forceExit`.
- **Pre-existing tsc error fixed**: `tests/supabase-no-store-fetch.test.ts`
  had a bad `recorded` array type (introduced in 052cfc9); fixed to
  `Array<{ input: RequestInfo | URL; init?: RequestInit }>`. `tsc --noEmit`
  is fully clean again.
- **Deploy step**: run migration 042 in Supabase SQL Editor.

## Auth hardening follow-up (post-670ee05 security sweep)
- **All JWT secret access goes through `getJwtSecret()`** (`src/lib/auth/jwt-secret.ts`)
  — never `process.env.SUPABASE_JWT_SECRET!` or a module-level const. The helper
  throws if the secret is missing or < 32 chars (fail closed). 14 route/lib files
  were migrated from the `SUPABASE_JWT_SECRET!` non-null-assertion pattern.
- **Startup validation**: `src/instrumentation.ts` `register()` (enabled via
  `experimental.instrumentationHook` in `next.config.js`) throws at server boot
  when the secret is missing/short — a misconfigured deploy fails fast with a
  clear boot error instead of request-time auth failures. NOTE: Next catches the
  error and serves 500s rather than exiting; the boot log names the exact fix.
- **Middleware is fail-closed for every `/api/*` route** (GET included) except an
  explicit `publicReadPaths` allowlist: health, auth/login+logout,
  `/api/member-registration-submissions` (public pre-registration),
  `/api/reports/verify` (PUBLIC document verification for external parties —
  banks/employers verifying a printed doc by ref; adding this was a regression
  fix after 670ee05 broke it), and the two CRON_SECRET cron routes. `/api/v1/*`
  bypasses the middleware cookie check entirely (gateway self-authenticates).
- **Gotcha — route handler tests**: any test importing an API route that verifies
  JWTs must set `process.env.SUPABASE_JWT_SECRET` (>=32 chars) or getJwtSecret()
  throws before the handler logic runs (fixed in `tests/auth-session-shape.test.ts`).
- **Tests**: `tests/middleware-auth.test.ts` (13: fail-closed 401s, forged token
  with the old public fallback secret rejected, public allowlist passes,
  `/api/reports` NOT public while `/api/reports/verify` is, getJwtSecret rules).
  Live-probed against `next start`: unauthenticated data APIs -> 401, public
  paths pass, boot without the secret fails loud.

## Critical-vulnerability sweep (2026-08-26) — six verified findings fixed
- **Credential hygiene**: live DB URL+password, Redis password, Gmail SMTP app
  password, Supabase service-role key/access token, and the default admin
  password were committed in `docs/FORENSIC_SYSTEMS_AUDIT_REPORT.md` +
  `docs/DEVELOPER_INSTRUCTIONS.md`, and the live admin password was hardcoded
  in `tests/auth.test.ts`/`tests/integration.test.ts`. All redacted. ROTATION
  of those credentials is an OPERATOR action (Supabase/Upstash/Gmail
  dashboards) — the repo purge alone does not invalidate them.
- **Destructive routes now session-guarded**: `POST /api/settings/reset-data`
  requires `requireSuperAdmin` (GET stats `requireAdmin`); the audit log actor
  is the session user, never `body.user_id`. `POST /api/settings/database-reset`
  derives identity/role from the verified JWT (the old body `user_id` lookup
  was spoofable) and level_3 requires the caller's REAL password verified
  server-side with bcrypt against `users.password_hash` (the old
  `password_verified` body boolean was client-controlled). The settings page
  wizard collects the password for level 3.
- **`POST /api/transactions/reverse`** requires `transactions.reverse`
  (admin+) — previously any authenticated user could reverse any transaction.
- **`/api/notifications/email`** (GET+POST, all actions) requires
  `notifications.send_email` (admin+) — previously any authenticated user had
  an arbitrary email relay through the org's Gmail/SMTP identity. Staff/viewer
  no longer see queue stats (the notifications page silently skips the panel).
- **Public member lookup minimized + rate-limited**:
  `GET /api/member-registration-submissions/lookup` now returns ONLY
  id/member_number/status/first_name/last_name (never KRA PIN, ID number, DOB,
  addresses, next-of-kin, emergency contacts) and is limited to 10/min/IP.
  The public form no longer pre-fills on-file PII — the applicant re-enters
  the fields they want to update.
- **Legacy-route rate limiter** (`src/lib/api/simple-rate-limit.ts`):
  in-memory fixed-window limiter for non-gateway routes (the v1 gateway keeps
  its Redis limiter). Applied: login 20/min/IP, public registration POST
  5/min/IP, public lookup 10/min/IP. `_resetSimpleRateLimit()` is the test
  hook — call it in beforeEach of any test hitting these routes.
- **PostgREST .or() filter injection**: `escapeOrFilterValue()`
  (`src/lib/utils/postgrest.ts`) strips `, ( ) . " ' \` before interpolating
  user input into raw `.or()` logic strings. Applied in
  `member-registration.service.ts` (member search), `documents/search.service.ts`
  (member name search), `documents/core.service.ts` (version history id).
  ANY new `.or()` with interpolated input MUST sanitize first.
- **Tests**: `tests/security-hardening.test.ts` (30: auth matrix for all four
  hardened routes incl. the body-spoof regression, lookup PII minimization,
  rate limits, sanitizer, credential hygiene, static source guards).
  Run: `npx jest tests/security-hardening --forceExit`.
