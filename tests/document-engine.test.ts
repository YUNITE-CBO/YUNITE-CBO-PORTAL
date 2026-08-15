import { generateDocument, buildEnvelope } from '@/modules/documents';
import type { DocumentData } from '@/modules/documents';

describe('YUNITE Document Engine (pdfmake)', () => {
  test('generates a valid PDF buffer for a financial summary', async () => {
    const envelope = await buildEnvelope({
      kind: 'financial_summary',
      title: 'Financial Summary',
      eyebrow: 'Financial Summary',
      period: { start: new Date('2025-01-01'), end: new Date('2025-12-31'), label: 'FY 2025' },
    });
    const data: DocumentData = {
      kind: 'financial_summary',
      summary: {
        savings: { deposits: 100, withdrawals: 10, balance: 90 },
        contributions: { deposits: 50, withdrawals: 0, balance: 50 },
        welfare: { deposits: 20, disbursements: 5, balance: 15 },
        fines: { posted: 5, paid: 2, balance: 3 },
        loans: { disbursed: 30, repaid: 5, outstanding: 25 },
        totals: { inflow: 175, outflow: 22, net: 153 },
      },
    };
    const result = await generateDocument({ kind: 'financial_summary', envelope, data });
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(1000);
    expect(result.buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
    expect(result.envelope.documentNumber).toMatch(/^YUNITE-FIN-\d{4}-\d{6}$/);
    expect(result.envelope.authHash).toHaveLength(16);
    expect(result.envelope.verifyUrl).toContain(result.envelope.documentNumber);
  }, 30000);

  test('paginates a long transaction ledger (100+ rows) across multiple pages', async () => {
    const envelope = await buildEnvelope({
      kind: 'transaction_report',
      title: 'Transaction Ledger',
      eyebrow: 'Transaction Report',
      period: { start: new Date('2025-01-01'), end: new Date('2025-12-31'), label: 'FY 2025' },
    });
    const transactions = Array.from({ length: 150 }, (_, i) => ({
      transaction_ref: `TXN-${String(i + 1).padStart(4, '0')}`,
      posted_at: new Date(2025, 0, i + 1).toISOString(),
      member_name: `Member ${i + 1}`,
      member_number: `MBR-${String(i + 1).padStart(3, '0')}`,
      transaction_type: 'savings_deposit',
      description: `Deposit ${i + 1}`,
      reference_number: `REF-${i + 1}`,
      amount: 100 + i,
      balance_after: 1000 + i,
      reversed: false,
    }));
    const data: DocumentData = { kind: 'transaction_report', transactions, total: 150 };
    const result = await generateDocument({ kind: 'transaction_report', envelope, data, orientation: 'landscape' });
    expect(result.buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
    expect(result.buffer.length).toBeGreaterThan(5000);
  }, 60000);

  test('generates an AI investigation report PDF from structured findings', async () => {
    const envelope = await buildEnvelope({
      kind: 'ai_investigation_report',
      title: 'AI Intelligence Investigation',
      eyebrow: 'Investigation Report',
      period: { start: new Date('2026-08-15'), end: new Date('2026-08-15'), label: '2026-08-15' },
    });
    const data: DocumentData = {
      kind: 'ai_investigation_report',
      investigation: {
        investigationId: 'inv-123',
        investigationNumber: 'INV-2026-0815-TEST',
        scope: 'full_system',
        status: 'completed',
        aiStatus: 'partial',
        depth: 'deep',
        dualMode: 'single',
        startedAt: '2026-08-15T10:00:00Z',
        finishedAt: '2026-08-15T10:05:00Z',
        overallScore: 100,
        recordsChecked: 250,
        modulesInvestigated: ['database', 'financial', 'api'],
        summary: 'All systems consistent. No critical issues found.',
        counts: { critical: 0, high: 0, medium: 1, low: 2, info: 3, unresolved: 0 },
        findings: [
          {
            finding_code: 'DB-001',
            title: 'Orphan transaction check',
            module: 'database',
            description: 'Checked for transactions without member references.',
            severity: 'info',
            confidence: 'confirmed',
            verification_status: 'verified',
            human_review_required: false,
            sources: ['deterministic'],
            evidence: [],
            location: { module: 'database', database: { table: 'transactions', field: 'member_id' } },
            is_verified: true,
          },
        ],
        recommendations: ['Continue periodic database consistency checks.'],
        rootCauseAnalysis: 'No root causes identified — system is consistent.',
      },
    };
    const result = await generateDocument({ kind: 'ai_investigation_report', envelope, data, orientation: 'landscape' });
    expect(result.buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
    expect(result.buffer.length).toBeGreaterThan(2000);
  }, 30000);

  test('document numbers are unique per kind+year and monotonically prefixed', async () => {
    const env1 = await buildEnvelope({
      kind: 'member_statement',
      title: 'Statement',
      eyebrow: 'Member Statement',
      period: { start: new Date('2026-01-01'), end: new Date('2026-12-31'), label: '2026' },
    });
    expect(env1.documentNumber).toMatch(/^YUNITE-MBR-STM-\d{4}-\d{6}$/);
    // Different kind → different prefix
    const env2 = await buildEnvelope({
      kind: 'loan_report',
      title: 'Loans',
      eyebrow: 'Loan Report',
      period: { start: new Date('2026-01-01'), end: new Date('2026-12-31'), label: '2026' },
    });
    expect(env2.documentNumber).toMatch(/^YUNITE-LOAN-PRF-\d{4}-\d{6}$/);
    expect(env1.documentNumber).not.toBe(env2.documentNumber);
  });

  test('auth hash is deterministic for the same inputs', () => {
    const { computeAuthHash } = require('@/modules/documents');
    const h1 = computeAuthHash('YUNITE-FIN-2026-000001', '2026-08-15T10:00:00Z', 'financial_summary', 'FY2026');
    const h2 = computeAuthHash('YUNITE-FIN-2026-000001', '2026-08-15T10:00:00Z', 'financial_summary', 'FY2026');
    const h3 = computeAuthHash('YUNITE-FIN-2026-000002', '2026-08-15T10:00:00Z', 'financial_summary', 'FY2026');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toHaveLength(16);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
  });
});
