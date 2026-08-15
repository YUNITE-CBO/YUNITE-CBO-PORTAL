/**
 * Document Data Integrity tests.
 *
 * Proves that the document pipeline sources financial values from the
 * authoritative ledger/business engines and that the reconciliation engine
 * detects (and never silently fixes) stored-vs-ledger discrepancies.
 *
 * Requirements covered: #9 (no shallow data), #12 (don't trust stored
 * balances blindly), #16 (cross-module reconciliation), #17 (don't hide data
 * errors), #22 (financial standing), #30 (data quality status), #31 (do not
 * fix data silently), #32 (testing — verify documents change when the
 * underlying data changes).
 *
 * The Supabase service client is mocked so these are pure-logic tests with no
 * network/DB dependency.
 */

jest.mock('@/lib/supabase/server', () => {
  // Mutable query builder captured per-test via `setSupabaseMock`.
  let loanData: any[] = [];
  let fineData: any[] = [];
  let repaymentTxns: any[] = [];
  let finePaymentTxns: any[] = [];
  let memberAccounts: any[] = [];
  let memberTxns: any[] = [];
  let memberRow: any = null;
  const chain = (rows: () => any[]) => {
    const c: any = {
      select: () => c,
      eq: () => c,
      in: () => c,
      neq: () => c,
      gte: () => c,
      lte: () => c,
      lt: () => c,
      order: () => c,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      then: undefined,
    };
    // Make it thenable so `await query` yields { data, error }.
    c.then = (resolve: any, reject: any) => {
      try {
        Promise.resolve({ data: rows(), error: null }).then(resolve, reject);
      } catch (e) {
        reject(e);
      }
    };
    return c;
  };
  const builder: any = {
    from(table: string) {
      if (table === 'loans') return chain(() => loanData);
      if (table === 'fines') return chain(() => fineData);
      if (table === 'members') {
        const mc: any = {
          select: () => mc,
          eq: () => mc,
          in: () => mc,
          neq: () => mc,
          gte: () => mc,
          lte: () => mc,
          lt: () => mc,
          order: () => mc,
          maybeSingle: async () => ({ data: memberRow, error: null }),
          single: async () => ({ data: memberRow, error: null }),
        };
        mc.then = (resolve: any, reject: any) => {
          Promise.resolve({ data: memberRow ? [memberRow] : [], error: null }).then(resolve, reject);
        };
        return mc;
      }
      if (table === 'accounts') {
        // calculateBalance looks up the member's account row via .single().
        const ac: any = {
          select: () => ac,
          eq: () => ac,
          in: () => ac,
          neq: () => ac,
          order: () => ac,
          maybeSingle: async () => ({ data: memberAccounts[0] ?? null, error: null }),
          single: async () => ({ data: memberAccounts[0] ?? null, error: null }),
        };
        ac.then = (resolve: any, reject: any) => {
          Promise.resolve({ data: memberAccounts, error: null }).then(resolve, reject);
        };
        return ac;
      }
      if (table === 'transactions') {
        let mode: 'repayment' | 'fine_payment' | 'account' | 'member' = 'repayment';
        const tc: any = {
          select: () => tc,
          eq: (col: string, val: any) => {
            if (col === 'transaction_type' && val === 'loan_repayment') mode = 'repayment';
            if (col === 'transaction_type' && val === 'fine_payment') mode = 'fine_payment';
            if (col === 'account_id') mode = 'account';
            if (col === 'member_id') mode = 'member';
            return tc;
          },
          in: () => tc,
          neq: () => tc,
          gte: () => tc,
          lte: () => tc,
          lt: () => tc,
          order: () => tc,
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: null, error: null }),
        };
        tc.then = (resolve: any, reject: any) => {
          const rows =
            mode === 'fine_payment'
              ? finePaymentTxns
              : mode === 'account' || mode === 'member'
                ? memberTxns
                : repaymentTxns;
          Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        };
        return tc;
      }
      return chain(() => []);
    },
  };
  const mock = {
    __setLoanData: (d: any[]) => { loanData = d; },
    __setFineData: (d: any[]) => { fineData = d; },
    __setRepaymentTxns: (d: any[]) => { repaymentTxns = d; },
    __setFinePaymentTxns: (d: any[]) => { finePaymentTxns = d; },
    __setMemberAccounts: (d: any[]) => { memberAccounts = d; },
    __setMemberTxns: (d: any[]) => { memberTxns = d; },
    __setMemberRow: (d: any) => { memberRow = d; },
  };
  return {
    createServiceClient: async () => builder,
    __supabaseMock: mock,
  };
});

import { reportDataQualityService } from '@/lib/services/reports/report-data-quality.service';
import { transactionEngine } from '@/lib/services/transaction.engine';
import { reportDataService } from '@/lib/services/reports/report-data.service';
import { resolveOrgIdentity, _resetOrgIdentityCache } from '@/modules/documents/styles/yunite-document.styles';
import { ORG_IDENTITY } from '@/lib/services/reports/brand';

