/**
 * Regression for AI findings UF-001 / UF-002 (2026-08-24):
 * UnityFundEngine.getReconciliation() compared the engine ledger balance
 * (receipts - expenditures, NET) against the source breakdown sum (inflow
 * sources only, GROSS — there is no expenditure source in the breakdown).
 * The check therefore failed by exactly the expenditure total every time
 * (ledger 50 vs breakdown 100 with 50 of expenditures), which the AI
 * flagged as a phantom "reconciliation mismatch". The breakdown sum is now
 * netted by expenditures before the comparison.
 */

export {};

// Minimal supabase stub that returns per-table fixture rows.
const TABLE_ROWS: Record<string, any[]> = {
  transactions: [
    { transaction_type: 'contribution_monthly', amount: 60, reversed: false, posted_at: '2026-08-01T00:00:00Z' },
  ],
  loan_interest_receipts: [
    { loan_id: 'l1', loan_number: 'LN-1', interest_amount: 40, status: 'received', received_date: '2026-08-01' },
  ],
  donations: [],
  grants: [],
  organization_loans: [],
  unity_fund_expenditures: [
    { amount: 50, status: 'posted', transaction_date: '2026-08-10' },
  ],
  unity_fund_actual_receipts: [
    { amount: 60 },
    { amount: 40 },
  ],
  unity_fund_reconciliation_runs: [],
};

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn().mockResolvedValue({
    from: (table: string) => {
      const rows = TABLE_ROWS[table] ?? [];
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        gte: () => chain,
        lte: () => chain,
        insert: () => Promise.resolve({ error: null }),
        then: (resolve: any) => Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return chain;
    },
  }),
}));

import { unityFundEngine } from '@/lib/services/unity-fund.engine';

describe('UnityFundEngine.getReconciliation (UF-001/UF-002 fix)', () => {
  it('nets the source breakdown sum by expenditures so a healthy fund passes', async () => {
    // Fixture: receipts 100 (60 contributions + 40 interest), expenditures 50.
    // Engine ledger = 50. Old check compared 50 vs 100 (gross) -> failed by -50.
    const result = await unityFundEngine.getReconciliation();

    expect(result.status).toBe('consistent');
    expect(result.ledger_balance).toBe(50);

    const breakdownCheck = result.checks.find((c) => c.label === 'Engine ledger vs source breakdown sum');
    expect(breakdownCheck).toBeDefined();
    expect(breakdownCheck!.expected).toBe(50); // ledger (net)
    expect(breakdownCheck!.actual).toBe(50); // breakdown sum NET of expenditures (100 - 50)
    expect(breakdownCheck!.passed).toBe(true);
    expect(result.discrepancies).toHaveLength(0);
  });

  it('all three checks compare net-to-net', async () => {
    const result = await unityFundEngine.getReconciliation();
    for (const check of result.checks) {
      expect(check.passed).toBe(true);
      expect(check.difference).toBe(0);
    }
  });
});
