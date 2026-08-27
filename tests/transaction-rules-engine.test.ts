/**
 * Transaction Rules Engine — regression tests.
 *
 * Locks in the behavior introduced by migration 049 + the Transaction Rules
 * Engine (src/lib/services/transactions/transaction-rules.ts):
 *
 *  1. The (category, sub-type, ledger) matrix is the single source of truth.
 *     Invalid combinations must be rejected (validateRule) even when the UI is
 *     bypassed.
 *
 *  2. The legacy mapper (deriveFromLegacy / the SQL backfill in migration 049)
 *     maps every legacy transaction_type deterministically so historical rows
 *     enrich — never guess — onto the new dimensions.
 *
 *  3. The financial effect (effectFor) is deterministic per ledger and
 *     independent of the posting amount.
 *
 *  4. Contract guarantees: every rule's default ledger is valid for that rule;
 *     every (category, subType) key is unique; every ledger referenced by a
 *     rule exists in the ledger catalogue (so the DB seed and the code agree).
 *
 * Pure-logic tests (no DB / no network).
 */

import {
  TRANSACTION_RULES,
  LEDGER_CATALOGUE,
  CATEGORIES,
  SUB_TYPE_LABELS,
  validateRule,
  effectFor,
  deriveFromLegacy,
  getRule,
  subTypesForCategory,
  defaultLedgerFor,
  hasSingleLedger,
} from '@/lib/services/transactions/transaction-rules';

