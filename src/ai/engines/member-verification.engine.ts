/**
 * MEMBER-LOOKUP VERIFICATION ENGINE (deterministic).
 *
 * Compares the three layers a member's data flows through:
 *
 *   DATABASE  →  BACKEND API  →  MEMBER LOOKUP DISPLAY
 *
 * Produces a per-field verification result and an overall score. When the
 * display layer (BFF) is unreachable, display is marked 'unavailable' and the
 * verification degrades gracefully to a DB-vs-API comparison (documented).
 * It NEVER blocks the member lookup page itself — verification runs async /
 * on demand / in the background.
 *
 * Per-field comparison uses normalized values (numbers compared to 2dp, text
 * trimmed) so trivial formatting differences are not flagged.
 */

import {
  getDatabaseBalances,
  getApiBalances,
  getDisplayBalances,
  getMemberIdentity,
  getDisplayIdentity,
} from '../tools/member-lookup-tools';
import type { Finding } from '../types';
import type {
  MemberVerificationResult,
  VerificationFieldResult,
} from '../types';
import { evidence, makeFinding, resetFindingSequence } from './findings';

const BALANCE_FIELDS: (keyof Awaited<ReturnType<typeof getDatabaseBalances>>)[] = [
  'savings', 'shares', 'contributions', 'welfare', 'fines', 'loans',
];

function num(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  return String(v).trim();
}

function compare(a: number | string | undefined, b: number | string | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  return String(a) === String(b);
}

function severityFor(field: string, mismatch: boolean): VerificationFieldResult['severity'] {
  if (!mismatch) return 'info';
  // Financial fields are critical if they mismatch.
  return BALANCE_FIELDS.includes(field as any) ? 'critical' : 'medium';
}

export async function runMemberVerification(memberId: string): Promise<{
  result: MemberVerificationResult;
  findings: Finding[];
}> {
  resetFindingSequence();
  const [dbBal, apiBal, displayBal, dbIdentity, displayIdentity] = await Promise.all([
    getDatabaseBalances(memberId),
    getApiBalances(memberId),
    getDisplayBalances(memberId),
    getMemberIdentity(memberId),
    getDisplayIdentity(memberId),
  ]);

  const fieldResults: VerificationFieldResult[] = [];
  const findings: Finding[] = [];
  let verified = 0;
  let mismatched = 0;

  // Balance fields: DB vs API vs display.
  for (const field of BALANCE_FIELDS) {
    const dbV = num((dbBal as any)[field]);
    const apiV = num((apiBal as any)[field]);
    const displayV = displayBal.source === 'display' ? num((displayBal as any)[field]) : undefined;
    const dbApi = compare(dbV, apiV);
    const apiDisplay = displayV === undefined ? true : compare(apiV, displayV);
    const match = dbApi && apiDisplay;
    if (match) verified++;
    else mismatched++;
    fieldResults.push({
      field: String(field),
      database: dbV !== undefined ? String(dbV) : undefined,
      api: apiV !== undefined ? String(apiV) : undefined,
      display: displayV !== undefined ? String(displayV) : undefined,
      match,
      severity: severityFor(String(field), !match),
      note: displayV === undefined ? 'display layer unavailable (DB vs API only)' : undefined,
    });

    if (!dbApi) {
      findings.push(makeFinding({
        prefix: 'MV',
        title: `${field}: DATABASE (${dbV}) != BACKEND API (${apiV})`,
        module: 'member_verification',
        category: 'db_vs_api_mismatch',
        severity: 'critical',
        description: `The database-derived ${field} does not match the backend API balances for member ${memberId}.`,
        evidence: [
          evidence({ source_label: 'database', source_type: 'database', field: String(field), actual_value: String(dbV) }),
          evidence({ source_label: 'backend api', source_type: 'api', field: String(field), actual_value: String(apiV) }),
        ],
      }));
    } else if (!apiDisplay && displayV !== undefined) {
      findings.push(makeFinding({
        prefix: 'MV',
        title: `${field}: BACKEND API (${apiV}) != MEMBER LOOKUP DISPLAY (${displayV})`,
        module: 'member_verification',
        category: 'critical_display_mismatch',
        severity: 'critical',
        description: `The backend API ${field} (${apiV}) does not match what the member-lookup portal displays (${displayV}) for member ${memberId}.`,
        evidence: [
          evidence({ source_label: 'backend api', source_type: 'api', field: String(field), actual_value: String(apiV) }),
          evidence({ source_label: 'member lookup display', source_type: 'display', field: String(field), actual_value: String(displayV) }),
        ],
      }));
    }
  }

  // Identity fields (non-PII display fields): status, member_number.
  const identityFields = ['status', 'member_number'];
  for (const f of identityFields) {
    const dbV = str((dbIdentity as any)?.[f]);
    const dispV = displayIdentity ? str((displayIdentity as any)?.[f]) : undefined;
    const match = dispV === undefined ? true : compare(dbV, dispV);
    if (match) verified++;
    else mismatched++;
    fieldResults.push({
      field: f,
      database: dbV,
      display: dispV,
      match,
      severity: severityFor(f, !match),
      note: dispV === undefined ? 'display identity unavailable' : undefined,
    });
    if (!match) {
      findings.push(makeFinding({
        prefix: 'MV',
        title: `${f}: DATABASE (${dbV}) != MEMBER LOOKUP DISPLAY (${dispV})`,
        module: 'member_verification',
        category: 'identity_display_mismatch',
        severity: 'high',
        description: `Member identity field ${f} diverges between the database and the member-lookup display.`,
        evidence: [
          evidence({ source_label: 'database', source_type: 'database', field: f, actual_value: String(dbV) }),
          evidence({ source_label: 'member lookup display', source_type: 'display', field: f, actual_value: String(dispV) }),
        ],
      }));
    }
  }

  const fieldsChecked = fieldResults.length;
  const verificationScore = fieldsChecked ? Math.round((verified / fieldsChecked) * 100) : 0;
  let overallStatus: MemberVerificationResult['overall_status'] = 'verified';
  if (mismatched > 0) {
    const hasCritical = fieldResults.some((r) => r.severity === 'critical' && !r.match);
    overallStatus = hasCritical ? 'critical_mismatch' : 'warning';
  }
  if (displayBal.source === 'unavailable' && fieldsChecked === 0) {
    overallStatus = 'unavailable';
  }

  return {
    result: {
      member_id: memberId,
      member_number: dbIdentity?.member_number ?? undefined,
      overall_status: overallStatus,
      verification_score: verificationScore,
      fields_checked: fieldsChecked,
      fields_verified: verified,
      fields_mismatched: mismatched,
      field_results: fieldResults,
    },
    findings,
  };
}
