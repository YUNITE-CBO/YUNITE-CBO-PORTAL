/**
 * AI Deep Forensic Engine — tests for the upgraded finding model, member
 * search/graph, module health map, depth levels, dual mode, and the
 * persistence column fixes (req. #1-#32).
 *
 * Pure-logic tests (no DB / no network) using stub implementations where
 * needed. The deterministic engines' real comparison logic is exercised.
 */

import {
  extractJson,
  normalizeReport,
} from '@/ai/providers/response-parser';
import { buildPrompt } from '@/ai/providers/prompt-builder';
import { compareReports } from '@/ai/comparison.engine';
import { computeScore } from '@/ai/report.engine';
import { buildModuleHealthMap, MODULE_HEALTH_ORDER } from '@/ai/engines/module-health.engine';
import { makeFinding, kes, evidence } from '@/ai/engines/findings';
import type {
  Finding,
  FindingLocation,
  InvestigationContext,
} from '@/ai/types';

function ctx(overrides: Partial<InvestigationContext> = {}): InvestigationContext {
  return {
    investigation_id: 'inv-test',
    scope: 'financial',
    deterministic_findings: [],
    tools_payload: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// req. #1, #2, #3 — deep finding model with location
// ---------------------------------------------------------------------------

describe('Deep finding model (req. #1, #2, #3)', () => {
  test('makeFinding accepts and preserves a full location + expected/actual/difference', () => {
    const location: FindingLocation = {
      module: 'savings',
      submodule: 'Member Account Balance',
      database: { table: 'member_accounts', field: 'savings_balance', record_id: 'MBR-00123', stored_value: 'KES 20000' },
      backend: { module: 'SavingsModule', service: 'SavingsService', route: 'GET /api/members/:id/financials', method: 'GET', response_value: 'KES 20000' },
      frontend: { application: 'member-lookup-frontend', component: 'FinancialSummary', field: 'savingsBalance', displayed_value: 'KES 20000' },
      member_id: 'uuid-00123',
      member_number: 'MBR-00123',
      business_rule: 'balance = SUM(savings transactions)',
      source_calculation: 'SUM(transactions) WHERE account_type=savings',
    };
    const f = makeFinding({
      prefix: 'FIN',
      title: 'Savings balance mismatch for MBR-00123',
      module: 'savings',
      category: 'incorrect_balances',
      severity: 'critical',
      description: 'Stored balance KES 20,000 != ledger KES 18,500.',
      root_cause: 'Stored member balance is not synchronized with the transaction-derived savings.',
      recommendation: 'Review the account balance update path.',
      expected_value: 'KES 18500',
      actual_value: 'KES 20000',
      difference: 'KES 1500',
      affected_records: ['MBR-00123'],
      is_systemic: false,
      related_tables: ['transactions', 'member_accounts'],
      location,
      evidence: [evidence({ source_label: 'ledger', source_type: 'calculation', actual_value: 'KES 18500' })],
    });
    expect(f.location).toEqual(location);
    expect(f.expected_value).toBe('KES 18500');
    expect(f.actual_value).toBe('KES 20000');
    expect(f.difference).toBe('KES 1500');
    expect(f.affected_records).toEqual(['MBR-00123']);
    expect(f.is_systemic).toBe(false);
    expect(f.related_tables).toEqual(['transactions', 'member_accounts']);
    expect(f.is_verified).toBe(true);
    expect(f.verification_status).toBe('confirmed');
  });

  test('kes() formats amounts with KES prefix and 2dp', () => {
    expect(kes(20000)).toBe('KES 20000');
    expect(kes(18500.5)).toBe('KES 18500.5');
    expect(kes(1500.125)).toBe('KES 1500.13');
  });

  test('makeFinding defaults is_systemic from affected_records count', () => {
    const f1 = makeFinding({ prefix: 'X', title: 't', description: 'd', severity: 'high', evidence: [], affected_records: ['a'] });
    expect(f1.is_systemic).toBe(false);
    const f2 = makeFinding({ prefix: 'X', title: 't', description: 'd', severity: 'high', evidence: [], affected_records: ['a', 'b', 'c'] });
    expect(f2.is_systemic).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// req. #2 — AI response parser extracts location from model output
// ---------------------------------------------------------------------------

describe('response-parser extracts deep location (req. #2)', () => {
  test('normalizeReport maps AI location + expected/actual/difference into typed Finding', () => {
    const raw = {
      summary: 'forensic',
      findings: [{
        finding_code: 'AI-001',
        title: 'Savings mismatch MBR-00123',
        module: 'savings',
        severity: 'critical',
        confidence: 'high',
        root_cause: 'desync',
        expected_value: 'KES 18500',
        actual_value: 'KES 20000',
        difference: 'KES 1500',
        affected_records: ['MBR-00123'],
        is_systemic: false,
        related_tables: ['transactions'],
        location: {
          module: 'savings',
          submodule: 'Balance',
          database: { table: 'member_accounts', field: 'savings_balance', record_id: 'MBR-00123' },
          backend: { route: 'GET /api/members/:id/financials', method: 'GET' },
          frontend: { application: 'member-lookup-frontend', component: 'FinancialSummary', field: 'savings' },
          member_number: 'MBR-00123',
        },
        evidence: [],
      }],
    };
    const rep = normalizeReport(raw, ctx(), 'gemini', 'gemini-2.0-flash', 100);
    const f = rep.findings[0];
    expect(f.location?.database?.table).toBe('member_accounts');
    expect(f.location?.database?.field).toBe('savings_balance');
    expect(f.location?.backend?.route).toBe('GET /api/members/:id/financials');
    expect(f.location?.frontend?.component).toBe('FinancialSummary');
    expect(f.location?.member_number).toBe('MBR-00123');
    expect(f.expected_value).toBe('KES 18500');
    expect(f.actual_value).toBe('KES 20000');
    expect(f.difference).toBe('KES 1500');
    expect(f.affected_records).toEqual(['MBR-00123']);
    expect(f.is_systemic).toBe(false);
    // AI findings are never auto-confirmed.
    expect(f.verification_status).not.toBe('confirmed');
  });

  test('normalizeReport handles missing location gracefully', () => {
    const raw = { summary: 'ok', findings: [{ title: 'x', severity: 'medium' }] };
    const rep = normalizeReport(raw, ctx(), 'gemini');
    expect(rep.findings[0].location).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// req. #8, #25 — prompt includes depth + dual mode
// ---------------------------------------------------------------------------

describe('prompt builder includes depth + dual mode (req. #8, #25)', () => {
  test('prompt surfaces depth and dual mode notes', () => {
    const c = ctx({ depth: 'forensic', dual_mode: 'dual' });
    const built = buildPrompt(c);
    expect(built.user).toContain('forensic');
    expect(built.user).toContain('DUAL MODE: dual');
    expect(built.system).toContain('DEEP FORENSIC');
    expect(built.system).toContain('ROOT CAUSE NOT CONFIRMED');
  });

  test('prompt demands location + expected/actual/difference in schema', () => {
    const built = buildPrompt(ctx());
    expect(built.system).toContain('location');
    expect(built.system).toContain('expected_value');
    expect(built.system).toContain('actual_value');
    expect(built.system).toContain('difference');
    expect(built.system).toContain('affected_records');
  });
});

// ---------------------------------------------------------------------------
// req. #10 — comparison engine matches by deep location
// ---------------------------------------------------------------------------

describe('comparison engine deep location matching (req. #10)', () => {
  function deepFinding(opts: Partial<Finding> & { provider: string }): Finding {
    const sources = [opts.provider];
    const { provider, ...rest } = opts;
    void provider;
    return {
      finding_code: rest.finding_code ?? 'F1',
      title: rest.title ?? 'test',
      module: rest.module ?? 'savings',
      category: rest.category ?? 'incorrect_balances',
      description: rest.description ?? '',
      severity: rest.severity ?? 'high',
      confidence: rest.confidence ?? 'high',
      evidence: rest.evidence ?? [],
      verification_status: rest.verification_status ?? 'unverified',
      human_review_required: false,
      sources,
      ...rest,
    } as Finding;
  }

  test('two findings at the SAME deep location match as AGREEMENT even with different titles', () => {
    const loc: FindingLocation = {
      module: 'savings',
      database: { table: 'member_accounts', field: 'savings_balance' },
      backend: { route: 'GET /api/members/:id/financials' },
      frontend: { component: 'FinancialSummary' },
      member_number: 'MBR-00123',
    };
    const g = [deepFinding({ provider: 'gemini', title: 'Savings balance mismatch', severity: 'high', location: loc, difference: 'KES 1500' })];
    const o = [deepFinding({ provider: 'openrouter', title: 'Stored account balance not synchronized with ledger', severity: 'high', location: loc, difference: 'KES 1500' })];
    const cmp = compareReports('inv', {}, g, o, []);
    expect(cmp.counts.agreements).toBe(1);
    expect(cmp.counts.disagreements).toBe(0);
  });

  test('same location but different difference values → DISAGREEMENT with reason', () => {
    const loc: FindingLocation = {
      module: 'savings',
      database: { table: 'member_accounts', field: 'savings_balance' },
      member_number: 'MBR-00123',
    };
    const g = [deepFinding({ provider: 'gemini', title: 'mismatch', severity: 'high', location: loc, difference: 'KES 1500', root_cause: 'desync' })];
    const o = [deepFinding({ provider: 'openrouter', title: 'mismatch', severity: 'high', location: loc, difference: 'KES 2000', root_cause: 'missing txn' })];
    const cmp = compareReports('inv', {}, g, o, []);
    expect(cmp.counts.disagreements).toBe(1);
    expect(cmp.disagreements[0].reason).toContain('Value difference');
    expect(cmp.disagreements[0].reason).toContain('Root cause');
  });

  test('findings at DIFFERENT locations are gemini-only / openrouter-only', () => {
    const g = [deepFinding({ provider: 'gemini', title: 'savings issue', location: { module: 'savings', database: { table: 'member_accounts', field: 'savings_balance' } } })];
    const o = [deepFinding({ provider: 'openrouter', title: 'loans issue', location: { module: 'loans', database: { table: 'loans', field: 'amount_due' } } })];
    const cmp = compareReports('inv', {}, g, o, []);
    expect(cmp.counts.gemini_only).toBe(1);
    expect(cmp.counts.openrouter_only).toBe(1);
    expect(cmp.counts.agreements).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// req. #20, #21 — module health map
// ---------------------------------------------------------------------------

describe('module health map (req. #20, #21)', () => {
  test('builds a health entry for every canonical module, even healthy ones', () => {
    const map = buildModuleHealthMap([]);
    expect(map.length).toBeGreaterThanOrEqual(MODULE_HEALTH_ORDER.length);
    const modules = map.map((m) => m.module);
    expect(modules).toContain('savings');
    expect(modules).toContain('loans');
    expect(modules).toContain('member_lookup');
    // All empty → all healthy.
    expect(map.every((m) => m.status === 'healthy')).toBe(true);
  });

  test('a critical finding makes the module inconsistent', () => {
    const findings: Finding[] = [
      { finding_code: 'FIN-001', title: 'savings mismatch', module: 'savings', category: 'incorrect_balances', description: '', severity: 'critical', confidence: 'confirmed', verification_status: 'confirmed', human_review_required: false, sources: ['deterministic'], evidence: [], location: { member_number: 'MBR-001' }, affected_records: ['MBR-001'] },
    ];
    const map = buildModuleHealthMap(findings);
    const savings = map.find((m) => m.module === 'savings');
    expect(savings?.status).toBe('inconsistent');
    expect(savings?.critical_count).toBe(1);
    expect(savings?.affected_members).toBe(1);
  });

  test('only medium/low findings → warning', () => {
    const findings: Finding[] = [
      { finding_code: 'DB-001', title: 'stale snapshot', module: 'savings', category: 'stale', description: '', severity: 'medium', confidence: 'confirmed', verification_status: 'confirmed', human_review_required: false, sources: ['deterministic'], evidence: [] },
    ];
    const map = buildModuleHealthMap(findings);
    const savings = map.find((m) => m.module === 'savings');
    expect(savings?.status).toBe('warning');
  });

  test('aggregates total_difference from numeric difference fields', () => {
    const findings: Finding[] = [
      { finding_code: 'F1', title: 'a', module: 'savings', category: 'x', description: '', severity: 'critical', confidence: 'confirmed', verification_status: 'confirmed', human_review_required: false, sources: ['deterministic'], evidence: [], difference: 'KES 1500' },
      { finding_code: 'F2', title: 'b', module: 'savings', category: 'x', description: '', severity: 'high', confidence: 'confirmed', verification_status: 'confirmed', human_review_required: false, sources: ['deterministic'], evidence: [], difference: 'KES 3000' },
    ];
    const map = buildModuleHealthMap(findings);
    const savings = map.find((m) => m.module === 'savings');
    expect(savings?.total_difference).toBe('KES 4500');
  });

  test('sorts inconsistent first, then warning, then healthy', () => {
    const findings: Finding[] = [
      { finding_code: 'F1', title: 'crit', module: 'loans', category: 'x', description: '', severity: 'critical', confidence: 'confirmed', verification_status: 'confirmed', human_review_required: false, sources: ['deterministic'], evidence: [] },
      { finding_code: 'F2', title: 'med', module: 'fines', category: 'x', description: '', severity: 'medium', confidence: 'confirmed', verification_status: 'confirmed', human_review_required: false, sources: ['deterministic'], evidence: [] },
    ];
    const map = buildModuleHealthMap(findings);
    const firstInconsistent = map.findIndex((m) => m.status === 'inconsistent');
    const firstWarning = map.findIndex((m) => m.status === 'warning');
    const firstHealthy = map.findIndex((m) => m.status === 'healthy');
    expect(firstInconsistent).toBeLessThan(firstWarning);
    expect(firstWarning).toBeLessThan(firstHealthy);
  });

  test('normalizes module aliases (accounts→savings, member_verification→member_lookup)', () => {
    const findings: Finding[] = [
      { finding_code: 'F1', title: 'a', module: 'accounts', category: 'x', description: '', severity: 'critical', confidence: 'confirmed', verification_status: 'confirmed', human_review_required: false, sources: ['deterministic'], evidence: [] },
    ];
    const map = buildModuleHealthMap(findings);
    // 'accounts' should be normalized to 'savings'
    const savings = map.find((m) => m.module === 'savings');
    expect(savings?.findings_count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// req. #32 — acceptance criteria: a finding can carry the full forensic detail
// ---------------------------------------------------------------------------

describe('acceptance criteria — full forensic finding (req. #32)', () => {
  test('a finding can express the FIN-0047-level detail from the spec', () => {
    const f = makeFinding({
      prefix: 'FIN',
      title: 'Savings Module → Member Account Balance mismatch',
      module: 'savings',
      category: 'incorrect_balances',
      severity: 'critical',
      description: 'Stored member balance is not synchronized with transaction-derived savings.',
      root_cause: 'Stored account balance is not synchronized with the transaction-derived savings.',
      recommendation: 'Review the account balance update path and identify the transaction that caused the KES 1,500 divergence.',
      expected_value: 'KES 18500',
      actual_value: 'KES 20000',
      difference: 'KES 1500',
      affected_records: ['MBR-00123'],
      related_tables: ['savings_transactions'],
      location: {
        module: 'Savings',
        submodule: 'Member Account Balance',
        database: { table: 'member_accounts', field: 'savings_balance', record_id: 'MBR-00123', stored_value: 'KES 20000' },
        backend: { module: 'SavingsModule', service: 'SavingsService', route: 'GET /api/members/:id/financials', method: 'GET', response_value: 'KES 20000' },
        frontend: { application: 'member-lookup-frontend', component: 'FinancialSummary', field: 'Savings Balance', displayed_value: 'KES 20000' },
        member_id: 'uuid-00123',
        member_number: 'MBR-00123',
      },
      evidence: [
        evidence({ source_label: 'database records', source_type: 'database', actual_value: 'KES 20000' }),
        evidence({ source_label: 'API response', source_type: 'api', actual_value: 'KES 20000' }),
        evidence({ source_label: 'calculation', source_type: 'calculation', actual_value: 'KES 18500' }),
        evidence({ source_label: 'member lookup response', source_type: 'display', actual_value: 'KES 20000' }),
      ],
    });

    // The finding carries every field the acceptance criteria demands.
    expect(f.location?.database?.table).toBe('member_accounts');
    expect(f.location?.database?.field).toBe('savings_balance');
    expect(f.location?.backend?.route).toBe('GET /api/members/:id/financials');
    expect(f.location?.frontend?.component).toBe('FinancialSummary');
    expect(f.location?.member_number).toBe('MBR-00123');
    expect(f.expected_value).toBe('KES 18500');
    expect(f.actual_value).toBe('KES 20000');
    expect(f.difference).toBe('KES 1500');
    expect(f.root_cause).toContain('not synchronized');
    expect(f.evidence).toHaveLength(4);
    expect(f.is_verified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// req. #19 — score never replaces evidence
// ---------------------------------------------------------------------------

describe('report depth — score accompanies evidence (req. #19)', () => {
  test('a high score is still accompanied by detailed findings', () => {
    const findings: Finding[] = [
      makeFinding({ prefix: 'FIN', title: 'minor stale snapshot', module: 'savings', category: 'stale', severity: 'low', description: 'd', evidence: [], location: { module: 'savings', database: { table: 'transactions', field: 'balance_after' } } }),
    ];
    const { score, counts } = computeScore(findings);
    // Low severity → high score, but the finding still has full location detail.
    expect(score).toBe(98);
    expect(counts.low).toBe(1);
    expect(findings[0].location?.database?.field).toBe('balance_after');
  });
});
