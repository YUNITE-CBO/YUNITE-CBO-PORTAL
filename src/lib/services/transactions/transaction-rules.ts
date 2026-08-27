/**
 * YUNITE TRANSACTION RULES ENGINE
 *
 * SINGLE SOURCE OF TRUTH (spec §2, §15, §19): Every financial transaction in
 * YUNITE is described by THREE controlled dimensions:
 *
 *   1. Transaction Category  — WHAT HAPPENED  (Fee / Contribution / Savings /
 *                              Share Purchase / Loan / Fine / Welfare /
 *                              Donation / Grant / Expense / Adjustment /
 *                              Refund / Transfer / Other)
 *   2. Sub-Type              — WHAT SPECIFICALLY HAPPENED (e.g. Membership Fee)
 *   3. Ledger                — WHERE THE MONEY IS ACCOUNTED FOR
 *                              (e.g. Membership Fees Income)
 *
 * The UI, API routes, the backend engine, report data, financial
 * calculations AND the AI tooling all consume THIS module. No module may
 * invent its own combinator rules: the valid (category, sub-type) → ledger
 * combinations below are the ONLY ones the system will accept.
 *
 * Backward compatibility: because the authoritative `transactions` ledger
 * must keep working for reports / Unity Fund / loan & fine engines, every
 * rule also maps to the LEGACY `transaction_type` string + the physical
 * member `account_type` the ledger balances attribute change to. New-managed
 * postings write BOTH the legacy fields and the new controlled columns.
 */

import type { AccountType, TransactionType } from '@/lib/services/transaction.engine';

export type { AccountType, TransactionType };

/** WHAT HAPPENED — top-level transaction category. */
export type TransactionCategory =
  | 'fee'
  | 'contribution'
  | 'savings'
  | 'share_purchase'
  | 'loan'
  | 'fine'
  | 'welfare'
  | 'donation'
  | 'grant'
  | 'expense'
  | 'adjustment'
  | 'refund'
  | 'transfer'
  | 'other'
  | 'reversal';

/** WHAT SPECIFICALLY HAPPENED — scoped per category. */
export type TransactionSubType =
  // Fee
  | 'membership_fee'
  | 'annual_renewal_fee'
  | 'registration_fee'
  | 'replacement_card_fee'
  | 'other_fee'
  // Contribution
  | 'monthly_savings'
  | 'welfare_contribution'
  | 'unity_fund_contribution'
  | 'special_contribution'
  | 'development_contribution'
  | 'other_contribution'
  // Savings
  | 'savings_deposit'
  | 'savings_withdrawal'
  | 'savings_transfer'
  // Share Purchase
  | 'share_purchase'
  | 'share_transfer'
  | 'share_refund'
  // Loan
  | 'loan_disbursement'
  | 'loan_principal_repayment'
  | 'loan_interest_payment'
  | 'loan_penalty'
  | 'loan_processing_fee'
  // Fine
  | 'late_payment_fine'
  | 'meeting_fine'
  | 'disciplinary_fine'
  | 'other_fine'
  // Welfare
  | 'welfare_deposit'
  | 'welfare_disbursement'
  // Donation / Grant / Expense / Other
  | 'donation_received'
  | 'grant_received'
  | 'operating_expense'
  | 'other_expense'
  | 'adjustment'
  | 'refund'
  | 'other';

/** WHERE THE MONEY IS ACCOUNTED FOR — the ledger dimension. */
export type LedgerCode =
  // Member-ledger accounts
  | 'MEMBER_SAVINGS'
  | 'SHARE_CAPITAL'
  | 'WELFARE_FUND'
  | 'UNITY_FUND'
  | 'MEMBER_CONTRIBUTIONS'
  | 'LOAN_PRINCIPAL_RECEIVABLE'
  | 'FINES_OBLIGATION'
  // Organization income / expense ledgers
  | 'MEMBERSHIP_FEES_INCOME'
  | 'RENEWAL_FEES_INCOME'
  | 'REGISTRATION_FEES_INCOME'
  | 'CARD_FEES_INCOME'
  | 'FINANCIAL_FINES_INCOME'
  | 'LOAN_INTEREST_INCOME'
  | 'LOAN_PENALTY_INCOME'
  | 'DONATIONS_INCOME'
  | 'GRANTS_INCOME'
  | 'OPERATING_EXPENSES'
  | 'OTHER_INCOME'
  | 'OTHER_EXPENSES';

/** How a ledger row affects a balance. */
export type BalanceEffectType = 'increase' | 'decrease' | 'no_change';

/** What a ledger row is: money that accrues to the member or to the org. */
export type LedgerNature = 'member_asset' | 'member_obligation' | 'org_income' | 'org_expense' | 'org_asset';

