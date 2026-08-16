/**
 * UNITY FUND CONSISTENCY ENGINE (deterministic).
 *
 * Verifies the financial integrity of the organization-level Unity Fund by
 * cross-checking the UnityFundEngine's authoritative balance against every
 * independent recomputation path:
 *
 *   1. ENGINE LEDGER   — UnityFundEngine.getActualBalance (authoritative)
 *   2. DB VIEW          — SUM(unity_fund_actual_receipts) - expenditures
 *   3. SOURCE BREAKDOWN — SUM(source.actual) across all sources
 *   4. DASHBOARD PATH   — getActualReceipts - getActualExpendituresTotal
 *
 * Any divergence is a CONFIRMED finding. The AI later explains the root
 * cause; it never guesses the calc (spec §18, §29, §43, RULE 29-31).
 *
 * Also enforces the core accounting invariants:
 *   - Pending receivables must NEVER be included in the actual balance.
 *   - Organization loans received must create a matching liability (never
 *     classified as income).
 *   - Loan interest receipts must not exceed the loan's total interest.
 *   - Expenditures must not exceed available cash.
 */

import { unityFundEngine } from '@/lib/services/unity-fund.engine';
import { createServiceClient } from '@/lib/supabase/server';
import type { Finding } from '../types';
import { evidence, makeFinding, resetFindingSequence, kes, moneyDiff } from './findings';

const BACKEND_MODULE = 'UnityFundModule';
const SERVICE = 'UnityFundEngine.getActualBalance';