// Access the mock's setters.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const supabaseMock = (require('@/lib/supabase/server') as any).__supabaseMock as {
  __setLoanData: (d: any[]) => void;
  __setFineData: (d: any[]) => void;
  __setRepaymentTxns: (d: any[]) => void;
  __setFinePaymentTxns: (d: any[]) => void;
  __setMemberAccounts: (d: any[]) => void;
  __setMemberTxns: (d: any[]) => void;
  __setMemberRow: (d: any) => void;
};

beforeEach(() => {
  _resetOrgIdentityCache();
  supabaseMock.__setLoanData([]);
  supabaseMock.__setFineData([]);
  supabaseMock.__setRepaymentTxns([]);
  supabaseMock.__setFinePaymentTxns([]);
  supabaseMock.__setMemberAccounts([]);
  supabaseMock.__setMemberTxns([]);
  supabaseMock.__setMemberRow(null);
});

describe('org identity — registration number is never invented', () => {
  test('canonical fallback carries no fabricated registration number', () => {
    expect(ORG_IDENTITY.registrationNumber).toBe('');
    expect(ORG_IDENTITY.name).toBe('YUNITE PAMOJA CBO');
  });

  test('resolveOrgIdentity surfaces "not configured" when the setting is absent', async () => {
    const org = await resolveOrgIdentity();
    expect(org.name).toBe('YUNITE PAMOJA CBO');
    // settings unavailable in test env → registration not configured.
    expect(org.registrationNumberConfigured).toBe(false);
    expect(org.registrationNumber).toBe('');
  });
});

describe('loan reconciliation (stored vs ledger)', () => {
  test('detects when stored amount_paid diverges from ledger loan_repayment sum', async () => {
    supabaseMock.__setLoanData([
      { id: 'l1', loan_number: 'LN-001', total_amount: 10000, amount_paid: 8000, amount_due: 2000, status: 'active' },
    ]);
    supabaseMock.__setRepaymentTxns([{ amount: 7000 }]); // ledger says only 7000 repaid
    const check = await reportDataQualityService.reconcileLoansOrg();
    expect(check.status).toBe('requires_reconciliation');
    expect(check.storedValue).toBe(8000);
    expect(check.ledgerValue).toBe(7000);
    expect(check.difference).toBe(1000);
    expect(check.discrepantRecords).toBeGreaterThan(0);
    // Traceability metadata present.
    expect(check.sourceTable).toBe('loans');
    expect(check.calculationSource).toBe('transactions');
  });

  test('verifies when stored amount_paid matches the ledger', async () => {
    supabaseMock.__setLoanData([
      { id: 'l1', loan_number: 'LN-001', total_amount: 10000, amount_paid: 5000, amount_due: 5000, status: 'active' },
    ]);
    supabaseMock.__setRepaymentTxns([{ amount: 5000 }]);
    const check = await reportDataQualityService.reconcileLoansOrg();
    expect(check.status).toBe('verified');
    expect(check.difference).toBe(0);
  });
});

describe('fine reconciliation (stored vs ledger)', () => {
  test('detects when stored amount_paid diverges from ledger fine_payment sum', async () => {
    supabaseMock.__setFineData([
      { id: 'f1', fine_number: 'FN-001', amount: 1000, amount_paid: 600, status: 'pending' },
    ]);
    supabaseMock.__setFinePaymentTxns([{ amount: 400 }]);
    const check = await reportDataQualityService.reconcileFinesOrg();
    expect(check.status).toBe('requires_reconciliation');
    expect(check.storedValue).toBe(600);
    expect(check.ledgerValue).toBe(400);
    expect(check.difference).toBe(200);
  });

  test('verifies when stored matches the ledger', async () => {
    supabaseMock.__setFineData([
      { id: 'f1', fine_number: 'FN-001', amount: 1000, amount_paid: 300, status: 'pending' },
    ]);
    supabaseMock.__setFinePaymentTxns([{ amount: 300 }]);
    const check = await reportDataQualityService.reconcileFinesOrg();
    expect(check.status).toBe('verified');
  });
});

describe('data-quality report aggregates real results', () => {
  test('overall is requires_reconciliation when any domain fails; percent computed, not invented', async () => {
    supabaseMock.__setLoanData([
      { id: 'l1', loan_number: 'LN-001', total_amount: 10000, amount_paid: 8000, amount_due: 2000, status: 'active' },
    ]);
    supabaseMock.__setRepaymentTxns([{ amount: 7000 }]);
    supabaseMock.__setFineData([{ id: 'f1', fine_number: 'FN-001', amount: 1000, amount_paid: 300, status: 'pending' }]);
    supabaseMock.__setFinePaymentTxns([{ amount: 300 }]);
    const report = await reportDataQualityService.reconcileOrganization();
    expect(report.overall).toBe('requires_reconciliation');
    expect(report.requiresReconciliation).toContain('Loan Outstanding Balance');
    expect(report.verified).toContain('Fine Balance');
    // 1 of 2 verified → 50%.
    expect(report.qualityPercent).toBe(50);
    expect(report.summary).toContain('50%');
  });

  test('overall is verified when all domains pass', async () => {
    supabaseMock.__setLoanData([{ id: 'l1', loan_number: 'LN-001', total_amount: 10000, amount_paid: 5000, amount_due: 5000, status: 'active' }]);
    supabaseMock.__setRepaymentTxns([{ amount: 5000 }]);
    supabaseMock.__setFineData([{ id: 'f1', fine_number: 'FN-001', amount: 1000, amount_paid: 300, status: 'pending' }]);
    supabaseMock.__setFinePaymentTxns([{ amount: 300 }]);
    const report = await reportDataQualityService.reconcileOrganization();
    expect(report.overall).toBe('verified');
    expect(report.qualityPercent).toBe(100);
  });
});