describe('TRANSACTION_RULES contract', () => {
  const ledgerCodes = new Set(LEDGER_CATALOGUE.map((l) => l.code));

  it('has a unique (category, subType) key per rule', () => {
    const keys = TRANSACTION_RULES.map((r) => `${r.category}|${r.subType}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('references only ledgers that exist in the catalogue', () => {
    for (const rule of TRANSACTION_RULES) {
      for (const ledger of rule.validLedgers) {
        expect(ledgerCodes.has(ledger)).toBe(true);
      }
    }
  });

  it('default ledger is always one of the valid ledgers', () => {
    for (const rule of TRANSACTION_RULES) {
      expect(rule.validLedgers).toContain(rule.defaultLedger);
    }
  });

  it('catalogues and categories are non-empty and consistent', () => {
    expect(LEDGER_CATALOGUE.length).toBeGreaterThan(0);
    expect(TRANSACTION_RULES.length).toBeGreaterThan(0);
    expect(CATEGORIES.length).toBeGreaterThan(0);
  });
});

describe('validateRule', () => {
  it('accepts a valid (category, subType, ledger) combination', () => {
    const res = validateRule('fee', 'membership_fee', 'MEMBERSHIP_FEES_INCOME');
    expect(res.valid).toBe(true);
  });

  it('rejects a sub-type posted to a wrong ledger', () => {
    const res = validateRule('fee', 'membership_fee', 'MEMBER_SAVINGS');
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.expectedLedger).toBe('MEMBERSHIP_FEES_INCOME');
    }
  });

  it('rejects a sub-type that does not belong to the given category', () => {
    // savings_deposit is a savings sub-type, not a fee.
    const res = validateRule('fee', 'savings_deposit', 'MEMBER_SAVINGS');
    expect(res.valid).toBe(false);
  });

  it('accepts a multi-ledger sub-type on any of its valid ledgers', () => {
    const rule = getRule('loan', 'loan_penalty');
    expect(rule).toBeDefined();
    for (const ledger of rule!.validLedgers) {
      expect(validateRule('loan', 'loan_penalty', ledger).valid).toBe(true);
    }
  });

  it('hasSingleLedger reflects the validLedgers cardinality', () => {
    expect(hasSingleLedger('savings', 'savings_deposit')).toBe(true);
    expect(hasSingleLedger('fine', 'meeting_fine')).toBe(false);
  });
});

describe('effectFor (deterministic financial effect)', () => {
  it('returns null for an unknown ledger', () => {
    expect(effectFor('NOT_A_LEDGER' as never)).toBeNull();
  });

  it('MEMBER_SAVINGS increases the member savings effect only', () => {
    const e = effectFor('MEMBER_SAVINGS')!;
    expect(e.memberSavingsEffect).toBe('increase');
    expect(e.shareBalanceEffect).toBe('no_change');
    expect(e.loanBalanceEffect).toBe('no_change');
    expect(e.organizationIncomeEffect).toBe('no_change');
  });

  it('LOAN_PRINCIPAL_RECEIVABLE increases the loan obligation only', () => {
    const e = effectFor('LOAN_PRINCIPAL_RECEIVABLE')!;
    expect(e.loanBalanceEffect).toBe('increase');
    expect(e.memberSavingsEffect).toBe('no_change');
    expect(e.organizationIncomeEffect).toBe('no_change');
  });

  it('org income ledgers increase organization income, not expense', () => {
    const e = effectFor('MEMBERSHIP_FEES_INCOME')!;
    expect(e.organizationIncomeEffect).toBe('increase');
    expect(e.organizationExpenseEffect).toBe('no_change');
    expect(e.memberSavingsEffect).toBe('no_change');
  });

  it('org expense ledgers increase organization expense, not income', () => {
    const e = effectFor('OPERATING_EXPENSES')!;
    expect(e.organizationExpenseEffect).toBe('increase');
    expect(e.organizationIncomeEffect).toBe('no_change');
  });
});

describe('deriveFromLegacy (backward-compatible mapper)', () => {
  const legacyTypes = [
    'savings_deposit', 'savings_withdrawal', 'savings_adjustment',
    'registration_fee', 'annual_fee', 'contribution_monthly',
    'contribution_special', 'contribution_development', 'welfare_deposit',
    'welfare_disbursement', 'fine_posting', 'fine_payment',
    'loan_disbursement', 'loan_repayment', 'reversal', 'something_new',
  ];

  it('maps every known legacy type and never throws', () => {
    for (const t of legacyTypes) {
      expect(() => deriveFromLegacy(t)).not.toThrow();
    }
  });

  it('maps a legacy deposit to savings/savings_deposit/MEMBER_SAVINGS', () => {
    expect(deriveFromLegacy('savings_deposit')).toEqual({
      category: 'savings',
      subType: 'savings_deposit',
      ledger: 'MEMBER_SAVINGS',
    });
  });

  it('maps annual_fee to fee/membership_fee/MEMBERSHIP_FEES_INCOME', () => {
    expect(deriveFromLegacy('annual_fee')).toEqual({
      category: 'fee',
      subType: 'membership_fee',
      ledger: 'MEMBERSHIP_FEES_INCOME',
    });
  });

  it('maps fine_payment to fine/late_payment_fine/FINANCIAL_FINES_INCOME', () => {
    expect(deriveFromLegacy('fine_payment')).toEqual({
      category: 'fine',
      subType: 'late_payment_fine',
      ledger: 'FINANCIAL_FINES_INCOME',
    });
  });

  it('falls back deterministically for unknown legacy types (never guesses)', () => {
    const d = deriveFromLegacy('totally_unknown');
    expect(d.category).toBe('other');
    expect(d.subType).toBe('other');
  });
});

describe('UI metadata helpers', () => {
  it('subTypesForCategory only returns sub-types of that category', () => {
    const loanSubs = subTypesForCategory('loan');
    expect(loanSubs).toContain('loan_disbursement');
    expect(loanSubs).not.toContain('savings_deposit');
  });

  it('defaultLedgerFor returns a ledger valid for the combination', () => {
    const ledger = defaultLedgerFor('contribution', 'unity_fund_contribution');
    const res = validateRule('contribution', 'unity_fund_contribution', ledger);
    expect(res.valid).toBe(true);
  });

  it('every sub-type label resolves', () => {
    for (const rule of TRANSACTION_RULES) {
      expect(SUB_TYPE_LABELS[rule.subType]).toBeTruthy();
      expect(SUB_TYPE_LABELS[rule.subType]).not.toContain('undefined');
    }
  });
});