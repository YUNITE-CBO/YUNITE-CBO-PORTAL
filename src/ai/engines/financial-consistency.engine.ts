/**
 * FINANCIAL CONSISTENCY ENGINE (deterministic).
 *
 * Recomputes every financial balance INDEPENDENTLY from the ledger and
 * compares it against the transaction engine's balances (the authoritative
 * calculator) and against the stored balance snapshots on transactions.
 *
 * For every member: SUM(valid savings transactions) is compared with the
 * engine's savings balance. Any divergence is a CONFIRMED finding (the AI
 * later explains the root cause; it never guesses the calc).
 *
 * Also checks organization-wide totals for internal consistency.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { transactionEngine } from '@/lib/services/transaction.engine';
import type { Finding } from '../types';
import { evidence, makeFinding, resetFindingSequence } from './findings';

const DEBIT = new Set([
  'savings_withdrawal', 'registration_fee', 'annual_fee',
  'welfare_disbursement', 'fine_payment',
]);

async function independentBalance(memberId: string, accountType: string): Promise<number> {
  const supabase = await createServiceClient();
  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('member_id', memberId)
    .eq('account_type', accountType)
    .maybeSingle();
  if (!account) return 0;
  const { data: txns } = await supabase
    .from('transactions')
    .select('transaction_type, amount')
    .eq('account_id', account.id)
    .eq('reversed', false)
    .neq('transaction_type', 'reversal');
  let bal = 0;
  for (const t of txns ?? []) bal += DEBIT.has(t.transaction_type) ? -Number(t.amount) : Number(t.amount);
  return bal;
}

export async function runFinancialConsistency(): Promise<{ findings: Finding[]; records_checked: number; checks_performed: number }> {
  resetFindingSequence();
  const supabase = await createServiceClient();
  const findings: Finding[] = [];
  let checksPerformed = 0;
  let recordsChecked = 0;

  const { data: members } = await supabase.from('members').select('id, member_number, status').limit(200);
  recordsChecked += members?.length ?? 0;

  for (const m of members ?? []) {
    // 1. Savings: independent recompute vs engine vs stored balance_after.
    checksPerformed++;
    const indSavings = await independentBalance(m.id, 'savings');
    const engSavings = await transactionEngine.calculateBalance(m.id, 'savings');
    if (Math.abs(indSavings - engSavings) > 0.5) {
      findings.push(makeFinding({
        prefix: 'FIN',
        title: `Savings balance mismatch for ${m.member_number}`,
        module: 'savings',
        category: 'incorrect_balances',
        severity: 'critical',
        description: `Independent ledger sum = ${indSavings}, engine balance = ${engSavings}.`,
        root_cause: 'The independent recompute and the transaction engine diverged — a logic bug or a non-reversed withdrawal.',
        recommendation: 'Reconcile the ledger; verify no transaction is miscounted.',
        evidence: [
          evidence({ source_label: 'independent ledger sum', source_type: 'calculation', field: 'savings', actual_value: String(indSavings) }),
          evidence({ source_label: 'transaction engine', source_type: 'calculation', field: 'savings', actual_value: String(engSavings), difference: String(indSavings - engSavings) }),
        ],
      }));
    }

    // 2. Last transaction balance_after vs recomputed balance (snapshot staleness).
    checksPerformed++;
    const { data: last } = await supabase
      .from('transactions')
      .select('balance_after, transaction_type, amount, reversed')
      .eq('member_id', m.id)
      .eq('account_id', (await supabase.from('accounts').select('id').eq('member_id', m.id).eq('account_type', 'savings').maybeSingle()).data?.id ?? '')
      .order('created_at', { ascending: false })
      .limit(1);
    if (last && last.length && !last[0].reversed) {
      if (Math.abs(Number(last[0].balance_after) - engSavings) > 0.5) {
        findings.push(makeFinding({
          prefix: 'FIN',
          title: `Stale savings balance snapshot for ${m.member_number}`,
          module: 'savings',
          category: 'stale_calculated_values',
          severity: 'medium',
          description: `Last transaction balance_after = ${last[0].balance_after}, engine balance = ${engSavings}.`,
          evidence: [
            evidence({ source_label: 'last transaction', source_type: 'database', field: 'balance_after', actual_value: String(last[0].balance_after) }),
            evidence({ source_label: 'transaction engine', source_type: 'calculation', field: 'savings', actual_value: String(engSavings) }),
          ],
        }));
      }
    }

    // 3. Contributions + Welfare independent recompute vs engine.
    for (const at of ['contributions', 'welfare', 'fines'] as const) {
      checksPerformed++;
      const ind = await independentBalance(m.id, at);
      const eng = await transactionEngine.calculateBalance(m.id, at);
      if (Math.abs(ind - eng) > 0.5) {
        findings.push(makeFinding({
          prefix: 'FIN',
          title: `${at} balance mismatch for ${m.member_number}`,
          module: at,
          category: 'incorrect_balances',
          severity: 'high',
          description: `Independent ledger sum = ${ind}, engine balance = ${eng}.`,
          evidence: [
            evidence({ source_label: 'independent ledger sum', source_type: 'calculation', field: at, actual_value: String(ind) }),
            evidence({ source_label: 'transaction engine', source_type: 'calculation', field: at, actual_value: String(eng), difference: String(ind - eng) }),
          ],
        }));
      }
    }
  }

  // 4. Organization totals: sum of member savings vs sum of savings deposits - withdrawals.
  checksPerformed++;
  const { data: allSavingsTxns } = await supabase
    .from('transactions')
    .select('transaction_type, amount')
    .in('transaction_type', ['savings_deposit', 'savings_withdrawal'])
    .eq('reversed', false);
  const orgSavingsFromTxns = (allSavingsTxns ?? []).reduce((s, t) => s + (t.transaction_type === 'savings_withdrawal' ? -Number(t.amount) : Number(t.amount)), 0);
  let orgSavingsFromMembers = 0;
  for (const m of members ?? []) {
    orgSavingsFromMembers += await transactionEngine.calculateBalance(m.id, 'savings');
  }
  if (Math.abs(orgSavingsFromTxns - orgSavingsFromMembers) > 0.5) {
    findings.push(makeFinding({
      prefix: 'FIN',
      title: 'Organization savings total mismatch',
      module: 'savings',
      category: 'mismatched_aggregates',
      severity: 'high',
      description: `Sum of savings transactions = ${orgSavingsFromTxns}, sum of per-member engine balances (capped sample) = ${orgSavingsFromMembers}.`,
      evidence: [
        evidence({ source_label: 'savings transactions', source_type: 'calculation', field: 'org_savings', actual_value: String(orgSavingsFromTxns) }),
        evidence({ source_label: 'per-member engine sum', source_type: 'calculation', field: 'org_savings', actual_value: String(orgSavingsFromMembers), difference: String(orgSavingsFromTxns - orgSavingsFromMembers) }),
      ],
    }));
  }

  return { findings, records_checked: recordsChecked, checks_performed: checksPerformed };
}
