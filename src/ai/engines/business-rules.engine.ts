/**
 * BUSINESS RULE CONSISTENCY ENGINE (deterministic).
 *
 * Inspects configured YUNITE business rules (settings) and compares them
 * against the actual implementation behavior (loan eligibility math, share
 * derivation, interest calc) and database results. Identifies
 * CONFIGURATION vs IMPLEMENTATION vs DATABASE RESULT vs FRONTEND DISPLAY
 * mismatches.
 *
 * Deterministic here means: we re-derive what each rule SHOULD produce from
 * the settings + ledger and flag any divergence from the engine's actual
 * output or stored loan figures.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { transactionEngine } from '@/lib/services/transaction.engine';
import { settingsService } from '@/lib/services/settings.service';
import type { Finding } from '../types';
import { evidence, makeFinding, resetFindingSequence } from './findings';

export async function runBusinessRuleConsistency(): Promise<{ findings: Finding[]; records_checked: number; checks_performed: number }> {
  resetFindingSequence();
  const supabase = await createServiceClient();
  const findings: Finding[] = [];
  let recordsChecked = 0;
  let checksPerformed = 0;

  const rules = await settingsService.getMany([
    'shares.share_value', 'loan.max_percentage', 'loan.max_period_months',
    'loan.default_interest_rate', 'loan.max_amount', 'fees.registration',
    'fees.annual', 'welfare.monthly_amount', 'contributions.monthly_default',
  ]);
  recordsChecked += Object.keys(rules).length;

  const shareValue = parseFloat(rules['shares.share_value']) || 100;
  const maxPct = parseFloat(rules['loan.max_percentage']) || 75;
  const maxAmount = parseFloat(rules['loan.max_amount']) || 500000;
  const interestRate = parseFloat(rules['loan.default_interest_rate']) || 10;
  const period = parseFloat(rules['loan.max_period_months']) || 12;

  // 1. Share derivation rule across active members.
  checksPerformed++;
  const { data: members } = await supabase.from('members').select('id, member_number').eq('status', 'active').limit(200);
  recordsChecked += members?.length ?? 0;
  let shareRuleViolations = 0;
  for (const m of members ?? []) {
    const balances = await transactionEngine.calculateAllBalances(m.id);
    const expectedShares = Math.floor(balances.savings / shareValue);
    if (balances.shares !== expectedShares) shareRuleViolations++;
  }
  if (shareRuleViolations > 0) {
    findings.push(makeFinding({
      prefix: 'BR',
      title: `${shareRuleViolations} member(s) violate the shares = floor(savings / share_value) rule`,
      module: 'shares',
      category: 'configuration_vs_implementation',
      severity: 'high',
      description: `Configured shares.share_value = ${shareValue}; ${shareRuleViolations} active member(s) have a share count inconsistent with that rule.`,
      evidence: [evidence({ source_label: 'settings', source_type: 'configuration', field: 'shares.share_value', actual_value: String(shareValue) })],
    }));
  }

  // 2. Loan interest calculation consistency (total = principal + interest_amount).
  checksPerformed++;
  const { data: loans } = await supabase.from('loans').select('id, member_id, loan_number, principal_amount, interest_rate, interest_amount, total_amount, repayment_period_months, monthly_repayment').limit(10000);
  recordsChecked += loans?.length ?? 0;
  const interestMismatches = (loans ?? []).filter((l) => {
    const expectedInterest = (Number(l.principal_amount) * Number(l.interest_rate)) / 100;
    return Math.abs(Number(l.interest_amount) - expectedInterest) > 0.5;
  });
  if (interestMismatches.length) {
    findings.push(makeFinding({
      prefix: 'BR',
      title: `${interestMismatches.length} loan(s) have interest_amount != principal × interest_rate`,
      module: 'loans',
      category: 'configuration_vs_database_result',
      severity: 'high',
      description: 'Interest should equal principal_amount × interest_rate / 100.',
      evidence: interestMismatches.slice(0, 5).map((l) => evidence({
        source_label: 'loans table', source_type: 'database', field: 'interest_amount',
        expected_value: String((Number(l.principal_amount) * Number(l.interest_rate)) / 100),
        actual_value: String(l.interest_amount),
      })),
    }));
  }

  // 3. Monthly repayment consistency (total / period).
  checksPerformed++;
  const repaymentMismatches = (loans ?? []).filter((l) => {
    const expected = Number(l.total_amount) / Number(l.repayment_period_months);
    return Math.abs(Number(l.monthly_repayment) - expected) > 0.5;
  });
  if (repaymentMismatches.length) {
    findings.push(makeFinding({
      prefix: 'BR',
      title: `${repaymentMismatches.length} loan(s) have monthly_repayment != total_amount / repayment_period_months`,
      module: 'loans',
      category: 'configuration_vs_database_result',
      severity: 'medium',
      description: 'Monthly repayment should equal total_amount / repayment_period_months.',
      evidence: repaymentMismatches.slice(0, 5).map((l) => evidence({
        source_label: 'loans table', source_type: 'database', field: 'monthly_repayment',
        expected_value: String(Number(l.total_amount) / Number(l.repayment_period_months)),
        actual_value: String(l.monthly_repayment),
      })),
    }));
  }

  // 4. Loans exceeding the configured max amount or max percentage of savings.
  checksPerformed++;
  const overLimit = (loans ?? []).filter((l) => Number(l.principal_amount) > maxAmount);
  if (overLimit.length) {
    findings.push(makeFinding({
      prefix: 'BR',
      title: `${overLimit.length} loan(s) exceed the configured loan.max_amount (${maxAmount})`,
      module: 'loans',
      category: 'configuration_vs_database_result',
      severity: 'high',
      description: 'No loan principal should exceed the configured maximum.',
      evidence: overLimit.slice(0, 5).map((l) => evidence({
        source_label: 'loans table', source_type: 'database', field: 'principal_amount', actual_value: String(l.principal_amount), expected_value: String(maxAmount),
      })),
    }));
  }

  // 5. Loans exceeding savings × max_percentage (eligibility rule).
  checksPerformed++;
  const eligibilityViolations: { loan_number: string; savings: number; principal: number }[] = [];
  for (const l of loans ?? []) {
    const savings = await transactionEngine.calculateBalance(l.member_id, 'savings');
    const capFromSavings = (savings * maxPct) / 100;
    if (Number(l.principal_amount) > Math.min(capFromSavings, maxAmount) + 0.5) {
      eligibilityViolations.push({ loan_number: l.loan_number, savings, principal: Number(l.principal_amount) });
    }
  }
  if (eligibilityViolations.length) {
    findings.push(makeFinding({
      prefix: 'BR',
      title: `${eligibilityViolations.length} loan(s) exceed the max loan = min(savings × ${maxPct}%, ${maxAmount}) rule`,
      module: 'loans',
      category: 'business_rule_violation',
      severity: 'high',
      description: 'Loan eligibility caps the principal at savings × max_percentage and the absolute max_amount.',
      evidence: eligibilityViolations.slice(0, 5).map((v) => evidence({
        source_label: 'loans + ledger', source_type: 'calculation', field: 'principal_amount',
        actual_value: String(v.principal), expected_value: String(Math.min((v.savings * maxPct) / 100, maxAmount)),
      })),
    }));
  }

  // 6. Configured interest rate vs loan records (default drift).
  checksPerformed++;
  const rateDrift = (loans ?? []).filter((l) => Math.abs(Number(l.interest_rate) - interestRate) > 0.01);
  if (rateDrift.length) {
    findings.push(makeFinding({
      prefix: 'BR',
      title: `${rateDrift.length} loan(s) use an interest rate different from the configured default (${interestRate})`,
      module: 'loans',
      category: 'configuration_vs_database_result',
      severity: 'low',
      description: 'This may be intentional (per-loan override) but is flagged for review.',
      human_review: true,
      evidence: [evidence({ source_label: 'settings', source_type: 'configuration', field: 'loan.default_interest_rate', actual_value: String(interestRate) })],
    }));
  }

  // 7. Period drift (per-loan override below max — flagged for review).
  checksPerformed++;
  const periodDrift = (loans ?? []).filter((l) => Number(l.repayment_period_months) !== period);
  if (periodDrift.length) {
    findings.push(makeFinding({
      prefix: 'BR',
      title: `${periodDrift.length} loan(s) use a repayment period different from the configured default (${period})`,
      module: 'loans',
      category: 'configuration_vs_database_result',
      severity: 'low',
      description: 'Per-loan override is allowed; flagged for review.',
      human_review: true,
      expected_value: String(period),
      actual_value: String(periodDrift[0].repayment_period_months),
      affected_records: periodDrift.map((l) => l.id),
      location: {
        module: 'loans',
        submodule: 'Loan Records',
        database: { table: 'loans', field: 'repayment_period_months', record_id: periodDrift[0]?.id },
        member_id: periodDrift[0]?.member_id,
        business_rule: 'loan.max_period_months',
      },
      evidence: [evidence({ source_label: 'settings', source_type: 'configuration', field: 'loan.max_period_months', actual_value: String(period) })],
    }));
  }

  // 8. Loans exceeding the configured MAX period (should never happen post-fix).
  checksPerformed++;
  const overMaxPeriod = (loans ?? []).filter((l) => Number(l.repayment_period_months) > period);
  if (overMaxPeriod.length) {
    findings.push(makeFinding({
      prefix: 'BR',
      title: `${overMaxPeriod.length} loan(s) exceed the configured max repayment period (${period} months)`,
      module: 'loans',
      category: 'configuration_violation',
      severity: 'high',
      description: 'Loans with a repayment period exceeding the configured maximum violate the business rule. These should have been rejected at creation.',
      expected_value: `≤ ${period}`,
      actual_value: String(overMaxPeriod[0].repayment_period_months),
      affected_records: overMaxPeriod.map((l) => l.id),
      location: {
        module: 'loans',
        submodule: 'Loan Records',
        database: { table: 'loans', field: 'repayment_period_months', record_id: overMaxPeriod[0]?.id },
        member_id: overMaxPeriod[0]?.member_id,
        business_rule: 'loan.max_period_months',
      },
      evidence: overMaxPeriod.map((l) => evidence({ source_label: 'loans table', source_type: 'database', field: 'repayment_period_months', actual_value: String(l.repayment_period_months), expected_value: String(period), evidence_json: { record_id: l.id, loan_number: l.loan_number } })),
    }));
  }

  // 9. Orphan transactions with NULL member_id (breaks ledger → member mapping).
  checksPerformed++;
  const { data: orphans, count: orphanCount } = await supabase
    .from('transactions')
    .select('id, transaction_ref, member_id, account_id, amount, transaction_type', { count: 'exact' })
    .is('member_id', null)
    .limit(1000);
  recordsChecked += orphanCount ?? 0;
  if (orphans && orphans.length > 0) {
    findings.push(makeFinding({
      prefix: 'DB',
      title: `${orphans.length} transaction(s) missing member reference`,
      module: 'transactions',
      category: 'data_integrity',
      severity: 'high',
      description: 'Transactions without a member_id break per-member balance derivation.',
      expected_value: 'Valid UUID',
      actual_value: 'null',
      is_systemic: orphans.length > 3,
      affected_records: orphans.map((t) => t.id),
      location: {
        module: 'transactions',
        submodule: 'Ledger',
        database: { table: 'transactions', field: 'member_id' },
        business_rule: 'Every ledger transaction must reference a member (balances are derived from the ledger).',
      },
      evidence: orphans.slice(0, 10).map((t) => evidence({ source_label: 'transactions table', source_type: 'database', field: 'member_id', actual_value: 'null', expected_value: 'UUID', evidence_json: { record_id: t.id, transaction_ref: t.transaction_ref, amount: t.amount, transaction_type: t.transaction_type } })),
    }));
  }

  return { findings, records_checked: recordsChecked, checks_performed: checksPerformed };
}
