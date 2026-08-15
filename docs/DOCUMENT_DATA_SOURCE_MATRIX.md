# YUNITE Document Data Source Matrix

> Internal traceability matrix: every financial value in a generated YUNITE
> document mapped to its authoritative source (module → service → DB table →
> field → calculation engine → validation status). This is the contract that
> prevents the document engine from ever presenting a stale, duplicated, or
> invented value as verified truth.
>
> **Governing principle:** _Never prioritize document appearance over data
> correctness._ The database + YUNITE business engines are the source of
> truth; the document engine is a presentation layer.

## Architecture

```
YUNITE DATABASE  →  AUTHORITATIVE BUSINESS ENGINES  →  DATA RECONCILIATION ENGINE
   →  REPORT DATA SERVICE  →  DOCUMENT TEMPLATE ENGINE (pdfmake)  →  OFFICIAL PDF
```

- **No second database.** The document engine never stores financial data. It
  consumes authoritative output at generation time.
- **No Chromium / Puppeteer.** PDFs are produced by `pdfmake` (browser-free).
- **Reconciliation never mutates data.** Discrepancies are reported, not
  silently corrected. Only authorized financial-correction workflows modify
  records.

## Authoritative engines (single source of truth)

| Domain | Engine | Authoritative method | Ledger source |
|---|---|---|---|
| Savings balance | `TransactionEngine` | `calculateBalance(memberId,'savings')` | `transactions` (reversed=false, type≠reversal) |
| Shares | `TransactionEngine` | `calculateAllBalances().shares` = `floor(savings / shares.share_value)` | derived from savings ledger + setting |
| Contributions balance | `TransactionEngine` | `calculateBalance(memberId,'contributions')` | `transactions` |
| Welfare balance | `TransactionEngine` | `calculateBalance(memberId,'welfare')` | `transactions` |
| Fines balance | `TransactionEngine` | `calculateBalance(memberId,'fines')` | `transactions` |
| Loan outstanding | `loans` table (stored) | `amount_due = total_amount − amount_paid`, maintained by `loan.service.ts` repay/reverse | reconciled vs `transactions` (loan_repayment) |

## Document field → source matrix

### Member Statement (`report-data.service.getMemberStatement`)

| Document field | Source service | Source method | DB table | DB field | Calculation | Status |
|---|---|---|---|---|---|---|
| Member profile | report-data | getMemberStatement | members | member_number, first_name, last_name, email, phone, status | direct read | AUTHORITATIVE |
| Opening balance | report-data | deriveMemberBalance (prior txns before period start) | transactions | transaction_type, amount | SUM credits − SUM debits (reversed=false) | AUTHORITATIVE (ledger) |
| Transaction rows | report-data | getMemberStatement | transactions | transaction_ref, posted_at, amount, description, reference_number | per-txn credit/debit | AUTHORITATIVE |
| Running balance | report-data | opening + Σcredits − Σdebits | computed | — | per-row running | AUTHORITATIVE |
| Closing balance | report-data | opening + totalCredits − totalDebits | computed | — | derived from ledger | AUTHORITATIVE |
| Account breakdown | report-data → **TransactionEngine** | `calculateBalance` per type | transactions | amount | SUM per account_type | AUTHORITATIVE |
| Shares (breakdown) | report-data → TransactionEngine | `calculateBalance(memberId,'shares')` | transactions | amount | ledger-derived | AUTHORITATIVE ✅ (was missing — fixed) |

> Reconciliation: `reportDataQualityService.reconcileMemberStatement` compares
> each account breakdown value against `transactionEngine.calculateAllBalances`
> and flags any divergence as `requires_reconciliation`.

### Loan Report / Loan Statement (`getLoanReport`)

| Document field | Source | DB table | DB field | Calculation | Status |
|---|---|---|---|---|---|
| Principal | loans (stored) | loans | principal_amount | direct read | AUTHORITATIVE |
| Interest rate | loans (stored) | loans | interest_rate | direct read | AUTHORITATIVE |
| Total amount | loans (stored) | loans | total_amount | principal + interest | AUTHORITATIVE |
| Amount paid | loans (stored) | loans | amount_paid | maintained on repay | RECONCILED vs ledger |
| Amount due | loans (stored) | loans | amount_due | total_amount − amount_paid | RECONCILED vs ledger |