export interface LedgerDefinition {
  code: LedgerCode;
  label: string;
  description: string;
  nature: LedgerNature;
  /** Physical member account the ledger maps onto for balance attribution. */
  accountType?: AccountType;
  /** Legacy transaction_type string written alongside the new columns. */
  legacyTransactionType?: TransactionType;
  /** Direction of the effect on this member's balance (where applicable). */
  memberBalanceEffect?: BalanceEffectType;
  /** Direction of the effect on the organizational / Unity Fund accounts. */
  orgBalanceEffect?: BalanceEffectType;
  /** Human explanation used in the UI "Financial Effect" panel. */
  effectExplanation: string;
}

export interface SubTypeDefinition {
  code: TransactionSubType;
  label: string;
  /** Human prompt e.g. "Which fee?" */
  prompt: string;
  defaultPaymentMethod?: PaymentMethod;
}

export interface CategoryDefinition {
  code: TransactionCategory;
  label: string;
  subTypes: TransactionSubType[];
}

export type PaymentMethod = 'M_PESA' | 'BANK' | 'CASH' | 'CHEQUE' | 'OTHER';

export const PAYMENT_METHODS: ReadonlyArray<PaymentMethod> = [
  'M_PESA',
  'BANK',
  'CASH',
  'CHEQUE',
  'OTHER',
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  M_PESA: 'M-PESA',
  BANK: 'Bank',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  OTHER: 'Other approved method',
};

export interface TransactionRule {
  category: TransactionCategory;
  subType: TransactionSubType;
  label: string;
  validLedgers: LedgerCode[];
  defaultLedger: LedgerCode;
  /** Optional legacy transaction_type to write when this rule posts. */
  legacyTransactionType?: TransactionType;
}

const L = (
  code: LedgerCode,
  label: string,
  description: string,
  nature: LedgerNature,
  opts: Partial<Omit<LedgerDefinition, 'code' | 'label' | 'description' | 'nature' | 'effectExplanation'>> & { effectExplanation: string }
): LedgerDefinition => ({
  code,
  label,
  description,
  nature,
  accountType: opts.accountType,
  legacyTransactionType: opts.legacyTransactionType,
  memberBalanceEffect: opts.memberBalanceEffect,
  orgBalanceEffect: opts.orgBalanceEffect,
  effectExplanation: opts.effectExplanation,
});

/**
 * The one authoritative ledger catalogue. Every ledger that the system can
 * account money to is defined here — nothing else. This is the source of
 * truth for the "Account / Ledger" dropdown, the auto-selection, the
 * financial-effect panel, and the backend validation.
 */
