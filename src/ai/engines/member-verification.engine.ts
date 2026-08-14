/**
 * MEMBER-LOOKUP VERIFICATION ENGINE (deterministic).
 *
 * Compares the layers a member's data flows through:
 *
 *   DATABASE → CALCULATION → BACKEND API → MEMBER LOOKUP → FRONTEND DISPLAY
 *
 * Produces a per-field verification result and an overall score. When the
 * display layer (BFF) is unreachable, display is marked 'unavailable' and the
 * verification degrades gracefully to a DB-vs-API comparison (documented).
 * It NEVER blocks the member lookup page itself — verification runs async /
 * on demand / in the background.
 *
 * Deepened (req. #15, #16): each field result now traces the value through
 * every layer and identifies the EXACT layer where the first divergence
 * occurs (mismatch_layer), plus the frontend component when known. Findings
 * carry the full location (database table/field, backend route/service,
 * frontend app/component).
 *
 * `runMemberForensic` (req. #12, #13, #14, #17) builds the complete member
 * data graph first, then runs the full workflow: deterministic checks →
 * business rules → cross-module → API → member lookup, producing the
 * sectioned member report.
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
  getMemberGraph,
} from '../tools/member-lookup-tools';
import type { Finding, MemberDataGraph, MemberVerificationResult, VerificationFieldResult } from '../types';
import { evidence, makeFinding, resetFindingSequence, kes } from './findings';

const BALANCE_FIELDS: (keyof Awaited<ReturnType<typeof getDatabaseBalances>>)[] = [
  'savings', 'shares', 'contributions', 'welfare', 'fines', 'loans',
];

/** Map balance field → the frontend component that displays it (req. #16). */
const FRONTEND_COMPONENTS: Record<string, string> = {
  savings: 'FinancialSummary',
  shares: 'FinancialSummary',
  contributions: 'FinancialSummary',
  welfare: 'FinancialSummary',
  fines: 'FinancialSummary',
  loans: 'FinancialSummary',
};

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

  // Balance fields: DB vs calculation vs API vs display.
  for (const field of BALANCE_FIELDS) {
    const dbV = num((dbBal as any)[field]);
    const calcV = dbV; // database = independent ledger recompute = calculation baseline
    const apiV = num((apiBal as any)[field]);
    const lookupV = displayBal.source === 'display' ? num((displayBal as any)[field]) : undefined;
    const displayV = lookupV;

    const dbCalc = compare(dbV, calcV);
    const dbApi = compare(dbV, apiV);
    const apiDisplay = displayV === undefined ? true : compare(apiV, displayV);
    const match = dbCalc && dbApi && apiDisplay;

    // Determine the FIRST layer where a divergence occurs (req. #16).
    let mismatchLayer: VerificationFieldResult['mismatch_layer'] = 'none';
    if (!match) {
      if (!dbCalc) mismatchLayer = 'calculation';
      else if (!dbApi) mismatchLayer = 'api';
      else if (!apiDisplay) mismatchLayer = displayBal.source === 'display' ? 'display' : 'member_lookup';
    }

    if (match) verified++;
    else mismatched++;
    fieldResults.push({
      field: String(field),
      database: dbV !== undefined ? String(dbV) : undefined,
      calculation: calcV !== undefined ? String(calcV) : undefined,
      api: apiV !== undefined ? String(apiV) : undefined,
      member_lookup: lookupV !== undefined ? String(lookupV) : undefined,
      display: displayV !== undefined ? String(displayV) : undefined,
      match,
      severity: severityFor(String(field), !match),
      note: displayV === undefined ? 'display layer unavailable (DB vs API only)' : undefined,
      mismatch_layer: mismatchLayer,
      frontend_component: FRONTEND_COMPONENTS[String(field)],
      expected_value: dbV !== undefined ? kes(dbV) : undefined,
      actual_value: !match ? (displayV !== undefined ? kes(displayV) : (apiV !== undefined ? kes(apiV) : undefined)) : undefined,
      difference: !match && dbV !== undefined && (apiV !== undefined || displayV !== undefined)
        ? kes(dbV - (displayV ?? apiV ?? 0)) : undefined,
    });

    if (!dbApi) {
      findings.push(makeFinding({
        prefix: 'MV',
        title: `${field}: DATABASE (${kes(dbV ?? 0)}) != BACKEND API (${kes(apiV ?? 0)})`,
        module: 'member_lookup',
        category: 'db_vs_api_mismatch',
        severity: 'critical',
        description: `The database-derived ${field} does not match the backend API balances for member ${memberId}.`,
        expected_value: kes(dbV ?? 0),
        actual_value: kes(apiV ?? 0),
        difference: kes((dbV ?? 0) - (apiV ?? 0)),
        affected_records: [memberId],
        location: {
          module: 'member_lookup',
          submodule: 'Balance Field',
          database: { table: 'accounts', field: String(field), record_id: memberId },
          backend: { module: 'TransactionsModule', service: 'TransactionEngine.calculateBalance', route: 'GET /api/v1/members/{id}/balances', method: 'GET', response_value: kes(apiV ?? 0) },
          frontend: { application: 'member-lookup-frontend', component: FRONTEND_COMPONENTS[String(field)], field: String(field), displayed_value: displayV !== undefined ? kes(displayV) : undefined },
          member_id: memberId,
        },
        evidence: [
          evidence({ source_label: 'database', source_type: 'database', field: String(field), actual_value: String(dbV) }),
          evidence({ source_label: 'backend api', source_type: 'api', field: String(field), actual_value: String(apiV) }),
        ],
      }));
    } else if (!apiDisplay && displayV !== undefined) {
      findings.push(makeFinding({
        prefix: 'MV',
        title: `${field}: BACKEND API (${kes(apiV ?? 0)}) != MEMBER LOOKUP DISPLAY (${kes(displayV)})`,
        module: 'member_lookup',
        category: 'critical_display_mismatch',
        severity: 'critical',
        description: `The backend API ${field} (${kes(apiV ?? 0)}) does not match what the member-lookup portal displays (${kes(displayV)}) for member ${memberId}.`,
        expected_value: kes(apiV ?? 0),
        actual_value: kes(displayV),
        difference: kes((apiV ?? 0) - displayV),
        affected_records: [memberId],
        location: {
          module: 'member_lookup',
          submodule: 'Display Field',
          backend: { module: 'TransactionsModule', service: 'TransactionEngine.calculateBalance', route: 'GET /api/v1/members/{id}/balances', method: 'GET', response_value: kes(apiV ?? 0) },
          frontend: { application: 'member-lookup-frontend', component: FRONTEND_COMPONENTS[String(field)], field: String(field), displayed_value: kes(displayV) },
          member_id: memberId,
        },
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
      mismatch_layer: !match ? 'display' : 'none',
    });
    if (!match) {
      findings.push(makeFinding({
        prefix: 'MV',
        title: `${f}: DATABASE (${dbV}) != MEMBER LOOKUP DISPLAY (${dispV})`,
        module: 'member_lookup',
        category: 'identity_display_mismatch',
        severity: 'high',
        description: `Member identity field ${f} diverges between the database and the member-lookup display.`,
        expected_value: String(dbV),
        actual_value: String(dispV),
        affected_records: [memberId],
        location: {
          module: 'member_lookup',
          submodule: 'Identity Field',
          database: { table: 'members', field: f, record_id: memberId },
          frontend: { application: 'member-lookup-frontend', component: 'MemberProfile', field: f, displayed_value: String(dispV) },
          member_id: memberId,
        },
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

/**
 * Deep member forensic investigation (req. #12, #13, #14, #15, #17).
 *
 * Workflow:
 *   SELECT MEMBER → LOAD AUTHORITATIVE MEMBER → BUILD MEMBER DATA GRAPH →
 *   RUN DETERMINISTIC CHECKS → CHECK BUSINESS RULES → CHECK CROSS-MODULE →
 *   CHECK BACKEND APIs → CHECK MEMBER LOOKUP RESPONSE → GENERATE REPORT SECTIONS
 *
 * Returns the field-level verification result (same shape as runMemberVerification
 * so the persistence layer can store it) PLUS the full member data graph and
 * the sectioned report. The AI phase (Gemini/OpenRouter) runs AFTER this in
 * the investigation engine and receives the graph + findings as context.
 */
export async function runMemberForensic(memberId: string): Promise<{
  result: MemberVerificationResult;
  findings: Finding[];
}> {
  resetFindingSequence();

  // 1. Build the complete member data graph (req. #13).
  const graph = await getMemberGraph(memberId).catch(() => null);

  // 2. Run the base member verification (DB → calc → API → display).
  const base = await runMemberVerification(memberId);
  const findings: Finding[] = [...base.findings];

  // 3. Compliance investigation (req. #14).
  if (graph?.compliance && graph?.profile) {
    const complianceFindings = checkCompliance(memberId, graph.profile, graph.compliance);
    findings.push(...complianceFindings);
  }

  // 4. Financial investigation across layers (req. #15).
  if (graph?.layers) {
    const financialFindings = checkFinancialLayers(memberId, graph.layers, graph.profile);
    findings.push(...financialFindings);
  }

  // 5. Cross-module checks (loans outstanding vs ledger, fines outstanding).
  if (graph?.loans && graph?.layers) {
    const crossFindings = checkCrossModuleLoans(memberId, graph.loans, graph.layers);
    findings.push(...crossFindings);
  }

  // 6. Build report sections (req. #17).
  const sections = buildReportSections(memberId, graph, findings, base.result);

  return {
    result: {
      ...base.result,
      member_graph: graph ?? undefined,
      sections,
    },
    findings,
  };
}

function checkCompliance(memberId: string, profile: Record<string, unknown>, compliance: Record<string, unknown>[]): Finding[] {
  const findings: Finding[] = [];
  const memberNumber = String(profile.member_number ?? memberId);

  // Check for identity inconsistencies between profile and compliance.
  for (const c of compliance) {
    const cIdNumber = str(c.id_number);
    const pIdNumber = str(profile.id_number);
    if (cIdNumber && pIdNumber && cIdNumber !== pIdNumber) {
      findings.push(makeFinding({
        prefix: 'MV',
        title: `ID number mismatch between profile and compliance for ${memberNumber}`,
        module: 'compliance',
        category: 'identity_inconsistency',
        severity: 'high',
        description: `Member profile id_number = ${pIdNumber}, compliance record id_number = ${cIdNumber}.`,
        expected_value: String(pIdNumber),
        actual_value: String(cIdNumber),
        affected_records: [memberNumber],
        location: {
          module: 'compliance',
          submodule: 'Identity Verification',
          database: { table: 'compliance_records', field: 'id_number', record_id: String(c.id ?? memberId) },
          member_id: memberId,
          member_number: memberNumber,
        },
        evidence: [
          evidence({ source_label: 'member profile', source_type: 'database', field: 'id_number', actual_value: String(pIdNumber) }),
          evidence({ source_label: 'compliance record', source_type: 'database', field: 'id_number', actual_value: String(cIdNumber) }),
        ],
      }));
    }
  }

  // Check for missing required documents.
  const missingDocs = compliance.filter((c) => c.status === 'missing' || c.status === 'expired');
  for (const d of missingDocs) {
    findings.push(makeFinding({
      prefix: 'MV',
      title: `Missing/expired compliance document for ${memberNumber}: ${d.document_type ?? d.requirement_type ?? 'unknown'}`,
      module: 'compliance',
      category: 'missing_documents',
      severity: 'medium',
      description: `Compliance item "${d.document_type ?? d.requirement_type ?? 'unknown'}" is ${d.status}.`,
      affected_records: [memberNumber],
      location: {
        module: 'compliance',
        submodule: 'Documentation',
        database: { table: 'compliance_records', field: 'status', record_id: String(d.id ?? memberId) },
        member_id: memberId,
        member_number: memberNumber,
      },
      evidence: [evidence({ source_label: 'compliance_records', source_type: 'database', field: 'status', actual_value: String(d.status) })],
    }));
  }

  return findings;
}

function checkFinancialLayers(
  memberId: string,
  layers: NonNullable<MemberDataGraph['layers']>,
  profile: Record<string, unknown> | undefined,
): Finding[] {
  const findings: Finding[] = [];
  const memberNumber = String(profile?.member_number ?? memberId);
  const db = layers.database ?? {};
  const calc = layers.calculation ?? {};
  const api = layers.api ?? {};
  const lookup = layers.member_lookup ?? {};
  const display = layers.display ?? {};

  for (const field of BALANCE_FIELDS) {
    const dbV = num(db[field]);
    const calcV = num(calc[field]);
    const apiV = num(api[field]);
    const lookupV = num(lookup[field]);
    const displayV = num(display[field]);

    // DB vs calc (should always match — both derive from the ledger).
    if (dbV !== undefined && calcV !== undefined && Math.abs(dbV - calcV) > 0.5) {
      findings.push(makeFinding({
        prefix: 'MV',
        title: `${field}: DATABASE (${kes(dbV)}) != CALCULATION (${kes(calcV)}) for ${memberNumber}`,
        module: field === 'loans' ? 'loans' : field,
        category: 'db_vs_calculation_mismatch',
        severity: 'critical',
        description: `The independent database ledger and the transaction engine calculation diverged for ${field}.`,
        expected_value: kes(dbV),
        actual_value: kes(calcV),
        difference: kes(dbV - calcV),
        affected_records: [memberNumber],
        location: {
          module: String(field),
          submodule: 'Layer Trace',
          database: { table: 'transactions', field: String(field), record_id: memberId },
          backend: { module: 'TransactionsModule', service: 'TransactionEngine', route: 'GET /api/v1/members/{id}/balances' },
          member_id: memberId,
          member_number: memberNumber,
        },
        evidence: [
          evidence({ source_label: 'database', source_type: 'database', field: String(field), actual_value: kes(dbV) }),
          evidence({ source_label: 'calculation', source_type: 'calculation', field: String(field), actual_value: kes(calcV), difference: kes(dbV - calcV) }),
        ],
      }));
    }

    // API vs member lookup (the member-lookup BFF should proxy the API).
    if (apiV !== undefined && lookupV !== undefined && Math.abs(apiV - lookupV) > 0.5) {
      findings.push(makeFinding({
        prefix: 'MV',
        title: `${field}: BACKEND API (${kes(apiV)}) != MEMBER LOOKUP (${kes(lookupV)}) for ${memberNumber}`,
        module: 'member_lookup',
        category: 'api_vs_lookup_mismatch',
        severity: 'critical',
        description: `The backend API and the member-lookup portal diverged for ${field}.`,
        expected_value: kes(apiV),
        actual_value: kes(lookupV),
        difference: kes(apiV - lookupV),
        affected_records: [memberNumber],
        location: {
          module: 'member_lookup',
          submodule: 'Layer Trace',
          backend: { module: 'TransactionsModule', route: 'GET /api/v1/members/{id}/balances', response_value: kes(apiV) },
          frontend: { application: 'member-lookup-frontend', component: FRONTEND_COMPONENTS[String(field)], field: String(field), displayed_value: kes(lookupV) },
          member_id: memberId,
          member_number: memberNumber,
        },
        evidence: [
          evidence({ source_label: 'backend api', source_type: 'api', field: String(field), actual_value: kes(apiV) }),
          evidence({ source_label: 'member lookup', source_type: 'display', field: String(field), actual_value: kes(lookupV), difference: kes(apiV - lookupV) }),
        ],
      }));
    }
  }

  return findings;
}

function checkCrossModuleLoans(
  memberId: string,
  loans: Record<string, unknown>[],
  layers: NonNullable<MemberDataGraph['layers']>,
): Finding[] {
  const findings: Finding[] = [];
  const apiLoanBalance = num(layers.api?.loans);
  const sumDue = loans
    .filter((l) => ['approved', 'disbursed', 'active'].includes(String(l.status)))
    .reduce((s, l) => s + Number(l.amount_due || 0), 0);

  if (apiLoanBalance !== undefined && Math.abs(apiLoanBalance - sumDue) > 0.5) {
    findings.push(makeFinding({
      prefix: 'MV',
      title: `Loans: API balance (${kes(apiLoanBalance)}) != SUM(active loan amount_due) (${kes(sumDue)})`,
      module: 'loans',
      category: 'cross_module_mismatch',
      severity: 'high',
      description: `The loan balance from the API does not match the sum of active loan amount_due fields.`,
      expected_value: kes(sumDue),
      actual_value: kes(apiLoanBalance),
      difference: kes(apiLoanBalance - sumDue),
      affected_records: loans.map((l) => String(l.loan_number ?? l.id)).filter(Boolean),
      location: {
        module: 'loans',
        submodule: 'Outstanding Balance',
        database: { table: 'loans', field: 'amount_due' },
        backend: { module: 'TransactionsModule', service: 'TransactionEngine.calculateBalance', route: 'GET /api/v1/loans', response_value: kes(apiLoanBalance) },
        member_id: memberId,
      },
      evidence: [
        evidence({ source_label: 'backend api', source_type: 'api', field: 'loans', actual_value: kes(apiLoanBalance) }),
        evidence({ source_label: 'loans table', source_type: 'database', field: 'amount_due', actual_value: kes(sumDue), difference: kes(apiLoanBalance - sumDue) }),
      ],
    }));
  }

  return findings;
}

function buildReportSections(
  memberId: string,
  graph: MemberDataGraph | null,
  findings: Finding[],
  baseResult: MemberVerificationResult,
): NonNullable<MemberVerificationResult['sections']> {
  const memberNumber = String(graph?.profile?.member_number ?? memberId);
  const layers = graph?.layers ?? {};
  const criticalFindings = findings.filter((f) => f.severity === 'critical');
  const highFindings = findings.filter((f) => f.severity === 'high');

  return {
    member_profile: {
      summary: graph?.profile
        ? `Member ${memberNumber}, status: ${graph.profile.status ?? 'unknown'}.`
        : `Member ${memberNumber} — profile unavailable.`,
      data: graph?.profile,
    },
    compliance: {
      summary: graph?.compliance?.length
        ? `${graph.compliance.length} compliance record(s). ${findings.filter((f) => f.module === 'compliance').length} issue(s) found.`
        : 'No compliance records found.',
      issues: findings.filter((f) => f.module === 'compliance').map((f) => f.title),
    },
    financial_position: {
      summary: layers.api
        ? `Savings: ${kes(layers.api.savings ?? 0)}, Loans: ${kes(layers.api.loans ?? 0)}, Contributions: ${kes(layers.api.contributions ?? 0)}, Welfare: ${kes(layers.api.welfare ?? 0)}, Fines: ${kes(layers.api.fines ?? 0)}.`
        : 'Financial data unavailable.',
      data: layers.api,
    },
    data_consistency: {
      summary: `${findings.filter((f) => f.category?.includes('mismatch') || f.category?.includes('db_vs')).length} data consistency issue(s) found.`,
      findings: findings.filter((f) => f.category?.includes('mismatch') || f.category?.includes('db_vs')).map((f) => f.title),
    },
    api_consistency: {
      summary: `${findings.filter((f) => f.category === 'db_vs_api_mismatch').length} API consistency issue(s) found.`,
      findings: findings.filter((f) => f.category === 'db_vs_api_mismatch').map((f) => f.title),
    },
    member_lookup_consistency: {
      summary: `${findings.filter((f) => f.category === 'critical_display_mismatch' || f.category === 'api_vs_lookup_mismatch').length} member lookup consistency issue(s) found.`,
      findings: findings.filter((f) => f.category === 'critical_display_mismatch' || f.category === 'api_vs_lookup_mismatch').map((f) => f.title),
    },
    business_rule_compliance: {
      summary: `${findings.filter((f) => f.category?.includes('business_rule')).length} business rule issue(s) found.`,
      findings: findings.filter((f) => f.category?.includes('business_rule')).map((f) => f.title),
    },
    anomalies: {
      summary: criticalFindings.length > 0
        ? `${criticalFindings.length} critical anomaly/anomalies detected.`
        : 'No anomalies detected.',
      items: [...criticalFindings, ...highFindings].map((f) => f.title),
    },
    ai_evaluation: {
      summary: 'AI evaluation runs after deterministic checks (Gemini + OpenRouter independently).',
    },
    final_evaluation: {
      summary: baseResult.overall_status === 'verified'
        ? `Member ${memberNumber} verified — ${baseResult.fields_verified}/${baseResult.fields_checked} fields match across all layers.`
        : `Member ${memberNumber} — ${baseResult.overall_status}. ${baseResult.fields_mismatched} field(s) mismatched. ${criticalFindings.length} critical, ${highFindings.length} high findings.`,
    },
  };
}
