/**
 * REPORT DATA QUALITY & RECONCILIATION ENGINE
 *
 * The Document Engine is a PRESENTATION layer; the database + YUNITE business
 * engines are the source of truth. This module reconciles the values that feed
 * documents against their authoritative ledger sources BEFORE a document is
 * generated, so that a discrepancy is never silently presented as verified
 * truth (requirement: "Never prioritize document appearance over data
 * correctness").
 *
 * It NEVER mutates financial data. It only COMPARES and REPORTS. Only the
 * existing authorized financial-correction workflows may modify records.
 *
 * Reconciliations performed:
 *  - Loans: stored `loans.amount_due`/`amount_paid` vs the loan_repayment
 *    transactions in the ledger (per loan + org-wide). Also checks the
 *    internal consistency amount_due == total_amount - amount_paid.
 *  - Fines: stored `fines.amount_paid` vs SUM(fine_payment transactions).
 *  - Member statement: the statement's computed closing balance vs
 *    transactionEngine.calculateAllBalances (per account type).
 *
 * The output `DataQualityReport` carries per-domain status
 * (verified | requires_reconciliation | unavailable), a computed quality
 * percentage from real validation results (never invented), and traceability
 * metadata for each checked value.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { transactionEngine } from '../transaction.engine';

export type DataQualityStatus = 'verified' | 'requires_reconciliation' | 'unavailable';

export interface DataQualityCheck {
  /** Document field / domain checked, e.g. "Loan Outstanding Balance". */
  field: string;
  status: DataQualityStatus;
  /** Stored (potentially stale) value. */
  storedValue?: number;
  /** Ledger-derived authoritative value. */
  ledgerValue?: number;
  difference?: number;
  /** Number of records involved in the check. */
  recordsChecked: number;
  /** Number of records with a discrepancy. */
  discrepantRecords: number;
  /** Human-readable explanation. */
  note: string;
  /** Traceability: where the stored value came from. */
  sourceTable?: string;
  sourceField?: string;
  /** Traceability: the authoritative calculation. */
  calculationSource?: string;
  calculationMethod?: string;
  retrievedAt: string;
}

export interface DataQualityReport {
  generatedAt: string;
  checks: DataQualityCheck[];
  /** Overall status: requires_reconciliation if ANY check does, else verified. */
  overall: DataQualityStatus;
  /** Computed from real results: verified / total. Never invented. */
  qualityPercent: number;
  /** Domains that passed. */
  verified: string[];
  /** Domains requiring reconciliation. */
  requiresReconciliation: string[];
  /** Domains that could not be checked (DB/engine unavailable). */
  unavailable: string[];
  summary: string;
}

const NOW = () => new Date().toISOString();

export class ReportDataQualityService {
  /**
   * Org-wide reconciliation: loans + fines stored vs ledger.
   * Used by aggregate reports (financial_summary, loan_report, fine_report,
   * organization_summary).
   */
  async reconcileOrganization(): Promise<DataQualityReport> {
    const checks: DataQualityCheck[] = [];
    checks.push(await this.reconcileLoansOrg());
    checks.push(await this.reconcileFinesOrg());
    return this.buildReport(checks);
  }

  /**
   * Member-scoped reconciliation: statement closing balance vs engine +
   * member's loans + fines.
   */
  async reconcileMember(
    memberId: string,
    statementClosing?: { closingBalance?: number; accountBreakdown?: Array<{ account_type: string; balance: number }> },
  ): Promise<DataQualityReport> {
    const checks: DataQualityCheck[] = [];
    checks.push(await this.reconcileMemberStatement(memberId, statementClosing));
    checks.push(await this.reconcileLoansOrg(memberId));
    checks.push(await this.reconcileFinesOrg(memberId));
    return this.buildReport(checks);
  }