export const LEDGER_CATALOGUE: LedgerDefinition[] = [
  // ---- Member-ledger accounts ------------------------------------------------
  L('MEMBER_SAVINGS', 'Member Savings', 'The member\'s own savings balance.', 'member_asset', {
    accountType: 'savings',
    legacyTransactionType: 'savings_deposit',
    memberBalanceEffect: 'increase',
    effectExplanation: 'Increases the member\'s savings balance.',
  }),
  L('SHARE_CAPITAL', 'Share Capital', 'The member\'s share capital (derived from savings).', 'member_asset', {
    accountType: 'savings',
    legacyTransactionType: 'savings_deposit',
    memberBalanceEffect: 'increase',
    effectExplanation: 'Increases share capital (shares are derived from savings).',
  }),
  L('WELFARE_FUND', 'Welfare Fund', 'The welfare fund reserve.', 'member_asset', {
    accountType: 'welfare',
    legacyTransactionType: 'welfare_deposit',
    memberBalanceEffect: 'increase',
    effectExplanation: 'Increases the member\'s welfare balance.',
  }),
  L('UNITY_FUND', 'Unity Fund', 'Organization-level reserve account.', 'org_asset', {
    accountType: 'contributions',
    legacyTransactionType: 'contribution_monthly',
    memberBalanceEffect: 'increase',
    orgBalanceEffect: 'increase',
    effectExplanation: 'Increases the Unity Fund reserve.',
  }),
  L('MEMBER_CONTRIBUTIONS', 'Member Contributions', 'Member contribution ledger.', 'member_asset', {
    accountType: 'contributions',
    legacyTransactionType: 'contribution_monthly',
    memberBalanceEffect: 'increase',
    effectExplanation: 'Increases the member\'s contribution balance.',
  }),
  L('LOAN_PRINCIPAL_RECEIVABLE', 'Loan Principal Receivable', 'Money the member owes as loan principal.', 'member_obligation', {
    accountType: 'loans',
    legacyTransactionType: 'loan_disbursement',
    memberBalanceEffect: 'increase',
    effectExplanation: 'Increases the member\'s outstanding loan liability.',
  }),
  L('FINES_OBLIGATION', 'Fines & Penalties Obligation', 'Fines the member owes.', 'member_obligation', {
    accountType: 'fines',
    legacyTransactionType: 'fine_posting',
    memberBalanceEffect: 'increase',
    effectExplanation: 'Increases the member\'s fines obligation.',
  }),

  // ---- Organization income / expense ledgers ----------------------------------
  // NOTE on physical account mapping for ORG income ledgers: the authoritative
  // member `accounts` table only has savings/shares/contributions/welfare/
  // fines/loans. There is no `fees` account. Org-income ledgers map their
  // physical balance attribution onto the member's `contributions` account
  // (the org-facing member ledger), consistent with the legacy fee postings
  // that the Unity Fund derives from. The distinct "ledger" column is what
  // keeps fees separate from contributions at the accounting dimension.
  L('MEMBERSHIP_FEES_INCOME', 'Membership Fees Income', 'Income from membership fees.', 'org_income', {
    accountType: 'contributions',
    legacyTransactionType: 'annual_fee',
    orgBalanceEffect: 'increase',
    effectExplanation: 'Increases organizational membership-fee income (Unity Fund).',
  }),
  L('RENEWAL_FEES_INCOME', 'Renewal Fees Income', 'Income from annual renewal fees.', 'org_income', {
    accountType: 'contributions',
    legacyTransactionType: 'annual_fee',
    orgBalanceEffect: 'increase',
    effectExplanation: 'Increases organizational renewal-fee income (Unity Fund).',
  }),
  L('REGISTRATION_FEES_INCOME', 'Registration Fees Income', 'Income from registration fees.', 'org_income', {
    accountType: 'contributions',
    legacyTransactionType: 'registration_fee',
    orgBalanceEffect: 'increase',
    effectExplanation: 'Increases organizational registration-fee income (Unity Fund).',
  }),
  L('CARD_FEES_INCOME', 'Replacement Card Fees Income', 'Income from replacement card fees.', 'org_income', {
    accountType: 'contributions',
    legacyTransactionType: 'annual_fee',
    orgBalanceEffect: 'increase',
    effectExplanation: 'Increases organizational card-fee income (Unity Fund).',
  }),
  L('FINANCIAL_FINES_INCOME', 'Fines & Penalties Income', 'Income collected from fines.', 'org_income', {
    accountType: 'fines',
    legacyTransactionType: 'fine_payment',
    orgBalanceEffect: 'increase',
    effectExplanation: 'Increases organizational fine income (Unity Fund).',
  }),
  L('LOAN_INTEREST_INCOME', 'Loan Interest Income', 'Income from loan interest.', 'org_income', {
    accountType: 'loans',
    legacyTransactionType: 'loan_repayment',
    orgBalanceEffect: 'increase',
    effectExplanation: 'Increases organizational loan-interest income (Unity Fund).',
  }),
  L('LOAN_PENALTY_INCOME', 'Loan Penalty Income', 'Income from loan penalties.', 'org_income', {
    accountType: 'loans',
    legacyTransactionType: 'loan_repayment',
    orgBalanceEffect: 'increase',
    effectExplanation: 'Increases organizational loan-penalty income (Unity Fund).',
  }),
  L('DONATIONS_INCOME', 'Donations Income', 'Income from donations.', 'org_income', {
    accountType: 'contributions',
    legacyTransactionType: 'contribution_special',
    orgBalanceEffect: 'increase',
    effectExplanation: 'Increases organizational donation income (Unity Fund).',
  }),
  L('GRANTS_INCOME', 'Grants Income', 'Income from grants.', 'org_income', {
    accountType: 'contributions',
    legacyTransactionType: 'contribution_special',
    orgBalanceEffect: 'increase',
    effectExplanation: 'Increases organizational grant income (Unity Fund).',
  }),
  L('OPERATING_EXPENSES', 'Operating Expenses', 'Organization operating expenses.', 'org_expense', {
    accountType: 'loans',
    legacyTransactionType: 'savings_withdrawal',
    orgBalanceEffect: 'decrease',
    effectExplanation: 'Decreases organizational cash / Unity Fund (expense).',
  }),
  L('OTHER_INCOME', 'Other Income', 'Other organizational income.', 'org_income', {
    accountType: 'contributions',
    legacyTransactionType: 'contribution_special',
    orgBalanceEffect: 'increase',
    effectExplanation: 'Increases organizational other income (Unity Fund).',
  }),
  L('OTHER_EXPENSES', 'Other Expenses', 'Other organizational expenses.', 'org_expense', {
    accountType: 'loans',
    legacyTransactionType: 'savings_withdrawal',
    orgBalanceEffect: 'decrease',
    effectExplanation: 'Decreases organizational cash / Unity Fund (expense).',
  }),
];

/**
 * The ONE authoritative (category → sub-type → ledgers) rule table.
 * This mirrors the spec's "TRANSACTION RULE ENGINE" matrix and extends it to
 * the full catalog. It is the ONLY place that decides which ledgers a given
 * sub-type may post to.
 */
