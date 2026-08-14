# YUNITE AI Intelligence Engine

A production-grade **Dual-AI Investigation & Quality Assurance Engine** inside the YUNITE CBO Portal. Gemini and OpenRouter independently investigate the system, compare real data against expected business behavior, identify inconsistencies, generate evidence-based reports, and continuously verify that what members see corresponds to the actual backend/database state.

> The database and deterministic YUNITE business engines remain the source of truth. **AI investigates the system; it does not become the system.** AI never invents financial values, never modifies financial records, and never inserts/updates/deletes business data.

## Architecture

```
DATABASE
  ↓
DETERMINISTIC YUNITE ENGINES   ← always run; source of truth for correctness
  ↓
CONTROLLED INVESTIGATION TOOLS  ← read-only, PII-sanitized
  ↓
GEMINI + OPENROUTER             ← independent, never see each other's conclusions
  ↓
INDEPENDENT REPORTS
  ↓
COMPARISON ENGINE               ← agreements / disagreements / REQUIRES VERIFICATION
  ↓
EVIDENCE VALIDATION + FINAL REPORT
```

## Module layout (`src/ai/`)

| Path | Responsibility |
| --- | --- |
| `providers/provider.ts` | The `AiProvider` interface — the ONLY abstraction the rest of the engine depends on. |
| `providers/gemini.provider.ts` / `openrouter.provider.ts` | Concrete providers (HTTPS, server-side keys). |
| `providers/failover.ts` | `investigateWithFailover()` — primary (Gemini) → secondary (OpenRouter) with a ~1s failfast *failure-detection* probe that does NOT cap generation duration. |
| `providers/health-monitor.ts` | In-memory rolling health (availability %, successes, failures, timeouts, rate limits, fallbacks). |
| `providers/prompt-builder.ts` | Builds the shared investigation prompt (scope + deterministic findings + sanitized tools payload). |
| `providers/response-parser.ts` | `extractJson()` + `normalizeReport()` — robust JSON extraction, enum clamping; **AI findings are never auto-`confirmed`**. |
| `tools/sanitizer.ts` | `sanitizeForAi()` — redacts PII (names, phone, email, id_number, address) and **secrets** (passwords, tokens, api keys, service-role keys) before anything reaches a provider. Financial amounts are preserved. |
| `tools/database-tools.ts` / `api-tools.ts` / `member-lookup-tools.ts` | Read-only investigation tools: `getDatabaseSchema`, `queryReadOnlyDatabase`, `getMember`, `getMemberFinancials`, `getSavingsTransactions`, `getShares`, `getLoans`, … All SELECT-only; no credentials handed to the model. |
| `engines/database-consistency.engine.ts` | Orphans, duplicates, invalid FKs, negative-where-prohibited, impossible dates, invalid statuses, duplicate member numbers / transaction refs, stale aggregates. |
| `engines/financial-consistency.engine.ts` | Independent recompute of `SUM(valid savings transactions)` vs stored balance, loan balances vs repayments, etc. AI explains the discrepancy; it never guesses the calc. |
| `engines/cross-module.engine.ts` | Member→Savings→Shares→Loans→Repayments→Contributions→Fines→Welfare→Accounts→Statements→Member Lookup relationship checks. |
| `engines/business-rules.engine.ts` | CONFIGURATION vs IMPLEMENTATION vs DATABASE RESULT vs FRONTEND DISPLAY. |
| `engines/api-consistency.engine.ts` | Route/method/controller/service/auth/authz/response structure; unused/duplicate/broken/stale routes; read-only GETs only. |
| `engines/member-verification.engine.ts` | DATABASE → BACKEND API → MEMBER LOOKUP DISPLAY per-field comparison + score. |
| `comparison.engine.ts` | `compareReports()` — agreements, gemini-only, openrouter-only, disagreements (marked `REQUIRES VERIFICATION`, never auto-promoted), verified (deterministic-aligned), human-review queue. |
| `report.engine.ts` | `computeScore()` (severity-weighted, 0–100), `buildFinalReport()` (severity-sorted). |
| `investigation.engine.ts` | `runInvestigation(scope, memberId?)` orchestrator: deterministic → dual independent AI → comparison → persist → alert. Deterministic findings are **always** produced even if both providers fail. |
| `alerting.service.ts` | On CRITICAL findings: internal YUNITE notification (per-day idempotent) + best-effort email. **No sensitive financial values in email bodies** — full evidence stays in the Admin Console. |
| `persistence.ts` | All `ai_*` table reads/writes + schedule helpers. |

## Failover & timeout semantics

- Default primary = **Gemini**, secondary = **OpenRouter**.
- `AI_FAILFAST_TIMEOUT_MS` (default 1000ms) gates **failure detection**: a fast reachability probe decides whether to fall over *before* starting a generation.
- It does **NOT** cap maximum generation duration — a valid slow generation runs to completion.
- If both providers fail, deterministic findings still run and the investigation is marked `partial` with `ai_status = unavailable`.
- `recordProviderFailure()` logs each failure; health snapshots are persisted.

## Dual-AI independence

For `full_system` and `member_verification` scopes, both providers run in **parallel** with the **same** context + tools payload. Neither sees the other's conclusions before producing its report. Reports are stored separately (`ai_reports`), then the comparison engine reconciles them.

## AI is NOT the source of truth

- All database investigation is **read-only** (SELECT / `.select()` only — asserted in tests).
- AI receives **no DB credentials** and **no service-role keys** (sanitizer strips them).
- AI never directly executes arbitrary SQL — it consumes pre-fetched, sanitized tool payloads.
- AI-sourced findings start `verification_status = unverified`; only deterministic checks or both-provider agreement can `confirm` a finding. Disputed findings are `REQUIRES VERIFICATION`.

