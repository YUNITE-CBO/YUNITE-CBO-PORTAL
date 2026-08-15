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
 * Deepened (req. #1, #5, #15): each finding now carries the full chain —
 *   DATABASE (independent ledger) → CALCULATION (engine) → STORED (balance_after)
 * — with the exact database table/field, the backend route/service, the
 * expected/actual/difference, affected member numbers, and a systemic flag.
 * Also checks organization-wide totals for internal consistency.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { transactionEngine } from '@/lib/services/transaction.engine';
import type { Finding } from '../types';
import { evidence, makeFinding, resetFindingSequence, kes } from './findings';

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

/** Route + service constants for location pinning (req. #6). */
const ROUTES = {
  balances: 'GET /api/v1/members/{id}/balances',
  financials: 'GET /api/members/:id/financials',
} as const;
const SERVICE = 'TransactionEngine.calculateBalance';
const BACKEND_MODULE = 'TransactionsModule';

export async function runFinancialConsistency(): Promise<{ findings: Finding[]; records_checked: number; checks_performed: number }> {
  resetFindingSequence();
  const supabase = await createServiceClient();
  const findings: Finding[] = [];
  let checksPerformed = 0;
  let recordsChecked = 0;

  const { data: members } = await supabase.from('members').select('id, member_number, status').limit(200);
  recordsChecked += members?.length ?? 0;

  const savingsMismatches: string[] = [];

  for (const m of members ?? []) {
    // 1. Savings: independent recompute vs engine vs stored balance_after.
    checksPerformed++;
    const indSavings = await independentBalance(m.id, 'savings');
    const engSavings = await transactionEngine.calculateBalance(m.id, 'savings');
    if (Math.abs(indSavings - engSavings) > 0.5) {
      savingsMismatches.push(m.member_number);
      findings.push(makeFinding({
        prefix: 'FIN',
        title: `Savings balance mismatch for ${m.member_number}`,
        module: 'savings',
        category: 'incorrect_balances',
        severity: 'critical',
        description: `Independent ledger sum = ${kes(indSavings)}, engine balance = ${kes(engSavings)}. The stored member balance is not synchronized with the underlying savings transaction ledger.`,
        root_cause: 'Stored member balance is not synchronized with the transaction-derived savings ledger.',
        recommendation: 'Review the account balance update path and identify the transaction that caused the divergence.',
        expected_value: kes(indSavings),
        actual_value: kes(engSavings),
        difference: kes(indSavings - engSavings),
        affected_records: [m.member_number],
        is_systemic: false,
        related_tables: ['transactions', 'accounts'],
        location: {
          module: 'savings',
          submodule: 'Member Account Balance',
          // NOTE: balances are NOT stored as columns — accounts has no balance
          // column. The "stored" value is the per-transaction balance_after
          // snapshot on the latest non-reversed transaction. The live balance
          // is computed by TransactionEngine.calculateBalance (SUM of the
          // ledger, reversed excluded).
          database: { table: 'transactions', field: 'balance_after (latest snapshot)', record_id: m.id },
          backend: { module: BACKEND_MODULE, service: SERVICE, route: ROUTES.balances, method: 'GET', response_value: kes(engSavings) },
          member_id: m.id,
          member_number: m.member_number,
          source_calculation: 'SUM(transactions) WHERE account_type=savings AND reversed=false',
        },
        evidence: [
          evidence({ source_label: 'independent ledger sum', source_type: 'calculation', field: 'savings', actual_value: kes(indSavings) }),
          evidence({ source_label: 'transaction engine', source_type: 'calculation', field: 'savings', actual_value: kes(engSavings), difference: kes(indSavings - engSavings) }),
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
          description: `Last transaction balance_after = ${kes(Number(last[0].balance_after))}, engine balance = ${kes(engSavings)}.`,
          root_cause: 'balance_after on the latest transaction was not updated after a reversal, adjustment, or concurrent write.',
          recommendation: 'Recompute balance_after for the affected transactions from the engine, or re-post a correcting transaction to resync the snapshot.',
          expected_value: kes(engSavings),
          actual_value: kes(Number(last[0].balance_after)),
          difference: kes(Number(last[0].balance_after) - engSavings),
          affected_records: [m.member_number],
          location: {
            module: 'savings',
            submodule: 'Balance Snapshot',
            database: { table: 'transactions', field: 'balance_after', record_id: m.id },
            backend: { module: BACKEND_MODULE, service: SERVICE, route: ROUTES.balances, method: 'GET', response_value: kes(engSavings) },
            member_id: m.id,
            member_number: m.member_number,
          },
          evidence: [
            evidence({ source_label: 'last transaction', source_type: 'database', field: 'balance_after', actual_value: String(last[0].balance_after) }),
            evidence({ source_label: 'transaction engine', source_type: 'calculation', field: 'savings', actual_value: kes(engSavings) }),
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
          description: `Independent ledger sum = ${kes(ind)}, engine balance = ${kes(eng)}.`,
          root_cause: `The stored ${at} balance is not synchronized with the transaction-derived ledger (a transaction was added/reversed without updating the balance).`,
          recommendation: `Recompute the ${at} balance from SUM(transactions) for the member, or re-post the missing/reversal transaction.`,
          expected_value: kes(ind),
          actual_value: kes(eng),
          difference: kes(ind - eng),
          affected_records: [m.member_number],
          related_tables: ['transactions', 'accounts'],
          location: {
            module: at,
            submodule: 'Account Balance',
            database: { table: 'transactions', field: 'balance_after (latest snapshot)', record_id: m.id },
            backend: { module: BACKEND_MODULE, service: SERVICE, route: ROUTES.balances, method: 'GET', response_value: kes(eng) },
            member_id: m.id,
            member_number: m.member_number,
            source_calculation: `SUM(transactions) WHERE account_type=${at} AND reversed=false`,
          },
          evidence: [
            evidence({ source_label: 'independent ledger sum', source_type: 'calculation', field: at, actual_value: kes(ind) }),
            evidence({ source_label: 'transaction engine', source_type: 'calculation', field: at, actual_value: kes(eng), difference: kes(ind - eng) }),
          ],
        }));
      }
    }
  }

  // Mark systemic if many members have savings mismatches (req. #21).
  if (savingsMismatches.length > 3) {
    for (const f of findings) {
      if (f.module === 'savings' && f.category === 'incorrect_balances') {
        f.is_systemic = true;
        f.affected_records = savingsMismatches;
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
      description: `Sum of savings transactions = ${kes(orgSavingsFromTxns)}, sum of per-member engine balances (capped sample) = ${kes(orgSavingsFromMembers)}.`,
      root_cause: 'The organization aggregate is a denormalized sum that drifted from the per-member engine balances (capped sample vs full ledger).',
      recommendation: 'Recompute the organization savings total from SUM(per-member engine balance) over the full member set, and reconcile any capped-sample discrepancy.',
      expected_value: kes(orgSavingsFromTxns),
      actual_value: kes(orgSavingsFromMembers),
      difference: kes(orgSavingsFromTxns - orgSavingsFromMembers),
      is_systemic: true,
      related_tables: ['transactions'],
      location: {
        module: 'savings',
        submodule: 'Organization Aggregate',
        backend: { module: BACKEND_MODULE, service: SERVICE, route: 'GET /api/v1/dashboard' },
        source_calculation: 'SUM(savings_deposit) - SUM(savings_withdrawal) vs SUM(per-member engine balance)',
      },
      evidence: [
        evidence({ source_label: 'savings transactions', source_type: 'calculation', field: 'org_savings', actual_value: kes(orgSavingsFromTxns) }),
        evidence({ source_label: 'per-member engine sum', source_type: 'calculation', field: 'org_savings', actual_value: kes(orgSavingsFromMembers), difference: kes(orgSavingsFromTxns - orgSavingsFromMembers) }),
      ],
    }));
  }

  return { findings, records_checked: recordsChecked, checks_performed: checksPerformed };
}