export const TRANSACTION_RULES: TransactionRule[] = [
  // ---- Fee -----------------------------------------------------------------
  { category: 'fee', subType: 'membership_fee', label: 'Membership Fee', validLedgers: ['MEMBERSHIP_FEES_INCOME'], defaultLedger: 'MEMBERSHIP_FEES_INCOME' },
  { category: 'fee', subType: 'annual_renewal_fee', label: 'Annual Renewal Fee', validLedgers: ['RENEWAL_FEES_INCOME'], defaultLedger: 'RENEWAL_FEES_INCOME' },
  { category: 'fee', subType: 'registration_fee', label: 'Registration Fee', validLedgers: ['REGISTRATION_FEES_INCOME'], defaultLedger: 'REGISTRATION_FEES_INCOME' },
  { category: 'fee', subType: 'replacement_card_fee', label: 'Replacement Card Fee', validLedgers: ['CARD_FEES_INCOME'], defaultLedger: 'CARD_FEES_INCOME' },
  { category: 'fee', subType: 'other_fee', label: 'Other Fee', validLedgers: ['MEMBERSHIP_FEES_INCOME', 'OTHER_INCOME'], defaultLedger: 'MEMBERSHIP_FEES_INCOME' },
  // ---- Contribution ---------------------------------------------------------
  { category: 'contribution', subType: 'monthly_savings', label: 'Monthly Savings', validLedgers: ['MEMBER_SAVINGS', 'MEMBER_CONTRIBUTIONS'], defaultLedger: 'MEMBER_SAVINGS', legacyTransactionType: 'savings_deposit' },
  { category: 'contribution', subType: 'welfare_contribution', label: 'Welfare Contribution', validLedgers: ['WELFARE_FUND'], defaultLedger: 'WELFARE_FUND', legacyTransactionType: 'welfare_deposit' },
  { category: 'contribution', subType: 'unity_fund_contribution', label: 'Unity Fund Contribution', validLedgers: ['UNITY_FUND'], defaultLedger: 'UNITY_FUND', legacyTransactionType: 'contribution_monthly' },
  { category: 'contribution', subType: 'special_contribution', label: 'Special Contribution', validLedgers: ['UNITY_FUND', 'MEMBER_CONTRIBUTIONS'], defaultLedger: 'UNITY_FUND', legacyTransactionType: 'contribution_special' },
  { category: 'contribution', subType: 'development_contribution', label: 'Development Contribution', validLedgers: ['UNITY_FUND', 'MEMBER_CONTRIBUTIONS'], defaultLedger: 'UNITY_FUND', legacyTransactionType: 'contribution_development' },
  { category: 'contribution', subType: 'other_contribution', label: 'Other Contribution', validLedgers: ['UNITY_FUND', 'OTHER_INCOME'], defaultLedger: 'UNITY_FUND' },
  // ---- Savings --------------------------------------------------------------
  { category: 'savings', subType: 'savings_deposit', label: 'Savings Deposit', validLedgers: ['MEMBER_SAVINGS'], defaultLedger: 'MEMBER_SAVINGS', legacyTransactionType: 'savings_deposit' },
  { category: 'savings', subType: 'savings_withdrawal', label: 'Savings Withdrawal', validLedgers: ['MEMBER_SAVINGS'], defaultLedger: 'MEMBER_SAVINGS', legacyTransactionType: 'savings_withdrawal' },
  { category: 'savings', subType: 'savings_transfer', label: 'Savings Transfer', validLedgers: ['MEMBER_SAVINGS', 'SHARE_CAPITAL'], defaultLedger: 'MEMBER_SAVINGS' },
  // ---- Share Purchase -------------------------------------------------------
  { category: 'share_purchase', subType: 'share_purchase', label: 'Share Purchase', validLedgers: ['SHARE_CAPITAL'], defaultLedger: 'SHARE_CAPITAL', legacyTransactionType: 'savings_deposit' },
  { category: 'share_purchase', subType: 'share_transfer', label: 'Share Transfer', validLedgers: ['SHARE_CAPITAL'], defaultLedger: 'SHARE_CAPITAL' },
  { category: 'share_purchase', subType: 'share_refund', label: 'Share Refund', validLedgers: ['SHARE_CAPITAL'], defaultLedger: 'SHARE_CAPITAL', legacyTransactionType: 'savings_withdrawal' },
  // ---- Loan ----------------------------------------------------------------
  {
    category: 'loan', subType: 'loan_disbursement', label: 'Loan Disbursement',
    validLedgers: ['LOAN_PRINCIPAL_RECEIVABLE'], defaultLedger: 'LOAN_PRINCIPAL_RECEIVABLE', legacyTransactionType: 'loan_disbursement',
  },
  {
    category: 'loan', subType: 'loan_principal_repayment', label: 'Loan Principal Repayment',
    validLedgers: ['LOAN_PRINCIPAL_RECEIVABLE'], defaultLedger: 'LOAN_PRINCIPAL_RECEIVABLE', legacyTransactionType: 'loan_repayment',
  },
  {
    category: 'loan', subType: 'loan_interest_payment', label: 'Loan Interest Payment',
    validLedgers: ['LOAN_INTEREST_INCOME'], defaultLedger: 'LOAN_INTEREST_INCOME', legacyTransactionType: 'loan_repayment',
  },
  {
    category: 'loan', subType: 'loan_penalty', label: 'Loan Penalty',
    validLedgers: ['LOAN_PENALTY_INCOME', 'FINANCIAL_FINES_INCOME'], defaultLedger: 'LOAN_PENALTY_INCOME', legacyTransactionType: 'loan_repayment',
  },
  {
    category: 'loan', subType: 'loan_processing_fee', label: 'Loan Processing Fee',
    validLedgers: ['OTHER_INCOME', 'REGISTRATION_FEES_INCOME'], defaultLedger: 'OTHER_INCOME',
  },
  // ---- Fine ----------------------------------------------------------------
  {
    category: 'fine', subType: 'late_payment_fine', label: 'Late Payment Fine',
    validLedgers: ['FINANCIAL_FINES_INCOME', 'FINES_OBLIGATION'], defaultLedger: 'FINANCIAL_FINES_INCOME', legacyTransactionType: 'fine_payment',
  },
  {
    category: 'fine', subType: 'meeting_fine', label: 'Meeting Fine',
    validLedgers: ['FINANCIAL_FINES_INCOME', 'FINES_OBLIGATION'], defaultLedger: 'FINANCIAL_FINES_INCOME', legacyTransactionType: 'fine_payment',
  },
  {
    category: 'fine', subType: 'disciplinary_fine', label: 'Disciplinary Fine',
    validLedgers: ['FINANCIAL_FINES_INCOME', 'FINES_OBLIGATION'], defaultLedger: 'FINANCIAL_FINES_INCOME', legacyTransactionType: 'fine_payment',
  },
  {
    category: 'fine', subType: 'other_fine', label: 'Other Fine',
    validLedgers: ['FINANCIAL_FINES_INCOME', 'FINES_OBLIGATION'], defaultLedger: 'FINANCIAL_FINES_INCOME', legacyTransactionType: 'fine_payment',
  },
  // ---- Welfare --------------------------------------------------------------
  { category: 'welfare', subType: 'welfare_deposit', label: 'Welfare Deposit', validLedgers: ['WELFARE_FUND'], defaultLedger: 'WELFARE_FUND', legacyTransactionType: 'welfare_deposit' },
  { category: 'welfare', subType: 'welfare_disbursement', label: 'Welfare Disbursement', validLedgers: ['WELFARE_FUND'], defaultLedger: 'WELFARE_FUND', legacyTransactionType: 'welfare_disbursement' },
  // ---- Donation / Grant / Expense / Other -----------------------------------
  { category: 'donation', subType: 'donation_received', label: 'Donation Received', validLedgers: ['DONATIONS_INCOME'], defaultLedger: 'DONATIONS_INCOME' },
  { category: 'grant', subType: 'grant_received', label: 'Grant Received', validLedgers: ['GRANTS_INCOME'], defaultLedger: 'GRANTS_INCOME' },
  { category: 'expense', subType: 'operating_expense', label: 'Operating Expense', validLedgers: ['OPERATING_EXPENSES'], defaultLedger: 'OPERATING_EXPENSES' },
  { category: 'expense', subType: 'other_expense', label: 'Other Expense', validLedgers: ['OPERATING_EXPENSES', 'OTHER_EXPENSES'], defaultLedger: 'OPERATING_EXPENSES' },
  { category: 'adjustment', subType: 'adjustment', label: 'Accounting Adjustment', validLedgers: ['MEMBER_SAVINGS', 'OTHER_INCOME', 'OTHER_EXPENSES', 'OPERATING_EXPENSES'], defaultLedger: 'MEMBER_SAVINGS', legacyTransactionType: 'savings_adjustment' },
  { category: 'refund', subType: 'refund', label: 'Refund', validLedgers: ['MEMBER_SAVINGS', 'OPERATING_EXPENSES', 'OTHER_EXPENSES'], defaultLedger: 'MEMBER_SAVINGS', legacyTransactionType: 'savings_withdrawal' },
  { category: 'other', subType: 'other', label: 'Other', validLedgers: ['OTHER_INCOME', 'OTHER_EXPENSES', 'MEMBER_SAVINGS'], defaultLedger: 'OTHER_INCOME' },
  // ---- Reversal (internal, not user-facing) ---------------------------------
  { category: 'reversal', subType: 'adjustment', label: 'Reversal', validLedgers: ['MEMBER_SAVINGS', 'LOAN_PRINCIPAL_RECEIVABLE', 'WELFARE_FUND', 'UNITY_FUND', 'FINANCIAL_FINES_INCOME', 'LOAN_INTEREST_INCOME', 'MEMBERSHIP_FEES_INCOME'], defaultLedger: 'MEMBER_SAVINGS', legacyTransactionType: 'reversal' },
];