  /**
   * Reconcile loan outstanding balances: stored `amount_due`/`amount_paid`
   * against the loan_repayment transactions in the ledger.
   */
  async reconcileLoansOrg(memberId?: string): Promise<DataQualityCheck> {
    const retrievedAt = NOW();
    try {
      const supabase = await createServiceClient();
      let q = supabase
        .from('loans')
        .select('id, loan_number, member_id, total_amount, amount_paid, amount_due, status')
        .in('status', ['approved', 'disbursed', 'active']);
      if (memberId) q = q.eq('member_id', memberId);
      const { data: loans, error } = await q;
      if (error) {
        return this.unavailableCheck('Loan Outstanding Balance', 'loans', error.message, retrievedAt);
      }
      const loanList = loans ?? [];
      let discrepant = 0;
      let storedTotal = 0;
      for (const loan of loanList) {
        const storedDue = Number(loan.amount_due || 0);
        const total = Number(loan.total_amount || 0);
        const paid = Number(loan.amount_paid || 0);
        storedTotal += storedDue;
        // Internal consistency: amount_due should equal total_amount - amount_paid.
        const internalDiff = Math.round((storedDue - (total - paid)) * 100) / 100;
        if (Math.abs(internalDiff) > 0.01) discrepant++;
      }
      // Ledger-derived total repaid = SUM(loan_repayment transactions).
      let ledgerQuery = supabase
        .from('transactions')
        .select('amount, member_id')
        .eq('transaction_type', 'loan_repayment')
        .eq('reversed', false);
      if (memberId) ledgerQuery = ledgerQuery.eq('member_id', memberId);
      const { data: repayTxns, error: rErr } = await ledgerQuery;
      const ledgerRepaid = (repayTxns ?? []).reduce((s, t) => s + Number(t.amount), 0);
      const storedRepaid = loanList.reduce((s, l) => s + Number(l.amount_paid || 0), 0);
      const repaidDiff = Math.round((storedRepaid - ledgerRepaid) * 100) / 100;
      if (rErr || Math.abs(repaidDiff) > 0.01) discrepant++;
      const ok = discrepant === 0 && !rErr;
      return {
        field: 'Loan Outstanding Balance',
        status: ok ? 'verified' : 'requires_reconciliation',
        storedValue: storedRepaid,
        ledgerValue: rErr ? undefined : ledgerRepaid,
        difference: rErr ? undefined : repaidDiff,
        recordsChecked: loanList.length,
        discrepantRecords: discrepant,
        note: ok
          ? `All ${loanList.length} active loan(s) reconcile: stored amount_paid (KES ${storedRepaid.toFixed(2)}) matches ledger loan_repayment sum (KES ${ledgerRepaid.toFixed(2)}).`
          : `Discrepancy in ${discrepant} of ${loanList.length} loan record(s): stored amount_paid (KES ${storedRepaid.toFixed(2)}) vs ledger sum (KES ${rErr ? 'unavailable' : ledgerRepaid.toFixed(2)}).`,
        sourceTable: 'loans',
        sourceField: 'amount_due, amount_paid',
        calculationSource: 'transactions',
        calculationMethod: "SUM(loan_repayment WHERE reversed=false)",
        retrievedAt,
      };
    } catch (e) {
      return this.unavailableCheck('Loan Outstanding Balance', 'loans', e instanceof Error ? e.message : String(e), retrievedAt);
    }
  }

  /**
   * Reconcile fines: stored `amount_paid` against SUM(fine_payment transactions).
   */
  async reconcileFinesOrg(memberId?: string): Promise<DataQualityCheck> {
    const retrievedAt = NOW();
    try {
      const supabase = await createServiceClient();
      let q = supabase
        .from('fines')
        .select('id, fine_number, member_id, amount, amount_paid, status');
      if (memberId) q = q.eq('member_id', memberId);
      const { data: fines, error } = await q;
      if (error) {
        return this.unavailableCheck('Fine Balance', 'fines', error.message, retrievedAt);
      }
      const fineList = fines ?? [];
      const storedPaid = fineList.reduce((s, f) => s + Number(f.amount_paid || 0), 0);
      let ledgerQuery = supabase
        .from('transactions')
        .select('amount')
        .eq('transaction_type', 'fine_payment')
        .eq('reversed', false);
      if (memberId) ledgerQuery = ledgerQuery.eq('member_id', memberId);
      const { data: payTxns, error: pErr } = await ledgerQuery;
      const ledgerPaid = (payTxns ?? []).reduce((s, t) => s + Number(t.amount), 0);
      const diff = Math.round((storedPaid - ledgerPaid) * 100) / 100;
      const ok = !pErr && Math.abs(diff) <= 0.01;
      return {
        field: 'Fine Balance',
        status: ok ? 'verified' : 'requires_reconciliation',
        storedValue: storedPaid,
        ledgerValue: pErr ? undefined : ledgerPaid,
        difference: pErr ? undefined : diff,
        recordsChecked: fineList.length,
        discrepantRecords: ok ? 0 : 1,
        note: ok
          ? `All ${fineList.length} fine(s) reconcile: stored amount_paid (KES ${storedPaid.toFixed(2)}) matches ledger fine_payment sum (KES ${ledgerPaid.toFixed(2)}).`
          : `Discrepancy: stored amount_paid (KES ${storedPaid.toFixed(2)}) vs ledger sum (KES ${pErr ? 'unavailable' : ledgerPaid.toFixed(2)}).`,
        sourceTable: 'fines',
        sourceField: 'amount, amount_paid',
        calculationSource: 'transactions',
        calculationMethod: 'SUM(fine_payment WHERE reversed=false)',
        retrievedAt,
      };
    } catch (e) {
      return this.unavailableCheck('Fine Balance', 'fines', e instanceof Error ? e.message : String(e), retrievedAt);
    }
  }