export async function runUnityFundConsistency(): Promise<{ findings: Finding[]; records_checked: number; checks_performed: number }> {
  resetFindingSequence();
  const findings: Finding[] = [];
  let recordsChecked = 0;
  let checksPerformed = 0;

  const reconciliation = await unityFundEngine.getReconciliation();
  recordsChecked += reconciliation.checks_performed + 1;
  checksPerformed += reconciliation.checks.length;

  // 1. Cross-path reconciliation discrepancies.
  for (const check of reconciliation.checks) {
    if (check.passed) continue;
    findings.push(makeFinding({
      prefix: 'UF',
      title: `Unity Fund reconciliation mismatch: ${check.label}`,
      module: 'unity_fund',
      category: 'reconciliation_mismatch',
      severity: Math.abs(check.difference) > 1000 ? 'critical' : 'high',
      description: `Unity Fund ${check.label}: expected ${kes(check.expected)}, actual ${kes(check.actual)}, difference ${kes(check.difference)}.`,
      root_cause: 'The Unity Fund balance drifted between the authoritative engine ledger and an independent recomputation path. This indicates either a missing source, a duplicate write, or a stale projection.',
      recommendation: 'Re-run reconciliation, identify the divergent source module, and reconcile the affected records. Verify no duplicate Unity Fund transactions exist (the engine should derive from the authoritative ledger, not duplicate it).',
      expected_value: kes(check.expected),
      actual_value: kes(check.actual),
      difference: kes(check.difference),
      is_systemic: true,
      related_tables: ['transactions', 'loan_interest_receipts', 'donations', 'grants', 'organization_loans', 'unity_fund_expenditures'],
      location: {
        module: 'unity_fund',
        submodule: 'Reconciliation',
        backend: { module: BACKEND_MODULE, service: SERVICE, route: 'GET /api/v1/unity-fund/reconciliation' },
        source_calculation: check.label,
      },
      evidence: [
        evidence({ source_label: check.label, source_type: 'calculation', field: 'unity_fund_balance', expected_value: kes(check.expected), actual_value: kes(check.actual), difference: kes(check.difference) }),
      ],
    }));
  }

  const supabase = await createServiceClient();

  // 2. INVARIANT: Pending receivables must NOT be in the actual balance.
  const position = await unityFundEngine.getFinancialPosition();
  recordsChecked += 2;
  checksPerformed += 1;
  if (position.actual_balance < 0 && Math.abs(position.actual_balance) > position.pending_receivables) {
    // A negative actual balance larger than pending suggests pending was
    // accidentally spent — a serious integrity issue.
    findings.push(makeFinding({
      prefix: 'UF',
      title: 'Unity Fund actual balance negative beyond pending receivables',
      module: 'unity_fund',
      category: 'pending_treated_as_cash',
      severity: 'critical',
      description: `Actual Unity Fund balance is ${kes(position.actual_balance)} while pending receivables are only ${kes(position.pending_receivables)}. This suggests expenditures exceeded actual cash — pending money may have been treated as spendable.`,
      root_cause: 'Expenditures were recorded without verifying available actual cash, or pending receivables were incorrectly counted as cash.',
      recommendation: 'Block expenditures that exceed actual cash. Confirm pending receivables are reported separately and never added to the actual balance (RULE 1-2).',
      expected_value: kes(position.pending_receivables),
      actual_value: kes(position.actual_balance),
      difference: moneyDiff(position.actual_balance, position.pending_receivables),
      is_systemic: true,
      related_tables: ['unity_fund_expenditures', 'member_financial_obligations'],
      location: {
        module: 'unity_fund',
        submodule: 'Actual vs Pending',
        backend: { module: BACKEND_MODULE, service: 'UnityFundEngine.getFinancialPosition', route: 'GET /api/v1/unity-fund/summary' },
      },
      evidence: [
        evidence({ source_label: 'actual balance', source_type: 'calculation', field: 'actual_balance', actual_value: kes(position.actual_balance) }),
        evidence({ source_label: 'pending receivables', source_type: 'calculation', field: 'pending_receivables', actual_value: kes(position.pending_receivables) }),
      ],
    }));
  }

  // 3. INVARIANT: Organization loans received must equal outstanding +
  //    repaid (loan cash = liability movement, never income).
  const liabilities = position.organization_liabilities;
  const { data: orgLoans } = await supabase
    .from('organization_loans')
    .select('received_amount, repaid_amount, outstanding_liability')
    .in('status', ['received', 'active', 'partial', 'completed', 'defaulted']);
  recordsChecked += (orgLoans?.length ?? 0);
  checksPerformed += 1;
  for (const loan of orgLoans ?? []) {
    const received = Number(loan.received_amount) || 0;
    const repaid = Number(loan.repaid_amount) || 0;
    const outstanding = Number(loan.outstanding_liability) || 0;
    const expectedOutstanding = Math.max(0, received - repaid);
    if (Math.abs(outstanding - expectedOutstanding) > 0.5) {
      findings.push(makeFinding({
        prefix: 'UF',
        title: 'Organization loan liability mismatch',
        module: 'unity_fund',
        category: 'liability_mismatch',
        severity: 'high',
        description: `Organization loan liability drift: received ${kes(received)}, repaid ${kes(repaid)}, stored outstanding ${kes(outstanding)}, expected outstanding ${kes(expectedOutstanding)}.`,
        root_cause: 'The outstanding_liability column on organization_loans drifted from received - repaid. A received org loan must create a matching liability (it is never income).',
        recommendation: 'Recompute outstanding_liability = received_amount - repaid_amount for organization loans and enforce the invariant on every receipt/repayment.',
        expected_value: kes(expectedOutstanding),
        actual_value: kes(outstanding),
        difference: kes(outstanding - expectedOutstanding),
        related_tables: ['organization_loans'],
        location: {
          module: 'unity_fund',
          submodule: 'Organization Loans',
          backend: { module: BACKEND_MODULE, service: 'UnityFundEngine.getLiabilities', route: 'GET /api/v1/unity-fund/liabilities' },
          source_calculation: 'outstanding_liability = received_amount - repaid_amount',
        },
        evidence: [
          evidence({ source_label: 'organization_loans.outstanding_liability', source_type: 'database', field: 'outstanding_liability', actual_value: kes(outstanding) }),
          evidence({ source_label: 'received - repaid', source_type: 'calculation', field: 'outstanding_liability', actual_value: kes(expectedOutstanding), difference: kes(outstanding - expectedOutstanding) }),
        ],
      }));
    }
  }
  // Confirm org loans are reported as liabilities, not folded into income.
  if (liabilities < 0) {
    findings.push(makeFinding({
      prefix: 'UF',
      title: 'Organization liabilities reported negative',
      module: 'unity_fund',
      category: 'liability_mismatch',
      severity: 'high',
      description: `Total organization liabilities reported as ${kes(liabilities)}. Liabilities cannot be negative — a received org loan is cash AND a liability, never income.`,
      recommendation: 'Recalculate outstanding liabilities as SUM(max(0, received - repaid)) over organization loans.',
      actual_value: kes(liabilities),
      related_tables: ['organization_loans'],
      location: { module: 'unity_fund', submodule: 'Liabilities', backend: { module: BACKEND_MODULE, service: 'UnityFundEngine.getLiabilities' } },
      evidence: [evidence({ source_label: 'total liabilities', source_type: 'calculation', field: 'organization_liabilities', actual_value: kes(liabilities) })],
    }));
  }

  // 4. INVARIANT: Loan interest receipts must not exceed the loan's total interest.
  const { data: interestChecks } = await supabase
    .from('loan_interest_receipts')
    .select('loan_id, loan_number, interest_amount')
    .eq('status', 'received');
  const byLoan: Record<string, { loan_number: string; received: number }> = {};
  for (const r of interestChecks ?? []) {
    const e = byLoan[r.loan_id] ?? { loan_number: r.loan_number, received: 0 };
    e.received += Number(r.interest_amount) || 0;
    byLoan[r.loan_id] = e;
  }
  if (Object.keys(byLoan).length) {
    const { data: loans } = await supabase
      .from('loans')
      .select('id, loan_number, interest_amount')
      .in('id', Object.keys(byLoan));
    recordsChecked += loans?.length ?? 0;
    checksPerformed += 1;
    for (const loan of loans ?? []) {
      const received = byLoan[loan.id]?.received ?? 0;
      const total = Number(loan.interest_amount) || 0;
      if (received > total + 0.5) {
        findings.push(makeFinding({
          prefix: 'UF',
          title: 'Loan interest receipts exceed total loan interest',
          module: 'unity_fund',
          category: 'interest_over_receipt',
          severity: 'high',
          description: `Loan ${loan.loan_number}: interest receipts total ${kes(received)} exceed the loan's total interest ${kes(total)}. This indicates duplicate interest routing to the Unity Fund.`,
          root_cause: 'Loan interest was recorded into the Unity Fund more than once, or the interest cap (remaining un-received interest) was not enforced.',
          recommendation: 'Reverse the excess interest receipt(s) and enforce the cumulative cap: interestPortion = min(pro-rata, totalInterest - alreadyReceived).',
          expected_value: kes(total),
          actual_value: kes(received),
          difference: kes(received - total),
          affected_records: [loan.loan_number],
          related_tables: ['loan_interest_receipts', 'loans'],
          location: {
            module: 'unity_fund',
            submodule: 'Loan Interest',
            backend: { module: 'LoanModule', service: 'LoanService.recordLoanInterestReceipt' },
            source_calculation: 'SUM(loan_interest_receipts) <= loans.interest_amount',
          },
          evidence: [
            evidence({ source_label: 'loan_interest_receipts (received)', source_type: 'database', field: 'interest_received', actual_value: kes(received) }),
            evidence({ source_label: 'loans.interest_amount', source_type: 'database', field: 'interest_total', actual_value: kes(total), difference: kes(received - total) }),
          ],
        }));
      }
    }
  }

  // 5. INVARIANT: Expenditures must not exceed available cash.
  const expenditures = await unityFundEngine.getExpenditures();
  const receipts = await unityFundEngine.getActualReceipts();
  recordsChecked += 1;
  checksPerformed += 1;
  if (expenditures.total_expenditures > receipts + 0.5) {
    findings.push(makeFinding({
      prefix: 'UF',
      title: 'Unity Fund expenditures exceed total receipts',
      module: 'unity_fund',
      category: 'expenditure_over_cash',
      severity: 'critical',
      description: `Total posted expenditures ${kes(expenditures.total_expenditures)} exceed total actual receipts ${kes(receipts)}. Money was spent that the organization never actually received.`,
      root_cause: 'An expenditure was recorded without verifying available cash, or a receipt was reversed after its linked expenditure was posted.',
      recommendation: 'Reverse or investigate the offending expenditure. Enforce available-cash verification on every expenditure (RULE 20-21).',
      expected_value: kes(receipts),
      actual_value: kes(expenditures.total_expenditures),
      difference: kes(expenditures.total_expenditures - receipts),
      is_systemic: true,
      related_tables: ['unity_fund_expenditures'],
      location: {
        module: 'unity_fund',
        submodule: 'Expenditures',
        backend: { module: BACKEND_MODULE, service: 'UnityFundEngine.recordExpenditure' },
      },
      evidence: [
        evidence({ source_label: 'total expenditures', source_type: 'calculation', field: 'expenditures', actual_value: kes(expenditures.total_expenditures) }),
        evidence({ source_label: 'total receipts', source_type: 'calculation', field: 'receipts', actual_value: kes(receipts), difference: kes(expenditures.total_expenditures - receipts) }),
      ],
    }));
  }

  return { findings, records_checked: recordsChecked, checks_performed: checksPerformed };
}