export const LEGACY_TYPE_TRANSACTION_TYPE_MAP: Partial<Record<string, TransactionType>> = {
  membership_fee: 'annual_fee',
  annual_renewal_fee: 'annual_fee',
  registration_fee: 'registration_fee',
  replacement_card_fee: 'annual_fee',
  other_fee: 'annual_fee',
  monthly_savings: 'contribution_monthly',
  welfare_contribution: 'welfare_deposit',
  unity_fund_contribution: 'contribution_monthly',
  special_contribution: 'contribution_special',
  development_contribution: 'contribution_development',
  other_contribution: 'contribution_monthly',
  savings_deposit: 'savings_deposit',
  savings_withdrawal: 'savings_withdrawal',
  savings_adjustment: 'savings_adjustment',
  savings_transfer: 'savings_deposit',
  donation_received: 'contribution_special',
  grant_received: 'contribution_special',
  operating_expense: 'savings_withdrawal',
  other_expense: 'savings_withdrawal',
  adjustment: 'savings_adjustment',
  refund: 'savings_withdrawal',
  other: 'contribution_special',
};

// ---------------------------------------------------------------------------
// Lookup helpers — the single access points every consumer uses.
// ---------------------------------------------------------------------------

export const CATEGORIES: ReadonlyArray<TransactionCategory> = [
  'fee',
  'contribution',
  'savings',
  'share_purchase',
  'loan',
  'fine',
  'welfare',
  'donation',
  'grant',
  'expense',
  'adjustment',
  'refund',
  'transfer',
  'other',
];

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  fee: 'Fee',
  contribution: 'Contribution',
  savings: 'Savings',
  share_purchase: 'Share Purchase',
  loan: 'Loan',
  fine: 'Fine',
  welfare: 'Welfare',
  donation: 'Donation',
  grant: 'Grant',
  expense: 'Expense',
  adjustment: 'Adjustment',
  refund: 'Refund',
  transfer: 'Transfer',
  other: 'Other',
  reversal: 'Reversal',
};