> Reconciliation: `reconcileLoansOrg` compares stored `amount_paid` against
> `SUM(loan_repayment transactions WHERE reversed=false)` and checks internal
> consistency (`amount_due == total_amount − amount_paid`). Mismatches surface
> as `requires_reconciliation` — never silently corrected.

### Fine Report (`getFineReport`)

| Document field | Source | DB table | DB field | Status |
|---|---|---|---|---|
| Fine amount | fines (stored) | fines | amount | AUTHORITATIVE |
| Amount paid | fines (stored) | fines | amount_paid | RECONCILED vs ledger |
| Balance | computed | — | amount − amount_paid | derived |

> Reconciliation: `reconcileFinesOrg` compares stored `amount_paid` against
> `SUM(fine_payment transactions WHERE reversed=false)`.

### Financial Summary / Org Summary / Welfare (`getFinancialSummary`, etc.)

| Document field | Source | DB table | Calculation | Status |
|---|---|---|---|---|
| Savings deposits/withdrawals/balance | report-data.accountTotals | transactions | SUM by transaction_type, reversed=false | AUTHORITATIVE (ledger) |
| Contributions totals | report-data.accountTotals | transactions | SUM, reversed=false | AUTHORITATIVE |
| Welfare totals | report-data.accountTotals | transactions | SUM, reversed=false | AUTHORITATIVE |
| Fines posted/paid | report-data.accountTotals | transactions | SUM, reversed=false | AUTHORITATIVE |
| Loan disbursed/repaid/outstanding | report-data.loanTotals | transactions | SUM(loan_disbursement), SUM(loan_repayment) | AUTHORITATIVE (ledger) |
| Member counts | report-data.getOrganizationSummary | members | COUNT by status | AUTHORITATIVE |
| Welfare monthly amount | settings | settings | `welfare.monthly_amount` (default 500) | CONFIG (not invented; seeded default) |
| Currency | settings → resolveOrgIdentity | settings | `organization.currency` | CONFIG |

### Org identity (all documents)

| Document field | Source | Setting key | Fallback | Status |
|---|---|---|---|---|
| Organization name | resolveOrgIdentity | `organization.name` | `YUNITE PAMOJA CBO` | CONFIG (never invented) |
| Registration number | resolveOrgIdentity | `organization.registration_number` | empty → 'Not Configured' | CONFIG (NEVER invented) |
| Email/phone/address/website | resolveOrgIdentity | `organization.*` | empty (omitted) | CONFIG |
| Logo | resolveLogoDataUri | `organization.logo_url` / `public/branding/logo.png` | text name (no substitute icon) | ASSET (used AS-IS) |
| Currency | resolveOrgIdentity | `organization.currency` | `KES` | CONFIG |

## Data quality indicator

Every PDF carries a `DataQualityReport` (rendered as a data-quality block):
- computed from **real** reconciliation results (verified / total) — never an
  invented percentage;
- overall status `verified` / `requires_reconciliation` / `unavailable`;
- lists domains requiring reconciliation;
- carries traceability metadata (`sourceTable`, `sourceField`,
  `calculationSource`, `calculationMethod`, `retrievedAt`).

## Known reconciliation risks (do NOT silently fix)

1. **Loan `amount_due` is a stored column** maintained imperatively by
   `loan.service.ts`. If a repayment is recorded via a path that bypasses the
   service (direct DB insert), the stored value diverges from the ledger. The
   reconciliation surfaces this; only `loan.service.ts` workflows may correct it.
2. **Fines `amount_paid` is a parallel stored cache** (dual-write with
   transactions). Reconciliation catches drift; correction is via the fines
   service only.
3. **Member-statement running balance** is a consolidated total across account
   types (savings + contributions + welfare + fines + loans). The per-account
   breakdown (via `transactionEngine`) is the authoritative per-type truth.
