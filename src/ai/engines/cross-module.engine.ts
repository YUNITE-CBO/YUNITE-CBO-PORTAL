/**
 * CROSS-MODULE CONSISTENCY ENGINE (deterministic).
 *
 * Compares data BETWEEN YUNITE modules to verify relationships hold:
 *   Member → Savings → Shares → Loans → Repayments → Contributions →
 *   Fines → Welfare → Financial Accounts → Statements.
 *
 * For every important relationship it computes:
 *   source data, destination data, expected relationship, actual
 *   relationship, difference, severity, evidence.
 *
 * Example: shares = floor(savings / share_value). If the displayed/stored
 * shares diverge from the configured rule, it becomes a finding.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { transactionEngine } from '@/lib/services/transaction.engine';
import { settingsService } from '@/lib/services/settings.service';
import type { Finding } from '../types';
import { evidence, makeFinding, resetFindingSequence } from './findings';

export async function runCrossModuleConsistency(): Promise<{ findings: Finding[]; records_checked: number; checks_performed: number }> {
  resetFindingSequence();
  const supabase = await createServiceClient();
  const findings: Finding[] = [];
  let recordsChecked = 0;
  let checksPerformed = 0;

  const { data: members } = await supabase.from('members').select('id, member_number, status').eq('status', 'active').limit(200);
  recordsChecked += members?.length ?? 0;

  const shareValue = await settingsService.getNumber('shares.share_value', 100);

  for (const m of members ?? []) {
    // SHARES vs SAVINGS rule.
    checksPerformed++;
    const balances = await transactionEngine.calculateAllBalances(m.id);
    const expectedShares = Math.floor(balances.savings / shareValue);
    if (balances.shares !== expectedShares) {
      findings.push(makeFinding({
        prefix: 'XM',
        title: `Shares/savings rule mismatch for ${m.member_number}`,
        module: 'shares',
        category: 'business_rule_relationship',
        severity: 'high',
        description: `Expected shares = floor(savings / share_value) = floor(${balances.savings} / ${shareValue}) = ${expectedShares}, but engine returned ${balances.shares}.`,
        root_cause: 'Share derivation diverged from the configured shares.share_value rule.',
        recommendation: 'Recompute shares from the savings ledger and the configured share value.',
        evidence: [
          evidence({ source_label: 'transaction engine', source_type: 'calculation', field: 'shares', actual_value: String(balances.shares), expected_value: String(expectedShares) }),
          evidence({ source_label: 'transaction engine', source_type: 'calculation', field: 'savings', actual_value: String(balances.savings) }),
          evidence({ source_label: 'settings', source_type: 'configuration', field: 'shares.share_value', actual_value: String(shareValue) }),
        ],
      }));
    }

    // LOANS outstanding vs ledger loan balance.
    checksPerformed++;
    const { data: activeLoans } = await supabase
      .from('loans')
      .select('amount_due')
      .eq('member_id', m.id)
      .in('status', ['approved', 'disbursed', 'active']);
    const sumDue = (activeLoans ?? []).reduce((s, l) => s + Number(l.amount_due || 0), 0);
    if (Math.abs(sumDue - balances.loans) > 0.5) {
      findings.push(makeFinding({
        prefix: 'XM',
        title: `Loans ledger balance != sum(active loan amount_due) for ${m.member_number}`,
        module: 'loans',
        category: 'cross_module_mismatch',
        severity: 'high',
        description: `Engine loan balance = ${balances.loans}, but SUM(amount_due) of active loans = ${sumDue}.`,
        root_cause: 'The loan ledger balance and the sum of active loan amount_due diverged (a repayment/adjustment updated one but not the other).',
        recommendation: 'Reconcile the loan ledger with SUM(amount_due) for the member; re-post the missing repayment or recompute amount_due.',
        evidence: [
          evidence({ source_label: 'transaction engine', source_type: 'calculation', field: 'loans', actual_value: String(balances.loans) }),
          evidence({ source_label: 'loans table', source_type: 'database', field: 'amount_due', actual_value: String(sumDue), difference: String(balances.loans - sumDue) }),
        ],
      }));
    }

    // FINES outstanding vs ledger fines balance.
    checksPerformed++;
    const { data: openFines } = await supabase
      .from('fines')
      .select('amount, amount_paid')
      .eq('member_id', m.id)
      .in('status', ['pending', 'partial']);
    const openFinesDue = (openFines ?? []).reduce((s, f) => s + (Number(f.amount) - Number(f.amount_paid)), 0);
    if (Math.abs(openFinesDue - balances.fines) > 0.5) {
      findings.push(makeFinding({
        prefix: 'XM',
        title: `Fines ledger balance != open-fines outstanding for ${m.member_number}`,
        module: 'fines',
        category: 'cross_module_mismatch',
        severity: 'medium',
        description: `Engine fines balance = ${balances.fines}, but open-fines outstanding = ${openFinesDue}.`,
        root_cause: 'The fines ledger balance and the open-fines outstanding diverged (a fine_payment updated the ledger but not amount_paid, or vice versa).',
        recommendation: 'Reconcile the fines ledger with SUM(amount - amount_paid) for open fines; re-post the missing payment or recompute amount_paid.',
        evidence: [
          evidence({ source_label: 'transaction engine', source_type: 'calculation', field: 'fines', actual_value: String(balances.fines) }),
          evidence({ source_label: 'fines table', source_type: 'database', field: 'amount - amount_paid', actual_value: String(openFinesDue), difference: String(balances.fines - openFinesDue) }),
        ],
      }));
    }

    // ACCOUNT existence: every active member should have the standard accounts.
    checksPerformed++;
    const { data: accts } = await supabase.from('accounts').select('account_type').eq('member_id', m.id);
    const acctTypes = new Set((accts ?? []).map((a) => a.account_type));
    const required = ['savings', 'contributions', 'welfare', 'fines'];
    const missing = required.filter((t) => !acctTypes.has(t));
    const presentTypes: string[] = [];
    acctTypes.forEach((v) => presentTypes.push(v));
    if (missing.length) {
      findings.push(makeFinding({
        prefix: 'XM',
        title: `Member ${m.member_number} is missing account type(s): ${missing.join(', ')}`,
        module: 'accounts',
        category: 'missing_relationships',
        severity: 'medium',
        description: 'An active member should have the standard set of logical accounts.',
        root_cause: 'The member was activated without creating the full standard account set (savings/contributions/welfare/fines).',
        recommendation: 'Create the missing standard account rows for the member so the engine can derive balances correctly.',
        evidence: [evidence({ source_label: 'accounts table', source_type: 'database', field: 'account_type', expected_value: required.join(','), actual_value: presentTypes.join(',') })],
      }));
    }
  }

  return { findings, records_checked: recordsChecked, checks_performed: checksPerformed };
}