export const SUB_TYPE_LABELS: Record<TransactionSubType, string> = {
  membership_fee: 'Membership Fee',
  annual_renewal_fee: 'Annual Renewal Fee',
  registration_fee: 'Registration Fee',
  replacement_card_fee: 'Replacement Card Fee',
  other_fee: 'Other Fee',
  monthly_savings: 'Monthly Savings',
  welfare_contribution: 'Welfare Contribution',
  unity_fund_contribution: 'Unity Fund Contribution',
  special_contribution: 'Special Contribution',
  development_contribution: 'Development Contribution',
  other_contribution: 'Other Contribution',
  savings_deposit: 'Savings Deposit',
  savings_withdrawal: 'Savings Withdrawal',
  savings_transfer: 'Savings Transfer',
  share_purchase: 'Share Purchase',
  share_transfer: 'Share Transfer',
  share_refund: 'Share Refund',
  loan_disbursement: 'Loan Disbursement',
  loan_principal_repayment: 'Loan Principal Repayment',
  loan_interest_payment: 'Loan Interest Payment',
  loan_penalty: 'Loan Penalty',
  loan_processing_fee: 'Loan Processing Fee',
  late_payment_fine: 'Late Payment Fine',
  meeting_fine: 'Meeting Fine',
  disciplinary_fine: 'Disciplinary Fine',
  other_fine: 'Other Fine',
  welfare_deposit: 'Welfare Deposit',
  welfare_disbursement: 'Welfare Disbursement',
  donation_received: 'Donation Received',
  grant_received: 'Grant Received',
  operating_expense: 'Operating Expense',
  other_expense: 'Other Expense',
  adjustment: 'Accounting Adjustment',
  refund: 'Refund',
  other: 'Other',
};

/** Human prompt shown per sub-type (e.g. "Which fee?"). */
const SUB_TYPE_PROMPTS: Partial<Record<TransactionSubType, string>> = {
  membership_fee: 'Which fee?',
  annual_renewal_fee: 'Which renewal fee?',
  registration_fee: 'Which registration fee?',
  replacement_card_fee: 'Which card fee?',
  other_fee: 'Which other fee?',
  monthly_savings: 'What savings contribution?',
  welfare_contribution: 'What welfare contribution?',
  unity_fund_contribution: 'What Unity Fund contribution?',
  late_payment_fine: 'Which fine?',
  meeting_fine: 'Which meeting fine?',
  disciplinary_fine: 'Which disciplinary fine?',
  donation_received: 'What donation was received?',
  grant_received: 'What grant was received?',
  operating_expense: 'What operating expense?',
  loan_disbursement: 'Which loan is being disbursed?',
  loan_principal_repayment: 'Which loan principal payment?',
  loan_interest_payment: 'Which loan interest payment?',
};

