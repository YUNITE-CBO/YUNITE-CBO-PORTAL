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
4. Treat PII minimally: do not echo personal data beyond what is necessary to explain a finding.
5. EVERY important finding MUST:
   a. Name the MODULE and SUBMODULE (e.g. "Savings Module → Member Account Balance").
   b. Identify the DATABASE table + field + record where the value lives.
   c. Identify the BACKEND route + service that produces/exposes the value.
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