  /**
   * Reconcile a member statement: the statement's closing balance + account
   * breakdown against transactionEngine.calculateAllBalances (the authoritative
   * ledger-derived calc).
   */
  async reconcileMemberStatement(
    memberId: string,
    statement?: { closingBalance?: number; accountBreakdown?: Array<{ account_type: string; balance: number }> },
  ): Promise<DataQualityCheck> {
    const retrievedAt = NOW();
    try {
      const engine = await transactionEngine.calculateAllBalances(memberId);
      const accountTypes = ['savings', 'shares', 'contributions', 'welfare', 'fines', 'loans'] as const;
      const breakdown = statement?.accountBreakdown ?? [];
      let discrepant = 0;
      const diffs: string[] = [];
      for (const at of accountTypes) {
        const engineVal = Number((engine as unknown as Record<string, number>)[at] ?? 0);
        const stmtVal = Number(breakdown.find((b) => b.account_type === at)?.balance ?? 0);
        const diff = Math.round((stmtVal - engineVal) * 100) / 100;
        if (Math.abs(diff) > 0.01) {
          discrepant++;
          diffs.push(`${at}: statement KES ${stmtVal.toFixed(2)} vs engine KES ${engineVal.toFixed(2)}`);
        }
      }
      const ok = discrepant === 0;
      return {
        field: 'Member Statement Balances',
        status: ok ? 'verified' : 'requires_reconciliation',
        recordsChecked: accountTypes.length,
        discrepantRecords: discrepant,
        note: ok
          ? `Member account balances reconcile with transactionEngine.calculateAllBalances across all ${accountTypes.length} account types.`
          : `Discrepancy in ${discrepant} account type(s): ${diffs.join('; ')}.`,
        sourceTable: 'transactions',
        sourceField: 'amount (ledger)',
        calculationSource: 'TransactionEngine.calculateAllBalances',
        calculationMethod: 'SUM(transactions) per account_type, reversed=false',
        retrievedAt,
      };
    } catch (e) {
      return this.unavailableCheck('Member Statement Balances', 'transactions', e instanceof Error ? e.message : String(e), retrievedAt);
    }
  }

  private unavailableCheck(field: string, table: string, error: string, retrievedAt: string): DataQualityCheck {
    return {
      field,
      status: 'unavailable',
      recordsChecked: 0,
      discrepantRecords: 0,
      note: `Reconciliation could not be performed: ${error}. Data validity unverified.`,
      sourceTable: table,
      retrievedAt,
    };
  }

  private buildReport(checks: DataQualityCheck[]): DataQualityReport {
    const generatedAt = NOW();
    const verified = checks.filter((c) => c.status === 'verified').map((c) => c.field);
    const requiresReconciliation = checks.filter((c) => c.status === 'requires_reconciliation').map((c) => c.field);
    const unavailable = checks.filter((c) => c.status === 'unavailable').map((c) => c.field);
    const overall: DataQualityStatus = checks.some((c) => c.status === 'requires_reconciliation')
      ? 'requires_reconciliation'
      : checks.every((c) => c.status === 'unavailable')
        ? 'unavailable'
        : 'verified';
    const total = checks.length || 1;
    const qualityPercent = Math.round((verified.length / total) * 100);
    const summary =
      overall === 'verified'
        ? `Data quality: ${qualityPercent}%. All ${checks.length} domain(s) verified against the authoritative ledger.`
        : overall === 'requires_reconciliation'
          ? `Data quality: ${qualityPercent}%. ${requiresReconciliation.length} domain(s) require reconciliation: ${requiresReconciliation.join(', ')}.`
          : `Data quality: unavailable. Reconciliation could not run (database/engine unavailable).`;
    return { generatedAt, checks, overall, qualityPercent, verified, requiresReconciliation, unavailable, summary };
  }
}

export const reportDataQualityService = new ReportDataQualityService();