## API surface (all admin+ session-authenticated unless noted)

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/ai/health` | Provider health + recent totals + overall score. |
| `GET` | `/api/ai/investigations` | List recent investigations (`?limit=&scope=`). |
| `POST` | `/api/ai/investigations` | Run `{ scope, memberId? }`. |
| `GET` | `/api/ai/investigations/[id]` | Full detail (reports, runs, comparison, verification). |
| `GET` | `/api/ai/investigations/[id]/compare` | The comparison result (dual-mode only). |
| `GET` | `/api/ai/reports/[id]` | Single AI report (inspect one provider independently). |
| `POST` | `/api/ai/member-verification` | Verify `{ memberId }` end-to-end. |
| `GET` | `/api/ai/schedules` | List schedules. |
| `POST` | `/api/ai/schedules` | Create schedule (super_admin). |
| `PUT`/`DELETE` | `/api/ai/schedules/[id]` | Update/delete (super_admin). |
| `GET`/`POST` | `/api/cron/ai-investigations` | **CRON_SECRET**-protected (no session). Runs due schedules + alerts. |

The middleware lets `GET /api/ai/*` through and the routes enforce admin auth themselves; POST/PUT/DELETE require a session cookie (verified by middleware), then `requireAdminAuth()` checks the role.

## Admin Console

`/dashboard/ai-intelligence` — six sections:
- **Overview** — system health, findings totals, recent investigations, provider config.
- **Gemini** / **OpenRouter** — independent provider status + reports (kept separate to preserve dual-AI independence in the UI).
- **AI Comparison** — agreements, gemini-only, openrouter-only, disagreements, verified, human review.
- **Report History** — investigation detail with per-field verification result + provider runs.
- **Schedules** — create/enable/disable/delete (super_admin only).

Action bar: Run Full Investigation, Database/API/Financial/Cross-Module/Business-Rules, Verify Member.

## Scheduling & alerting

- `ai_investigation_schedules` (daily/weekly/monthly/on_demand) drive the cron tick.
- `render.yaml` adds a `yunite-ai-investigations-tick` cron service (`*/30 * * * *`) curling `/api/cron/ai-investigations` with `X-Cron-Secret`.
- CRITICAL findings → internal notification (per-day idempotent) + optional email (no sensitive values).

## Performance

Member lookup is never blocked by AI. The normal flow (member → API → DB → display) is untouched. AI verification runs on demand, async, or via scheduled jobs.

## Environment variables

| Var | Required | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | for Gemini | Server-side only. Unset → provider "not configured". |
| `GEMINI_MODEL` | no | Default `gemini-2.0-flash`. |
| `OPENROUTER_API_KEY` | for OpenRouter | Server-side only. |
| `OPENROUTER_BASE_URL` | no | Default `https://openrouter.ai/api/v1`. |
| `OPENROUTER_MODEL` | for OpenRouter | |
| `AI_PROVIDER` | no | Default `gemini` (primary). |
| `AI_DUAL_MODE` | no | `true` → run both providers for dual scopes. |
| `AI_FAILFAST_TIMEOUT_MS` | no | Default 1000. Failure-detection only. |
| `MEMBER_LOOKUP_VERIFY_URL` | no | BFF base URL for display-layer verification. Unset → DB-vs-API. |
| `MEMBER_LOOKUP_VERIFY_SECRET` | no | Shared secret for the verify BFF. |
| `CRON_SECRET` | for cron | Shared by `/api/cron/*` + cron services. |

## Database

Migration **`030_ai_intelligence_engine.sql`** — tables: `ai_investigations`, `ai_reports`, `ai_findings`, `ai_evidence`, `ai_provider_runs`, `ai_provider_failures`, `ai_comparisons`, `ai_member_verification_results`, `ai_health_snapshots`, `ai_investigation_schedules`. Run in Supabase SQL Editor on deploy.

## Tests

```
npx jest tests/ai-intelligence.test.ts tests/ai-member-verification.test.ts
```

- `tests/ai-intelligence.test.ts` (22 tests): response parsing, prompt building, PII + secret sanitization, comparison engine (agreements/disagreements/verification/human-review), report scoring, **provider failover** (primary healthy, probe-fail fast, investigate-throws, slow generation not truncated, both-fail).
- `tests/ai-member-verification.test.ts` (6 tests): DB==API==display → VERIFIED; intentionally-incorrect display value → CRITICAL DISPLAY MISMATCH; DB-vs-API drift; unavailable-display fallback; identity mismatch; **read-only assertion (no insert/update/delete/upsert)**.

Type-check: `npx tsc --noEmit` is clean for all `src/ai/**` + `src/app/api/ai/**` + the dashboard page.

## Deploy steps

1. Run migration `030_ai_intelligence_engine.sql` in Supabase SQL Editor.
2. Set `GEMINI_API_KEY` + `OPENROUTER_API_KEY` + `OPENROUTER_MODEL` on the web service in Render Dashboard.
3. Set `CRON_SECRET` (same value) on the web service + both cron services.
4. Set `AI_INVESTIGATIONS_ENDPOINT` to `https://<web-service>.onrender.com/api/cron/ai-investigations` on the AI cron service.
5. (Optional) Set `MEMBER_LOOKUP_VERIFY_URL`/`MEMBER_LOOKUP_VERIFY_SECRET` for display-layer member verification.