describe('member statement breakdown includes shares + uses authoritative engine', () => {
  test('getMemberStatement account breakdown covers all six account types incl. shares', async () => {
    // The statement must list all six account types, including 'shares'.
    supabaseMock.__setMemberRow({
      id: 'm1',
      member_number: 'YUN-001',
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      phone: null,
      status: 'active',
    });
    // One savings deposit of 1000 → savings balance = 1000; with the engine's
    // default share value of 100 (no settings row in mock), shares = floor(1000/100) = 10.
    supabaseMock.__setMemberAccounts([
      { id: 'acc-savings', member_id: 'm1', account_type: 'savings' },
    ]);
    supabaseMock.__setMemberTxns([{ transaction_type: 'savings_deposit', amount: 1000 }]);
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-12-31T23:59:59Z');
    const stmt = await reportDataService.getMemberStatement('m1', { start, end, label: 'FY2026' });
    const types = stmt.accountBreakdown.map((b) => b.account_type);
    expect(types).toEqual(
      expect.arrayContaining(['savings', 'shares', 'contributions', 'welfare', 'fines', 'loans']),
    );
  });

  test('shares balance is derived from savings via calculateAllBalances — never 0 when savings exist', async () => {
    // Regression: previously the breakdown called calculateBalance(memberId,
    // 'shares'), which queries an empty 'shares' account row and returns 0.
    // That produced a false-positive reconciliation discrepancy because the
    // reconciliation engine compares the statement's shares balance against
    // calculateAllBalances().shares (floor(savings / share_value)). The
    // breakdown must now source shares from calculateAllBalances directly.
    supabaseMock.__setMemberRow({
      id: 'm1',
      member_number: 'YUN-001',
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      phone: null,
      status: 'active',
    });
    supabaseMock.__setMemberAccounts([
      { id: 'acc-savings', member_id: 'm1', account_type: 'savings' },
    ]);
    supabaseMock.__setMemberTxns([{ transaction_type: 'savings_deposit', amount: 1000 }]);
    const engineBalances = await transactionEngine.calculateAllBalances('m1');
    const expectedShares = Number((engineBalances as any).shares ?? 0);
    // Sanity: with savings=1000 and the engine's default share value of 100,
    // shares = floor(1000 / 100) = 10 > 0.
    expect(expectedShares).toBeGreaterThan(0);

    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-12-31T23:59:59Z');
    const stmt = await reportDataService.getMemberStatement('m1', { start, end, label: 'FY2026' });
    const sharesEntry = stmt.accountBreakdown.find((b) => b.account_type === 'shares');
    expect(sharesEntry).toBeDefined();
    // The statement's shares balance MUST equal the engine-derived shares,
    // otherwise reconcileMemberStatement flags a false discrepancy.
    expect(sharesEntry!.balance).toBe(expectedShares);

    // And the reconciliation check over that same statement must be clean.
    const dq = await reportDataQualityService.reconcileMemberStatement('m1', {
      closingBalance: stmt.closingBalance,
      accountBreakdown: stmt.accountBreakdown as Array<{ account_type: string; balance: number }>,
    });
    expect(dq.status).toBe('verified');
  });

  test('documents change when underlying data changes — engine recomputes from ledger', async () => {
    // transactionEngine.calculateBalance sums non-reversed txns for an account.
    // With one deposit of 100, balance = 100.
    supabaseMock.__setMemberAccounts([{ id: 'acc-savings', member_id: 'm1', account_type: 'savings' }]);
    supabaseMock.__setMemberTxns([{ transaction_type: 'savings_deposit', amount: 100 }]);
    const before = await transactionEngine.calculateBalance('m1', 'savings' as any);
    expect(before).toBe(100);
    // Add another deposit → balance changes (document would reflect this).
    supabaseMock.__setMemberTxns([
      { transaction_type: 'savings_deposit', amount: 100 },
      { transaction_type: 'savings_deposit', amount: 250 },
    ]);
    const after = await transactionEngine.calculateBalance('m1', 'savings' as any);
    expect(after).toBe(350);
    expect(after).not.toBe(before); // proves live recompute, not a stored snapshot
  });
});