const LEDGER_LOOKUP: ReadonlyMap<LedgerCode, LedgerDefinition> = new Map(
  LEDGER_CATALOGUE.map((l) => [l.code, l])
);
const RULE_LOOKUP = new Map<string, TransactionRule>();
TRANSACTION_RULES.forEach((r) => RULE_LOOKUP.set(`${r.category}|${r.subType}`, r));

/** Sub-types valid for a category, in display order. */
export function subTypesForCategory(category: TransactionCategory): TransactionSubType[] {
  return TRANSACTION_RULES.filter((r) => r.category === category).map((r) => r.subType);
}

export function getRule(category: TransactionCategory, subType: TransactionSubType): TransactionRule | undefined {
  return RULE_LOOKUP.get(`${category}|${subType}`);
}

export function getLedger(code: LedgerCode): LedgerDefinition | undefined {
  return LEDGER_LOOKUP.get(code);
}

export function isCategoryCode(value: string): value is TransactionCategory {
  return CATEGORY_LABELS[value as TransactionCategory] !== undefined;
}

export function isSubTypeCode(value: string): value is TransactionSubType {
  return (SUB_TYPE_LABELS as Record<string, string>)[value] !== undefined;
}

export function isLedgerCode(value: string): value is LedgerCode {
  return LEDGER_LOOKUP.has(value as LedgerCode);
}

export function ledgerLabel(code: LedgerCode | string): string {
  return LEDGER_LOOKUP.get(code as LedgerCode)?.label ?? code;
}

export function categoryLabel(category: TransactionCategory | string): string {
  return CATEGORY_LABELS[category as TransactionCategory] ?? category;
}

export function subTypeLabel(subType: TransactionSubType | string): string {
  return (SUB_TYPE_LABELS as Record<string, string>)[subType] ?? subType;
}

export function subTypePrompt(subType: TransactionSubType): string {
  return SUB_TYPE_PROMPTS[subType] ?? 'Which type?';
}

/**
 * Validate a (category, subType, ledger) combination. Returns a rejected
 * message exactly when the combination is invalid. This is the backend /
 * API guard — never trust the UI.
 */
export function validateRule(
  category: TransactionCategory,
  subType: TransactionSubType,
  ledger: LedgerCode
): { valid: true } | { valid: false; expectedLedger: LedgerCode; message: string } {
  const rule = getRule(category, subType);
  if (!rule) {
    return {
      valid: false,
      expectedLedger: ledger,
      message: `Unknown ${categoryLabel(category)} sub-type "${subTypeLabel(subType)}".`,
    };
  }
  if (!rule.validLedgers.includes(ledger)) {
    return {
      valid: false,
      expectedLedger: rule.defaultLedger,
      message:
        `${subTypeLabel(subType)} cannot be posted to ${ledgerLabel(ledger)}. ` +
        `Expected ledger: ${ledgerLabel(rule.defaultLedger)}.`,
    };
  }
  return { valid: true };
}

export interface FinancialEffectSummary {
  memberSavingsEffect: BalanceEffectType;
  shareBalanceEffect: BalanceEffectType;
  loanBalanceEffect: BalanceEffectType;
  welfareBalanceEffect: BalanceEffectType;
  contributionBalanceEffect: BalanceEffectType;
  finesBalanceEffect: BalanceEffectType;
  organizationIncomeEffect: BalanceEffectType;
  organizationExpenseEffect: BalanceEffectType;
  /** Human-readable explanation of what this posting affects. */
  explanation: string;
}

/**
 * Deterministically derive the financial effect of a validated posting from
 * the ledger catalogue — one place, used by UI, API preview, and the audit.
 */
export function effectFor(ledger: LedgerCode): FinancialEffectSummary | null {
  const def = LEDGER_LOOKUP.get(ledger);
  if (!def) return null;
  const none: BalanceEffectType = 'no_change';
  const mb = def.memberBalanceEffect ?? none;
  const org = def.orgBalanceEffect ?? none;

  const memberSavingsEffect = ledger === 'MEMBER_SAVINGS' || ledger === 'SHARE_CAPITAL' ? mb : none;
  const shareBalanceEffect = ledger === 'SHARE_CAPITAL' ? mb : none;
  const loanBalanceEffect = ledger === 'LOAN_PRINCIPAL_RECEIVABLE' ? mb : none;
  const welfareBalanceEffect = ledger === 'WELFARE_FUND' ? mb : none;
  const contributionBalanceEffect = ledger === 'UNITY_FUND' || ledger === 'MEMBER_CONTRIBUTIONS' ? mb : none;
  const finesBalanceEffect = ledger === 'FINES_OBLIGATION' ? mb : none;
  const organizationIncomeEffect = def.nature === 'org_income' ? 'increase' : none;
  const organizationExpenseEffect = def.nature === 'org_expense' ? 'increase' : none;

  return {
    memberSavingsEffect,
    shareBalanceEffect,
    loanBalanceEffect,
    welfareBalanceEffect,
    contributionBalanceEffect,
    finesBalanceEffect,
    organizationIncomeEffect,
    organizationExpenseEffect,
    explanation: def.effectExplanation,
  };
}

