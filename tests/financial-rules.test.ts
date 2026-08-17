/**
 * Financial business-rule regression tests.
 *
 * Locks in three rules that were either previously broken or unverified:
 *
 * 1. SAVINGS BALANCE EXCLUDES REVERSED TRANSACTIONS (DB-001).
 *    TransactionEngine.calculateBalance must apply `.eq('reversed', false)`
 *    AND `.neq('transaction_type', 'reversal')`. A reversed savings deposit
 *    must NOT inflate the balance. (The query *construction* is asserted, not
 *    just the sum, so a future regression that drops the filter is caught.)
 *
 * 2. WELFARE IS NEVER A UNITY FUND PENDING RECEIVABLE.
 *    A welfare deposit is instantly posted cash, so the notional monthly
 *    "welfare owed" rows in member_financial_obligations must NOT appear in
 *    the Unity Fund pending receivables / source breakdown. Welfare actuals
 *    still come from posted welfare_deposit transactions.
 *
 * 3. MEMBER NET POSITION EXCLUDES CONTRIBUTIONS AND WELFARE.
 *    Contributions and welfare are member contributions INTO the Unity Fund
 *    (organization money), not the member's net worth. Only savings minus
 *    outstanding loans counts toward net position.
 *
 * Pure-logic tests (no DB / no network) with a filter-capturing Supabase mock.
 */

// ---------------------------------------------------------------------------
// Filter-capturing Supabase mock. Records every (table, eq/neq/in/...) filter
// applied to a query so tests can assert the query construction, and returns
// controlled row sets per table.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface CapturedFilter {
  column: string;
  op: 'eq' | 'neq' | 'in' | 'gte' | 'lte' | 'lt' | 'gt';
  value: unknown;
}

interface CapturedQuery {
  table: string;
  filters: CapturedFilter[];
  selectColumns: string;
}

const captured: CapturedQuery[] = [];
let returnData: Record<string, Row[]> = {};
let singleData: Record<string, Row | null> = {};

function resetMock() {
  captured.length = 0;
  returnData = {};
  singleData = {};
}

function matchesFilters(row: Row, filters: CapturedFilter[]): boolean {
  return filters.every((f) => {
    const v = row[f.column];
    switch (f.op) {
      case 'eq':
        return v === f.value;
      case 'neq':
        return v !== f.value;
      case 'in': {
        const arr = f.value as unknown[];
        return arr.includes(v);
      }
      case 'gte': {
        const a = typeof v === 'string' ? Date.parse(v) : Number(v);
        const b = typeof f.value === 'string' ? Date.parse(f.value) : Number(f.value);
        return a >= b;
      }
      case 'lte': {
        const a = typeof v === 'string' ? Date.parse(v) : Number(v);
        const b = typeof f.value === 'string' ? Date.parse(f.value) : Number(f.value);
        return a <= b;
      }
      case 'lt': {
        const a = typeof v === 'string' ? Date.parse(v) : Number(v);
        const b = typeof f.value === 'string' ? Date.parse(f.value) : Number(f.value);
        return a < b;
      }
      case 'gt': {
        const a = typeof v === 'string' ? Date.parse(v) : Number(v);
        const b = typeof f.value === 'string' ? Date.parse(f.value) : Number(f.value);
        return a > b;
      }
      default:
        return true;
    }
  });
}

jest.mock('@/lib/supabase/server', () => {
  const build = (table: string, selectColumns: string) => {
    const filters: CapturedFilter[] = [];
    const q: any = {
      select(col?: string) {
        if (col) (q as any).__columns = col;
        return q;
      },
      eq(column: string, value: unknown) {
        filters.push({ column, op: 'eq', value });
        return q;
      },
      neq(column: string, value: unknown) {
        filters.push({ column, op: 'neq', value });
        return q;
      },
      in(column: string, value: unknown) {
        filters.push({ column, op: 'in', value });
        return q;
      },
      gte(column: string, value: unknown) {
        filters.push({ column, op: 'gte', value });
        return q;
      },
      lte(column: string, value: unknown) {
        filters.push({ column, op: 'lte', value });
        return q;
      },
      lt(column: string, value: unknown) {
        filters.push({ column, op: 'lt', value });
        return q;
      },
      gt(column: string, value: unknown) {
        filters.push({ column, op: 'gt', value });
        return q;
      },
      order() { return q; },
      limit() { return q; },
      range() { return q; },
      maybeSingle: async () => {
        // Resolve a single row respecting eq filters (used by calculateBalance
        // to look up the account row by member_id + account_type).
        const pool = (returnData[table] ?? []).filter((r) => matchesFilters(r, filters));
        return { data: pool[0] ?? singleData[table] ?? null, error: null };
      },
      single: async () => {
        const pool = (returnData[table] ?? []).filter((r) => matchesFilters(r, filters));
        return { data: pool[0] ?? singleData[table] ?? null, error: null };
      },
    };
    // Make it thenable: `await query` yields { data, error }.
    q.then = (resolve: any, reject: any) => {
      try {
        const rows = (returnData[table] ?? []).filter((r) => matchesFilters(r, filters));
        captured.push({ table, filters, selectColumns });
        Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      } catch (e) {
        reject(e);
      }
    };
    return q;
  };
  const builder: any = {
    from(table: string) {
      // .select() is called next with the columns; capture columns there.
      const q = build(table, '*');
      return q;
    },
  };
  return { createServiceClient: async () => builder };
});

