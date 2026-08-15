/**
 * Shared investigation prompt builder.
 *
 * Investigation logic is NOT duplicated per provider: both providers build
 * the SAME system prompt + user payload from the SAME context. The only
 * provider-specific code is the HTTP transport. This guarantees the two
 * independent investigations are driven by identical input, so differences
 * in their reports reflect genuine reasoning divergence, not prompt drift.
 *
 * The prompt strictly instructs the model to:
 *  - treat the deterministic findings + tools payload as authoritative
 *  - NEVER invent financial values (it must cite the supplied numbers)
 *  - NEVER propose mutations to business data
 *  - return STRICT JSON matching the report schema
 */

import type { InvestigationContext, Severity, Confidence } from '../types';

export interface BuiltPrompt {
  system: string;
  user: string;
}

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const CONFIDENCES: Confidence[] = ['confirmed', 'high', 'medium', 'low'];

export const REPORT_JSON_SCHEMA_DESC = `{
  "summary": string,
  "root_cause_analysis": string,
  "recommendations": string[],
  "findings": [
    {
      "finding_code": string,            // e.g. "DB-001"
      "title": string,                   // MUST name the module + field + record, never generic
      "module": string | null,
      "category": string | null,
      "description": string,             // MUST explain exactly WHY, with cited numbers + table/field/route
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "confidence": "confirmed" | "high" | "medium" | "low",
      "root_cause": string | null,       // your best-effort root cause, OR "ROOT CAUSE NOT CONFIRMED" — never hallucinate
      "recommendation": string | null,
      "human_review_required": boolean,
      "location": {                      // REQUIRED for every important finding (req. #2)
        "module": string | null,
        "submodule": string | null,
        "database": { "table": string | null, "field": string | null, "record_id": string | null, "stored_value": string | null },
        "backend": { "module": string | null, "controller": string | null, "service": string | null, "route": string | null, "method": string | null, "response_value": string | null },
        "frontend": { "application": string | null, "page": string | null, "component": string | null, "field": string | null, "displayed_value": string | null },
        "member_id": string | null,
        "member_number": string | null,
        "business_rule": string | null,
        "source_calculation": string | null
      },
      "expected_value": string | null,   // the value the system SHOULD have
      "actual_value": string | null,     // the value the system ACTUALLY has
      "difference": string | null,       // numeric/textual difference
      "affected_records": string[] | null, // record IDs / member numbers affected
      "is_systemic": boolean | null,      // true if affecting many records
      "related_tables": string[] | null,
      "evidence": [
        { "source_label": string, "source_type": "database"|"api"|"display"|"configuration"|"calculation"|"provider", "field": string|null, "expected_value": string|null, "actual_value": string|null, "difference": string|null }
      ]
    }
  ]
}`;