// ---------------------------------------------------------------------------
// Backward compatibility mapper — derive the new controlled columns from the
// legacy transaction_type when reading historical rows (and vice versa).
// ---------------------------------------------------------------------------

const LEGACY_TO_SUBTYPE: Record<string, TransactionSubType> = {
  savings_deposit: 'savings_deposit',
  savings_withdrawal: 'savings_withdrawal',
  savings_adjustment: 'adjustment',
  registration_fee: 'registration_fee',
  annual_fee: 'membership_fee',
  contribution_monthly: 'monthly_savings',
  contribution_special: 'special_contribution',
  contribution_development: 'development_contribution',
  welfare_deposit: 'welfare_deposit',
  welfare_disbursement: 'welfare_disbursement',
  fine_posting: 'late_payment_fine',
  fine_payment: 'late_payment_fine',
  loan_disbursement: 'loan_disbursement',
  loan_repayment: 'loan_principal_repayment',
  reversal: 'adjustment',
};

const LEGACY_TO_CATEGORY: Record<string, TransactionCategory> = {
  savings_deposit: 'savings',
  savings_withdrawal: 'savings',
  savings_adjustment: 'adjustment',
  registration_fee: 'fee',
  annual_fee: 'fee',
  contribution_monthly: 'contribution',
  contribution_special: 'contribution',
  contribution_development: 'contribution',
  welfare_deposit: 'welfare',
  welfare_disbursement: 'welfare',
  fine_posting: 'fine',
  fine_payment: 'fine',
  loan_disbursement: 'loan',
  loan_repayment: 'loan',
  reversal: 'reversal',
};

const LEGACY_TO_LEDGER: Record<string, LedgerCode> = {
  savings_deposit: 'MEMBER_SAVINGS',
  savings_withdrawal: 'MEMBER_SAVINGS',
  savings_adjustment: 'MEMBER_SAVINGS',
  registration_fee: 'REGISTRATION_FEES_INCOME',
  annual_fee: 'MEMBERSHIP_FEES_INCOME',
  contribution_monthly: 'MEMBER_CONTRIBUTIONS',
  contribution_special: 'UNITY_FUND',
  contribution_development: 'UNITY_FUND',
  welfare_deposit: 'WELFARE_FUND',
  welfare_disbursement: 'WELFARE_FUND',
  fine_posting: 'FINES_OBLIGATION',
  fine_payment: 'FINANCIAL_FINES_INCOME',
  loan_disbursement: 'LOAN_PRINCIPAL_RECEIVABLE',
  loan_repayment: 'LOAN_PRINCIPAL_RECEIVABLE',
  reversal: 'MEMBER_SAVINGS',
};

interface DerivedDimensions {
  category: TransactionCategory;
  subType: TransactionSubType;
  ledger: LedgerCode;
}

/** Derive new dimensions from a legacy (or already-migrated) transaction row. */
export function deriveFromLegacy(legacyType: string): DerivedDimensions {
  return {
    category: LEGACY_TO_CATEGORY[legacyType] ?? 'other',
    subType: LEGACY_TO_SUBTYPE[legacyType] ?? 'other',
    ledger: LEGACY_TO_LEDGER[legacyType] ?? 'OTHER_INCOME',
  };
}

/** Default ledger for a new posting before the user (or rule) picks one. */
export function defaultLedgerFor(category: TransactionCategory, subType: TransactionSubType): LedgerCode {
  return getRule(category, subType)?.defaultLedger ?? 'OTHER_INCOME';
}

/** Whether the combination automatically resolves to exactly ONE ledger. */
export function hasSingleLedger(category: TransactionCategory, subType: TransactionSubType): boolean {
  const rule = getRule(category, subType);
  return !!rule && rule.validLedgers.length === 1;
}

export const transactionsMeta = {
  version: '2.0.0',
  categories: CATEGORIES.map((c) => ({
    code: c,
    label: CATEGORY_LABELS[c],
    subTypes: subTypesForCategory(c).map((s) => ({
      code: s,
      label: (SUB_TYPE_LABELS as Record<string, string>)[s],
      prompt: SUB_TYPE_PROMPTS[s] ?? 'Which type?',
    })),
  })),
  ledgers: LEDGER_CATALOGUE.map((l) => ({
    code: l.code,
    label: l.label,
    nature: l.nature,
    description: l.description,
  })),
  rules: TRANSACTION_RULES.map((r) => ({
    category: r.category,
    subType: r.subType,
    label: r.label,
    ledgers: r.validLedgers,
    defaultLedger: r.defaultLedger,
  })),
};