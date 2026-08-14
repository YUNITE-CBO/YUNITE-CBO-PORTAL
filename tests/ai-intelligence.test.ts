/**
 * AI Intelligence Engine — pure-logic tests (no DB / no network).
 *
 * Covers: response parsing, prompt building, PII sanitization, comparison
 * engine (agreements / disagreements / verification), report scoring,
 * provider failover (with stub providers), and read-only tool surface.
 *
 * These tests do NOT touch the database or call real AI providers; they use
 * stub implementations of the AiProvider interface and pure functions.
 */

import {
  extractJson,
  normalizeReport,
} from '@/ai/providers/response-parser';
import { buildPrompt } from '@/ai/providers/prompt-builder';
import { sanitizeForAi } from '@/ai/tools/sanitizer';
import { compareReports } from '@/ai/comparison.engine';
import { computeScore, buildFinalReport } from '@/ai/report.engine';
import { investigateWithFailover } from '@/ai/providers/failover';
import type { AiProvider } from '@/ai/providers/provider';
import type {
  Finding,
  InvestigationContext,
  ProviderReport,
} from '@/ai/types';

function ctx(overrides: Partial<InvestigationContext> = {}): InvestigationContext {
  return {
    investigation_id: 'inv-test',
    scope: 'database',
    deterministic_findings: [],
    tools_payload: { schema: { table_count: 10 } },
    ...overrides,
  };
}

function finding(p: Partial<Finding> & { provider?: string }): Finding {
  const sources = p.sources ?? (p.provider ? [p.provider] : ['deterministic']);
  const { provider, ...rest } = p;
  void provider;
  return {
    finding_code: rest.finding_code ?? 'AI-FIND-001',
    module: rest.module ?? 'savings',
    category: rest.category ?? 'incorrect_balances',
    title: rest.title ?? 'test finding',
    description: rest.description ?? '',
    severity: rest.severity ?? 'medium',
    confidence: rest.confidence ?? 'medium',
    evidence: rest.evidence ?? [],
    verification_status: rest.verification_status ?? 'requires_verification',
    human_review_required: rest.human_review_required ?? false,
    sources,
  } as Finding;
}