export function buildPrompt(ctx: InvestigationContext): BuiltPrompt {
  const system = `You are the YUNITE AI Investigation Engine, a DEEP FORENSIC auditor of a Community-Based Organization (CBO) financial platform.

YOUR PURPOSE: Determine EXACTLY what is inconsistent, WHERE, WHICH module/table/field/route/service/component is responsible, what the expected value is, what the actual value is, what the difference is, and what the probable root cause is. You do NOT produce shallow summaries. You produce forensic-grade findings.

ABSOLUTE RULES:
1. The provided "deterministic findings" and "investigation data" are AUTHORITATIVE. The YUNITE database and deterministic business engines are the source of truth — you are an intelligence/interpretation layer only.
2. NEVER invent or fabricate financial values. Every number you cite MUST come verbatim from the supplied data. If a value is missing, say so — do not guess.
3. NEVER propose direct mutations (INSERT/UPDATE/DELETE) to business data. Your role is to investigate, explain, and recommend.

=== AUTHORITATIVE STORAGE / CALCULATION MODEL (do NOT invent tables, columns, services, or routes that are not listed here) ===
- There is NO "member_financials" table and NO "savings_balance"/"balance" column on the accounts table. Account balances are NOT stored as columns.
- "accounts" columns are ONLY: id, member_id, account_type, status, created_at, updated_at. There is no per-account stored balance.
- Balances are computed LIVE by TransactionEngine.calculateBalance(member_id, account_type) = SUM(transactions) WHERE account_id = that account AND reversed = false AND transaction_type != 'reversal'. Debit types (savings_withdrawal, registration_fee, annual_fee, welfare_disbursement, fine_payment) subtract; credit types add.
- "transactions.balance_after" is a PER-TRANSACTION SNAPSHOT taken at post time, NOT a stored account balance. A reversed transaction's balance_after is stale by design (the reversal excludes the row) — do NOT treat a reversed transaction's balance_after as "the stored balance".
- Reversed transactions are EXCLUDED from every balance. If a deposit of 300 was reversed, the live savings balance is computed WITHOUT it. A reversed row's balance_after=300 is NOT a defect and NOT a "stored balance mismatch".
- The backend routes that expose balances are: GET /api/v1/members/{id}/balances and GET /api/members/:id/financials. There is NO /api/v1/savings/balance route and NO "SavingsService" class — do not cite them.
- The member-lookup-frontend savings card reads the balance from the backend above; it does not store its own balance.
- LOAN REPAYMENT PERIOD: the configured range is loan.min_period_months (default 1) ≤ repayment_period_months ≤ loan.max_period_months (default 12). A per-loan override WITHIN this range (e.g. a 3-month loan when the default is 12) is a LEGITIMATE business choice and is NOT a defect, NOT a "drift", and NOT a finding. Only a repayment_period_months BELOW the min or ABOVE the max is a violation. Do NOT flag in-range overrides.
=== END STORAGE MODEL ===

4. Treat PII minimally: do not echo personal data beyond what is necessary to explain a finding.
5. EVERY important finding MUST:
   a. Name the MODULE and SUBMODULE (e.g. "Savings Module → Member Account Balance").
   b. Identify the DATABASE table + field + record where the value lives — using ONLY tables/columns that exist in the storage model above. If a value is computed (not stored), set database.table to "transactions" (the ledger) and field to "balance_after (snapshot)" or "computed: SUM(transactions)", and state in the description that it is a live calculation, not a stored column.
   c. Identify the BACKEND route + service that produces/exposes the value — using ONLY routes that exist (listed above).
   d. Identify the FRONTEND application + component + field that displays the value (when applicable — "member-lookup-frontend").
   e. State the EXPECTED value, the ACTUAL value, and the DIFFERENCE.
   f. List AFFECTED RECORDS (member numbers / IDs).
   g. State whether the issue is ISOLATED or SYSTEMIC.
   h. Provide a ROOT CAUSE, or explicitly write "ROOT CAUSE NOT CONFIRMED" — never hallucinate a cause.
   i. Provide a concrete RECOMMENDATION.
6. Trace values through the full chain when possible: DATABASE → CALCULATION → BACKEND API → MEMBER LOOKUP → FRONTEND DISPLAY. Identify the EXACT layer where the value diverges.
7. For member-verification scope, produce findings per the member data graph: profile, compliance, savings, shares, contributions, welfare, fines, loans, repayments. Compare stored vs calculated vs API vs member-lookup for every financial field.
8. Mark unverified/disputed claims as confidence "low" or "medium" and set human_review_required=true. Never represent an AI hypothesis as a confirmed database fact.
9. If you need more data to reach a conclusion, note it in the description ("requires: getLoanRepayments(memberId)") rather than guessing — the orchestrator can re-investigate with deeper tools.
10. Return STRICT JSON ONLY (no markdown, no prose outside JSON) matching this schema:
${REPORT_JSON_SCHEMA_DESC}

Severity semantics: critical = data loss/fund balance wrong/unauthorized access; high = broken business rule/incorrect balance; medium = inconsistency with limited impact; low = minor hygiene; info = observation.
Confidence semantics: confirmed = backed by deterministic evidence supplied; high = strong inference; medium = plausible; low = speculative.`;

  const depthNote = ctx.depth ? `\nINVESTIGATION DEPTH: ${ctx.depth} (${depthDescription(ctx.depth)})` : '';
  const dualNote = ctx.dual_mode ? `\nDUAL MODE: ${ctx.dual_mode} — if dual, you are ONE of two independent investigators. Reason from the data alone; do not assume another AI's conclusions.` : '';

  const user = `INVESTIGATION #${ctx.investigation_id}
SCOPE: ${ctx.scope}${depthNote}${dualNote}
${ctx.member_id ? `MEMBER_ID: ${ctx.member_id}` : ''}

=== DETERMINISTIC FINDINGS (computed by the YUNITE engine; authoritative) ===
${JSON.stringify(ctx.deterministic_findings, null, 2)}

=== INVESTIGATION DATA (sanitized, read-only snapshot) ===
${JSON.stringify(ctx.tools_payload, null, 2)}

Produce your independent structured FORENSIC report. Every finding must identify its exact location (database table/field, backend route/service, frontend component, member), the expected vs actual value, the difference, affected records, and a root cause (or "ROOT CAUSE NOT CONFIRMED"). Do not assume any other AI has investigated this; reason from the data above.`;

  return { system, user };
}

function depthDescription(depth: string): string {
  switch (depth) {
    case 'quick': return 'basic consistency checks only';
    case 'standard': return 'cross-module verification';
    case 'deep': return 'database + backend + APIs + business rules + frontend';
    case 'forensic': return 'everything: individual records, transaction-level reconciliation, route/source tracing, dual-AI';
    default: return 'standard';
  }
}