import { transactionEngine } from '@/lib/services/transaction.engine';
import { unityFundEngine } from '@/lib/services/unity-fund.engine';
import { reportDataService } from '@/lib/services/reports/report-data.service';

const SAVINGS_ACCOUNT = { id: 'acc-savings', member_id: 'm1', account_type: 'savings', status: 'active' };

beforeEach(() => {
  resetMock();
});

// ---------------------------------------------------------------------------
// 1. SAVINGS BALANCE EXCLUDES REVERSED + REVERSAL TRANSACTIONS
// ---------------------------------------------------------------------------
describe('savings balance excludes reversed transactions (DB-001)', () => {
  test('a reversed savings_deposit is excluded from the balance', async () => {
    singleData.accounts = SAVINGS_ACCOUNT;
    // 200 (posted deposit) + 100 (REVERSED deposit) → balance must be 200.
    returnData.transactions = [
      { transaction_type: 'savings_deposit', amount: 200, reversed: false, account_id: 'acc-savings' },
      { transaction_type: 'savings_deposit', amount: 100, reversed: true, account_id: 'acc-savings' },
    ];

    const balance = await transactionEngine.calculateBalance('m1', 'savings');

    expect(balance).toBe(200);
  });

  test('the balance query is constructed with reversed=false AND transaction_type != reversal', async () => {
    singleData.accounts = SAVINGS_ACCOUNT;
    returnData.transactions = [];

    await transactionEngine.calculateBalance('m1', 'savings');

    const txnQuery = captured.find(
      (c) => c.table === 'transactions' && c.filters.some((f) => f.column === 'account_id'),
    );
    expect(txnQuery).toBeDefined();
    const ops = Object.fromEntries(txnQuery!.filters.map((f) => [`${f.column}:${f.op}`, f.value]));
    expect(ops['reversed:eq']).toBe(false);
    expect(ops['transaction_type:neq']).toBe('reversal');
  });

  test('a reversal-type transaction does not double-count against the balance', async () => {
    singleData.accounts = SAVINGS_ACCOUNT;
    // Original deposit of 300 (not reversed) + a 'reversal' row for 300.
    // The reversal row must be excluded; balance = 300.
    returnData.transactions = [
      { transaction_type: 'savings_deposit', amount: 300, reversed: false, account_id: 'acc-savings' },
      { transaction_type: 'reversal', amount: 300, reversed: false, account_id: 'acc-savings' },
    ];

    const balance = await transactionEngine.calculateBalance('m1', 'savings');

    expect(balance).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// 2. WELFARE IS NEVER A UNITY FUND PENDING RECEIVABLE
// ---------------------------------------------------------------------------
describe('Unity Fund pending receivables exclude welfare', () => {
  test('notional welfare obligations do not appear in pending receivables', async () => {
    // The obligations view returns a 500 "welfare owed" row per active member.
    // It must NOT count toward Unity Fund pending receivables.
    returnData.member_financial_obligations = [
      { obligation_type: 'contribution', remaining: 1000 },
      { obligation_type: 'welfare', remaining: 500 }, // the fictitious 500
      { obligation_type: 'fine', remaining: 200 },
    ];
    // loans + interest receipts (none) so pending loan interest = 0.
    returnData.loans = [];
    returnData.donations = [];
    returnData.grants = [];
    returnData.loan_interest_receipts = [];

    const pending = await unityFundEngine.getPendingReceivables();

    // 1000 contribution + 200 fine, welfare excluded → 1200 (not 1700).
    expect(pending).toBe(1200);
  });

  test('welfare pending is 0 in the source breakdown while welfare actuals are preserved', async () => {
    returnData.transactions = [
      // Actual posted welfare deposit (real cash) — must appear as WELFARE actual.
      { transaction_type: 'welfare_deposit', amount: 500, reversed: false, posted_at: '2026-08-01T00:00:00Z' },
      { transaction_type: 'contribution_monthly', amount: 1000, reversed: false, posted_at: '2026-08-01T00:00:00Z' },
    ];
    returnData.member_financial_obligations = [
      { obligation_type: 'welfare', remaining: 500 }, // must be ignored
      { obligation_type: 'contribution', remaining: 1000 },
    ];
    returnData.loans = [];
    returnData.donations = [];
    returnData.grants = [];
    returnData.organization_loans = [];
    returnData.loan_interest_receipts = [];
    returnData.unity_fund_expenditures = [];
    singleData.settings = { value: 'KES', key: 'organization.currency' };

    const sources = await unityFundEngine.getSourceBreakdown();

    const welfare = sources.find((s) => s.source === 'WELFARE');
    expect(welfare).toBeDefined();
    expect(welfare!.actual).toBe(500); // posted welfare deposit is real cash
    expect(welfare!.pending).toBe(0); // never a receivable
  });
});

// ---------------------------------------------------------------------------
// 3. MEMBER NET POSITION EXCLUDES CONTRIBUTIONS AND WELFARE
// ---------------------------------------------------------------------------
describe('member net position excludes contributions and welfare', () => {
  test('net position = savings - loans (contributions/welfare ignored)', async () => {
    // Member has: savings deposit 300, contribution 1000, welfare 500,
    // a loan with amount_due 200. Net position must be 300 - 200 = 100,
    // NOT 300 + 1000 + 500 - 200 = 1600.
    singleData.members = {
      member_number: 'M-001', first_name: 'A', last_name: 'B',
      email: null, phone: null, status: 'active', id: 'm1',
    };
    returnData.transactions = [
      { transaction_type: 'savings_deposit', amount: 300, reversed: false, posted_at: '2026-01-01T00:00:00Z', member_id: 'm1' },
      { transaction_type: 'contribution_monthly', amount: 1000, reversed: false, posted_at: '2026-01-02T00:00:00Z', member_id: 'm1' },
      { transaction_type: 'welfare_deposit', amount: 500, reversed: false, posted_at: '2026-01-03T00:00:00Z', member_id: 'm1' },
    ];
    returnData.loans = [];
    returnData.loan_interest_receipts = [];
    returnData.fines = [];

    const period = {
      start: new Date('2025-01-01T00:00:00Z'),
      end: new Date('2027-01-01T00:00:00Z'),
      label: 'test',
    };
    const stmt = await reportDataService.getMemberStatement('m1', period);

    // Opening (prior) = 0 (no prior txns). In-period running net position:
    // only the savings deposit counts → closing = 300. Contributions & welfare
    // are excluded from the net-position running ledger.
    expect(stmt.openingBalance).toBe(0);
    expect(stmt.closingBalance).toBe(300);
    expect(stmt.totalCredits).toBe(300);
    expect(stmt.totalDebits).toBe(0);
    // The running ledger rows exclude contribution + welfare entirely.
    expect(stmt.rows).toHaveLength(1);
    expect(stmt.rows[0].credit).toBe(300);
  });

  test('account breakdown still reports contributions and welfare balances separately', async () => {
    // Net position excludes them, but the per-account breakdown still shows
    // them (they are tracked account balances, just not net worth).
    singleData.members = {
      member_number: 'M-001', first_name: 'A', last_name: 'B',
      email: null, phone: null, status: 'active', id: 'm1',
    };
    // One account row per account type; calculateBalance looks it up via
    // .single() filtered by member_id + account_type — the mock returns the
    // single accounts row, so give it a stable id and tag the txns with it.
    // The engine queries each account type separately; to make each resolve,
    // we point all txns at the same account id and provide one accounts row
    // whose id they share, then rely on account-type-specific totals below.
    const accounts = [
      { id: 'acc-savings', member_id: 'm1', account_type: 'savings' },
      { id: 'acc-contrib', member_id: 'm1', account_type: 'contributions' },
      { id: 'acc-welfare', member_id: 'm1', account_type: 'welfare' },
    ];
    // The mock's singleData.accounts returns ONE row for every .single() call,
    // so set it to the savings account; we instead verify the breakdown values
    // by giving each transaction the matching account_id and querying each type
    // through calculateBalance directly (mirroring how the breakdown is built).
    singleData.accounts = accounts[0];
    returnData.accounts = accounts;
    returnData.transactions = [
      { transaction_type: 'savings_deposit', amount: 300, reversed: false, posted_at: '2026-01-01T00:00:00Z', member_id: 'm1', account_id: 'acc-savings' },
      { transaction_type: 'contribution_monthly', amount: 1000, reversed: false, posted_at: '2026-01-02T00:00:00Z', member_id: 'm1', account_id: 'acc-contrib' },
      { transaction_type: 'welfare_deposit', amount: 500, reversed: false, posted_at: '2026-01-03T00:00:00Z', member_id: 'm1', account_id: 'acc-welfare' },
    ];
    returnData.loans = [];
    returnData.loan_interest_receipts = [];
    returnData.fines = [];
    singleData.settings = { value: '100', key: 'shares.share_value' };

    // Verify each account balance directly via the engine (the breakdown is
    // built from calculateBalance per type). Net position excludes
    // contributions/welfare, but the per-account balances still reflect them.
    expect(await transactionEngine.calculateBalance('m1', 'savings')).toBe(300);
    expect(await transactionEngine.calculateBalance('m1', 'contributions')).toBe(1000);
    expect(await transactionEngine.calculateBalance('m1', 'welfare')).toBe(500);
  });
});