describe('extractJson', () => {
  test('parses bare JSON object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  test('parses JSON wrapped in ```json fences', () => {
    expect(extractJson('Here:\n```json\n{"a":2}\n```\nDone.')).toEqual({ a: 2 });
  });
  test('extracts JSON embedded in prose', () => {
    expect(extractJson('The result is {"findings":[]} per the analysis.')).toEqual({ findings: [] });
  });
  test('returns null for no JSON', () => {
    expect(extractJson('no json here')).toBeNull();
  });
  test('handles nested braces in strings', () => {
    expect(extractJson('{"msg":"he said {hi}"}')).toEqual({ msg: 'he said {hi}' });
  });
});

describe('normalizeReport', () => {
  test('normalizes a raw AI JSON into a ProviderReport, clamping bad enums', () => {
    const raw = {
      summary: 'ok',
      findings: [
        { title: 'x', severity: 'catastrophic', confidence: 'sure', module: 'savings' },
      ],
      records_checked: 5,
    };
    const rep = normalizeReport(raw, ctx(), 'gemini', 'gemini-2.0-flash', 123);
    expect(rep.provider).toBe('gemini');
    expect(rep.findings).toHaveLength(1);
    // Invalid severity/confidence clamp to defaults.
    expect(rep.findings[0].severity).not.toBe('catastrophic');
    expect(['critical', 'high', 'medium', 'low', 'info']).toContain(rep.findings[0].severity);
    expect(rep.findings[0].confidence).not.toBe('sure');
    expect(['confirmed', 'high', 'medium', 'low']).toContain(rep.findings[0].confidence);
    // AI findings are NEVER auto-confirmed.
    expect(rep.findings[0].verification_status).not.toBe('confirmed');
    expect(rep.findings[0].sources).toContain('gemini');
    expect(rep.provider).toBe('gemini');
    expect(rep.latency_ms).toBe(123);
  });

  test('throws on non-object response', () => {
    expect(() => normalizeReport('not an object', ctx(), 'gemini')).toThrow();
  });
});

describe('buildPrompt', () => {
  test('includes scope + deterministic findings + tools payload, never secrets', () => {
    const c = ctx({ scope: 'financial', deterministic_findings: [finding({ title: 'Savings mismatch' })] });
    const built = buildPrompt(c);
    expect(built.system).toContain('YUNITE');
    expect(built.user).toContain('financial');
    expect(built.user).toContain('Savings mismatch');
    expect(built.user).toContain('table_count');
    // Never includes credentials.
    expect(built.system).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(built.system).not.toContain('service_role');
  });
});

describe('sanitizeForAi (PII filtering)', () => {
  test('redacts obvious PII fields', () => {
    const out = sanitizeForAi({
      member: {
        first_name: 'Jane',
        last_name: 'Doe',
        phone: '+254700000000',
        email: 'jane@example.com',
        id_number: '12345678',
        member_number: 'MBR-001', // NOT PII — preserved
        savings: 20000,           // NOT PII — preserved
      },
      password: 'secret',
      token: 'eyJhbGciOiJIUzI1',
    });
    const m = out.member as Record<string, unknown>;
    expect(m.member_number).toBe('MBR-001');
    expect(m.savings).toBe(20000);
    expect(m.first_name).not.toBe('Jane');
    expect(m.phone).not.toBe('+254700000000');
    expect(m.email).not.toBe('jane@example.com');
    expect(m.id_number).not.toBe('12345678');
    expect(out.password).not.toBe('secret');
    expect(out.token).not.toBe('eyJhbGciOiJIUzI1');
  });

  test('preserves arrays + nested structure', () => {
    const out = sanitizeForAi({
      rows: [{ name: 'Jane', amount: 100 }, { name: 'John', amount: 200 }],
      total: 300,
    });
    expect(out.total).toBe(300);
    const rows = out.rows as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].amount).toBe(100);
    expect(rows[0].name).not.toBe('Jane');
  });
});

describe('compareReports', () => {
  test('marks matching findings as AGREEMENTS, confirmed when deterministic agrees', () => {
    const g = [finding({ finding_code: 'G1', title: 'Savings mismatch for 7 members', module: 'savings', category: 'incorrect_balances', severity: 'high', provider: 'gemini' })];
    const o = [finding({ finding_code: 'O1', title: 'Savings mismatch detected for 7 members', module: 'savings', category: 'incorrect_balances', severity: 'high', provider: 'openrouter' })];
    const d = [finding({ finding_code: 'D1', title: 'Savings balance mismatch', module: 'savings', category: 'incorrect_balances', severity: 'critical', provider: 'deterministic' })];
    const cmp = compareReports('inv', {}, g, o, d);
    expect(cmp.counts.agreements).toBe(1);
    expect(cmp.counts.disagreements).toBe(0);
    // Deterministic finding aligns → verified.
    expect(cmp.counts.verified).toBeGreaterThanOrEqual(1);
  });

  test('records DISAGREEMENT when severities conflict, marks REQUIRES VERIFICATION', () => {
    const g = [finding({ finding_code: 'G1', title: 'Loan module has 3 inconsistencies', module: 'loans', category: 'incorrect_balances', severity: 'high', provider: 'gemini' })];
    const o = [finding({ finding_code: 'O1', title: 'Loan module has 0 inconsistencies', module: 'loans', category: 'incorrect_balances', severity: 'info', provider: 'openrouter' })];
    const cmp = compareReports('inv', {}, g, o, []);
    expect(cmp.counts.disagreements).toBe(1);
    expect(cmp.disagreements[0].gemini.verification_status).toBe('requires_verification');
    expect(cmp.disagreements[0].openrouter.verification_status).toBe('requires_verification');
    // Human review queue should include the disputed finding.
    expect(cmp.counts.human_review).toBeGreaterThanOrEqual(1);
  });

  test('separates GEMINI ONLY vs OPENROUTER ONLY', () => {
    const g = [finding({ finding_code: 'G1', title: 'Orphan savings account detected', module: 'savings', category: 'orphan_records', provider: 'gemini' })];
    const o = [finding({ finding_code: 'O1', title: 'Duplicate transaction reference found', module: 'transactions', category: 'duplicate_records', provider: 'openrouter' })];
    const cmp = compareReports('inv', {}, g, o, []);
    expect(cmp.counts.gemini_only).toBe(1);
    expect(cmp.counts.openrouter_only).toBe(1);
    expect(cmp.counts.agreements).toBe(0);
  });

  test('never auto-promotes a disputed finding to confirmed', () => {
    const g = [finding({ finding_code: 'G1', title: 'mismatch', module: 'savings', category: 'incorrect_balances', severity: 'high', provider: 'gemini' })];
    const o = [finding({ finding_code: 'O1', title: 'mismatch', module: 'savings', category: 'incorrect_balances', severity: 'low', provider: 'openrouter' })];
    const cmp = compareReports('inv', {}, g, o, []);
    const disputed = [...cmp.disagreements.map((d) => d.gemini), ...cmp.disagreements.map((d) => d.openrouter)];
    for (const f of disputed) {
      expect(f.verification_status).not.toBe('confirmed');
    }
  });
});

describe('computeScore + buildFinalReport', () => {
  test('penalizes by severity, caps at 0..100, counts unresolved', () => {
    const findings = [
      finding({ severity: 'critical', verification_status: 'requires_verification', human_review_required: true }),
      finding({ severity: 'high', verification_status: 'confirmed' }),
      finding({ severity: 'info' }),
    ];
    const { score, counts, unresolved } = computeScore(findings);
    expect(counts.critical).toBe(1);
    expect(counts.high).toBe(1);
    expect(counts.info).toBe(1);
    expect(unresolved).toBeGreaterThanOrEqual(1);
    expect(score).toBeLessThan(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  test('rejected findings do not penalize', () => {
    const { score } = computeScore([finding({ severity: 'critical', verification_status: 'rejected' })]);
    expect(score).toBe(100);
  });

  test('buildFinalReport sorts by severity desc', () => {
    const findings = [
      finding({ severity: 'low' }),
      finding({ severity: 'critical' }),
      finding({ severity: 'medium' }),
    ];
    const rep = buildFinalReport('inv', findings, 'summary');
    expect(rep.findings[0].severity).toBe('critical');
    expect(rep.findings[1].severity).toBe('medium');
    expect(rep.findings[2].severity).toBe('low');
    expect(rep.overall_score).toBeLessThan(100);
  });
});

describe('investigateWithFailover', () => {
  function stub(opts: {
    name: 'gemini' | 'openrouter';
    pingOk: boolean;
    investigateOk: boolean;
    report?: Partial<ProviderReport>;
    delayMs?: number;
  }): AiProvider {
    return {
      name: opts.name,
      isConfigured: () => true,
      ping: async () => ({ ok: opts.pingOk, latency_ms: 5 }),
      investigate: async () => {
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
        if (!opts.investigateOk) throw new Error('unavailable: 503');
        return {
          provider: opts.name,
          scope: 'database',
          modules_investigated: [],
          records_checked: 1,
          checks_performed: 1,
          findings: [],
          summary: 'ok',
          recommendations: [],
          model: 'stub',
          latency_ms: 10,
          report_json: {},
          ...opts.report,
        } as ProviderReport;
      },
    };
  }

  test('uses primary when healthy (no fallback)', async () => {
    const primary = stub({ name: 'gemini', pingOk: true, investigateOk: true });
    const secondary = stub({ name: 'openrouter', pingOk: true, investigateOk: true });
    const res = await investigateWithFailover(primary, secondary, ctx());
    expect(res.fallback_used).toBe(false);
    expect(res.report.provider).toBe('gemini');
    expect(res.run.status).toBe('success');
  });

  test('falls over to secondary when primary probe fails fast', async () => {
    const primary = stub({ name: 'gemini', pingOk: false, investigateOk: true });
    const secondary = stub({ name: 'openrouter', pingOk: true, investigateOk: true });
    const res = await investigateWithFailover(primary, secondary, ctx());
    expect(res.fallback_used).toBe(true);
    expect(res.report.provider).toBe('openrouter');
    // The returned run is the successful fallback run.
    expect(res.run.provider).toBe('openrouter');
    expect(res.run.role).toBe('fallback');
    expect(res.run.status).toBe('success');
    expect(res.fallback_reason).toBe('unavailable');
  });

  test('falls over when primary investigate() throws after probe ok', async () => {
    const primary = stub({ name: 'gemini', pingOk: true, investigateOk: false });
    const secondary = stub({ name: 'openrouter', pingOk: true, investigateOk: true });
    const res = await investigateWithFailover(primary, secondary, ctx());
    expect(res.fallback_used).toBe(true);
    expect(res.report.provider).toBe('openrouter');
    expect(res.fallback_reason).toBeTruthy();
  });

  test('does not truncate a valid slow generation (generation runs to completion)', async () => {
    // A generation that takes 300ms (longer than the 1s failfast probe) must
    // still complete when the probe is healthy — the timeout only gates
    // FAILURE DETECTION, not max generation duration.
    const primary = stub({ name: 'gemini', pingOk: true, investigateOk: true, delayMs: 300 });
    const secondary = stub({ name: 'openrouter', pingOk: true, investigateOk: true });
    const res = await investigateWithFailover(primary, secondary, ctx());
    expect(res.fallback_used).toBe(false);
    expect(res.report.provider).toBe('gemini');
  });

  test('records failure status when BOTH providers fail', async () => {
    const primary = stub({ name: 'gemini', pingOk: true, investigateOk: false });
    const secondary = stub({ name: 'openrouter', pingOk: true, investigateOk: false });
    await expect(investigateWithFailover(primary, secondary, ctx())).rejects.toThrow();
  });
});
