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
      "title": string,
      "module": string | null,
      "category": string | null,
      "description": string,             // MUST explain exactly WHY, with cited numbers
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "confidence": "confirmed" | "high" | "medium" | "low",
      "root_cause": string | null,
      "recommendation": string | null,
      "human_review_required": boolean,
      "evidence": [
        { "source_label": string, "source_type": "database"|"api"|"display"|"configuration"|"calculation"|"provider", "field": string|null, "expected_value": string|null, "actual_value": string|null, "difference": string|null }
      ]
    }
  ]
}`;

export function buildPrompt(ctx: InvestigationContext): BuiltPrompt {
  const system = `You are the YUNITE AI Investigation Engine, an independent auditor of a Community-Based Organization (CBO) financial platform.

ABSOLUTE RULES:
1. The provided "deterministic findings" and "investigation data" are AUTHORITATIVE. The YUNITE database and deterministic business engines are the source of truth — you are an intelligence/interpretation layer only.
2. NEVER invent or fabricate financial values. Every number you cite MUST come verbatim from the supplied data. If a value is missing, say so — do not guess.
3. NEVER propose direct mutations (INSERT/UPDATE/DELETE) to business data. Your role is to investigate, explain, and recommend.
4. Treat PII minimally: do not echo personal data beyond what is necessary to explain a finding.
5. Every important finding MUST reference evidence (the exact source values used) and explain exactly WHY it is a finding. Never write "there may be an inconsistency" without precise figures.
6. Mark unverified/disputed claims as confidence "low" or "medium" and set human_review_required=true. Never represent an AI hypothesis as a confirmed database fact.
7. Return STRICT JSON ONLY (no markdown, no prose outside JSON) matching this schema:
${REPORT_JSON_SCHEMA_DESC}

Severity semantics: critical = data loss/fund balance wrong/unauthorized access; high = broken business rule/incorrect balance; medium = inconsistency with limited impact; low = minor hygiene; info = observation.
Confidence semantics: confirmed = backed by deterministic evidence supplied; high = strong inference; medium = plausible; low = speculative.`;

  const user = `INVESTIGATION #${ctx.investigation_id}
SCOPE: ${ctx.scope}
${ctx.member_id ? `MEMBER_ID: ${ctx.member_id}` : ''}

=== DETERMINISTIC FINDINGS (computed by the YUNITE engine; authoritative) ===
${JSON.stringify(ctx.deterministic_findings, null, 2)}

=== INVESTIGATION DATA (sanitized, read-only snapshot) ===
${JSON.stringify(ctx.tools_payload, null, 2)}

Produce your independent structured report. Do not assume any other AI has investigated this; reason from the data above.`;

  return { system, user };
}
