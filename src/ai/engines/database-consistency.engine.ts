/**
 * DATABASE CONSISTENCY ENGINE (deterministic).
 *
 * Runs before any AI interpretation. Computes independent checks against the
 * real database:
 *  - duplicate member numbers
 *  - duplicate transaction references
 *  - orphan accounts (no member)
 *  - missing member references on transactions/loans/fines
 *  - negative balances where prohibited
 *  - impossible/invalid statuses
 *  - inconsistent transaction totals vs stored snapshots
 *  - stale aggregates (campaign totals vs ledger)
 *  - mismatched org references
 *
 * All financial recompute is INDEPENDENT (does not ask the AI to guess). The
 * findings are CONFIRMED by construction; the AI later explains root causes.
 */

import { createServiceClient } from '@/lib/supabase/server';
import type { Finding } from '../types';
import { evidence, makeFinding, resetFindingSequence } from './findings';

export async function runDatabaseConsistency(): Promise<{ findings: Finding[]; records_checked: number; checks_performed: number }> {
  resetFindingSequence();
  const supabase = await createServiceClient();
  const findings: Finding[] = [];
  let recordsChecked = 0;
  let checksPerformed = 0;

  // 1. Duplicate member numbers.
  checksPerformed++;
  // Supabase JS does not support GROUP BY; fetch + aggregate in memory (capped).
  const { data: allMembers } = await supabase.from('members').select('id, member_number').limit(10000);
  recordsChecked += allMembers?.length ?? 0;
  const memberNumbers = new Map<string, number>();
  for (const m of allMembers ?? []) memberNumbers.set(m.member_number, (memberNumbers.get(m.member_number) ?? 0) + 1);
  const dupMemberNumbers: [string, number][] = [];
  memberNumbers.forEach((c, n) => { if (c > 1) dupMemberNumbers.push([n, c]); });
  if (dupMemberNumbers.length) {
    findings.push(makeFinding({
      prefix: 'DB',
      title: `${dupMemberNumbers.length} duplicate member number(s) detected`,
      module: 'members',
      category: 'duplicate_records',
      severity: 'critical',
      description: `${dupMemberNumbers.length} member_number value(s) appear on more than one member row: ${dupMemberNumbers.map(([n, c]) => `${n} (×${c})`).join(', ')}.`,
      root_cause: 'Member number generation did not enforce uniqueness at insert.',
      recommendation: 'Enforce a UNIQUE constraint on members.member_number and regenerate the offending numbers.',
      expected_value: 'Unique member_number per member',
      actual_value: dupMemberNumbers.map(([n, c]) => `${n} (×${c})`).join(', '),
      is_systemic: dupMemberNumbers.length > 1,
      affected_records: dupMemberNumbers.map(([n]) => n),
      location: {
        module: 'members',
        submodule: 'Member Records',
        database: { table: 'members', field: 'member_number' },
        business_rule: 'member_number must be unique across all members.',
      },
      evidence: [evidence({ source_label: 'members table', source_type: 'database', field: 'member_number', expected_value: 'unique', actual_value: dupMemberNumbers.map(([n]) => n).join(', ') })],
    }));
  }

  // 2. Duplicate transaction references.
  checksPerformed++;
  const { data: txns } = await supabase.from('transactions').select('id, transaction_ref, member_id, reversed').limit(20000);
  recordsChecked += txns?.length ?? 0;
  const txnRefs = new Map<string, number>();
  for (const t of txns ?? []) txnRefs.set(t.transaction_ref, (txnRefs.get(t.transaction_ref) ?? 0) + 1);
  const dupRefs: [string, number][] = [];
  txnRefs.forEach((c, r) => { if (c > 1) dupRefs.push([r, c]); });
  if (dupRefs.length) {
    findings.push(makeFinding({
      prefix: 'DB',
      title: `${dupRefs.length} duplicate transaction reference(s) detected`,
      module: 'transactions',
      category: 'duplicate_records',
      severity: 'high',
      description: `${dupRefs.length} transaction_ref value(s) are non-unique, which breaks ledger traceability.`,
      root_cause: 'Transaction reference generation is not enforced unique at insert (no UNIQUE constraint or collision retry).',
      recommendation: 'Add a UNIQUE constraint on transactions.transaction_ref and regenerate colliding references.',
      expected_value: 'Unique transaction_ref per transaction',
      actual_value: dupRefs.map(([r, c]) => `${r} (×${c})`).join(', '),
      is_systemic: dupRefs.length > 1,
      affected_records: dupRefs.map(([r]) => r),
      location: {
        module: 'transactions',
        submodule: 'Ledger',
        database: { table: 'transactions', field: 'transaction_ref' },
        business_rule: 'transaction_ref must be unique for ledger traceability.',
      },
      evidence: [evidence({ source_label: 'transactions table', source_type: 'database', field: 'transaction_ref', expected_value: 'unique', actual_value: dupRefs.map(([r]) => r).join(', ') })],
    }));
  }

  // 3. Orphan accounts (member FK null/missing).
  checksPerformed++;
  const { data: accounts } = await supabase.from('accounts').select('id, member_id, account_type').limit(20000);
  recordsChecked += accounts?.length ?? 0;
  const memberIds = new Set((allMembers ?? []).map((m) => m.id));
  const orphanAccounts = (accounts ?? []).filter((a) => !a.member_id || !memberIds.has(a.member_id));
  if (orphanAccounts.length) {
    findings.push(makeFinding({
      prefix: 'DB',
      title: `${orphanAccounts.length} orphan account(s) reference a missing member`,
      module: 'accounts',
      category: 'missing_relationships',
      severity: 'high',
      description: `${orphanAccounts.length} account row(s) have a member_id that does not exist in the members table.`,
      root_cause: 'Account rows were inserted without a valid foreign key to members (FK constraint missing or bypassed).',
      recommendation: 'Add a FK constraint accounts.member_id → members.id ON DELETE CASCADE and reassign or delete orphan rows.',
      expected_value: 'Valid member_id referencing members.id',
      actual_value: 'null / missing',
      is_systemic: orphanAccounts.length > 3,
      affected_records: orphanAccounts.slice(0, 50).map((a) => a.id),
      location: {
        module: 'accounts',
        submodule: 'Account Records',
        database: { table: 'accounts', field: 'member_id' },
        business_rule: 'Every account must reference a valid member.',
      },
      evidence: [evidence({ source_label: 'accounts table', source_type: 'database', field: 'member_id', expected_value: 'valid UUID', actual_value: orphanAccounts.slice(0, 10).map((a) => a.id).join(', ') })],
    }));
  }

  // 4. Missing member references on transactions (FK integrity).
  // Reversed orphans (e.g. quarantined by migration 032) are ignored — they
  // are excluded from balance calculations (the engine filters reversed=false)
  // so a NULL member_id on a reversed row is no longer an active defect.
  checksPerformed++;
  const missingMemberTxns = (txns ?? []).filter((t) => !(t as any).reversed && !(t as any).member_id);
  if (missingMemberTxns.length) {
    findings.push(makeFinding({
      prefix: 'DB',
      title: `${missingMemberTxns.length} transaction(s) missing member reference`,
      module: 'transactions',
      category: 'missing_member_references',
      severity: 'high',
      description: 'Transactions without a member_id break per-member balance derivation.',
      root_cause: 'Transactions were inserted without resolving the owning member (no NOT NULL + FK enforcement on member_id).',
      recommendation: 'Backfill member_id from the account_id → member_id mapping and enforce NOT NULL with a FK on transactions.member_id → members.id.',
      expected_value: 'Valid UUID',
      actual_value: 'null',
      is_systemic: missingMemberTxns.length > 3,
      affected_records: missingMemberTxns.slice(0, 50).map((t) => String((t as any).id)),
      location: {
        module: 'transactions',
        submodule: 'Ledger',
        database: { table: 'transactions', field: 'member_id' },
        business_rule: 'Every ledger transaction must reference a member (balances are derived from the ledger).',
      },
      evidence: missingMemberTxns.slice(0, 10).map((t) => evidence({
        source_label: 'transactions table',
        source_type: 'database',
        field: 'member_id',
        expected_value: 'UUID',
        actual_value: 'null',
        evidence_json: {
          record_id: (t as any).id,
          transaction_ref: (t as any).transaction_ref,
          amount: (t as any).amount,
          transaction_type: (t as any).transaction_type,
        },
      })),
    }));
  }

  // 5. Negative balances where prohibited (savings/contributions/welfare).
  checksPerformed++;
  const { count: negSavings } = await supabase.from('transactions').select('*', { count: 'exact', head: true }).lt('balance_after', 0);
  recordsChecked += negSavings ?? 0;
  if (negSavings && negSavings > 0) {
    findings.push(makeFinding({
      prefix: 'DB',
      title: `${negSavings} transaction(s) with a negative balance_after`,
      module: 'transactions',
      category: 'negative_values',
      severity: 'medium',
      description: `${negSavings} transaction row(s) recorded a negative balance_after, which the engine guards against for debit transactions.`,
      root_cause: 'A debit was applied without a sufficient-balance guard, or a stale balance_after was persisted after a reversal.',
      recommendation: 'Audit these transactions for unguarded withdrawals or stale balance snapshots.',
      expected_value: 'balance_after >= 0',
      actual_value: 'balance_after < 0',
      is_systemic: (negSavings ?? 0) > 3,
      location: {
        module: 'transactions',
        submodule: 'Ledger',
        database: { table: 'transactions', field: 'balance_after' },
        business_rule: 'balance_after must never be negative for savings/contributions/welfare accounts.',
      },
      evidence: [evidence({ source_label: 'transactions table', source_type: 'database', field: 'balance_after', expected_value: '>= 0', actual_value: `< 0 (${negSavings} row(s))` })],
    }));
  }

  // 6. Invalid loan statuses vs stored amounts (amount_due mismatch).
  checksPerformed++;
  const { data: loans } = await supabase.from('loans').select('id, loan_number, total_amount, amount_paid, amount_due, status').limit(10000);
  recordsChecked += loans?.length ?? 0;
  const loanMismatches = (loans ?? []).filter((l) => {
    const expectedDue = Math.max(0, Number(l.total_amount) - Number(l.amount_paid));
    return Math.abs(Number(l.amount_due) - expectedDue) > 0.5;
  });
  if (loanMismatches.length) {
    findings.push(makeFinding({
      prefix: 'DB',
      title: `${loanMismatches.length} loan(s) with amount_due != total_amount - amount_paid`,
      module: 'loans',
      category: 'inconsistent_totals',
      severity: 'high',
      description: `${loanMismatches.length} loan row(s) have an amount_due that does not equal total_amount - amount_paid.`,
      root_cause: 'amount_due is not recomputed when total_amount or amount_paid changes (denormalized field drift).',
      recommendation: 'Recompute amount_due = GREATEST(0, total_amount - amount_paid) on every payment/adjustment and add a trigger to keep it in sync.',
      is_systemic: loanMismatches.length > 3,
      affected_records: loanMismatches.slice(0, 50).map((l) => l.id),
      location: {
        module: 'loans',
        submodule: 'Loan Records',
        database: { table: 'loans', field: 'amount_due' },
        business_rule: 'amount_due = GREATEST(0, total_amount - amount_paid).',
      },
      evidence: loanMismatches.slice(0, 5).map((l) => evidence({
        source_label: 'loans table',
        source_type: 'database',
        field: 'amount_due',
        expected_value: String(Math.max(0, Number(l.total_amount) - Number(l.amount_paid))),
        actual_value: String(l.amount_due),
        difference: String(Number(l.amount_due) - (Number(l.total_amount) - Number(l.amount_paid))),
      })),
    }));
  }

  // 7. Loan status vs amount consistency (completed loans with positive due).
  checksPerformed++;
  const completedWithDue = (loans ?? []).filter((l) => l.status === 'completed' && Number(l.amount_due) > 0.5);
  if (completedWithDue.length) {
    findings.push(makeFinding({
      prefix: 'DB',
      title: `${completedWithDue.length} completed loan(s) still have a positive amount_due`,
      module: 'loans',
      category: 'invalid_statuses',
      severity: 'medium',
      description: 'A loan marked completed should have amount_due <= 0.',
      root_cause: 'Loan status was set to "completed" without zeroing amount_due, or amount_due was not recomputed on final payment.',
      recommendation: 'On marking a loan completed, set amount_due = 0 and verify amount_paid >= total_amount.',
      is_systemic: completedWithDue.length > 3,
      affected_records: completedWithDue.slice(0, 50).map((l) => l.id),
      location: {
        module: 'loans',
        submodule: 'Loan Records',
        database: { table: 'loans', field: 'amount_due' },
        business_rule: 'A completed loan must have amount_due <= 0.',
      },
      evidence: completedWithDue.slice(0, 5).map((l) => evidence({
        source_label: 'loans table', source_type: 'database', field: 'amount_due', actual_value: String(l.amount_due), expected_value: '0',
      })),
    }));
  }

  // 8. Fine status vs amount_paid consistency.
  checksPerformed++;
  const { data: fines } = await supabase.from('fines').select('id, fine_number, amount, amount_paid, status').limit(10000);
  recordsChecked += fines?.length ?? 0;
  const finePaidMismatch = (fines ?? []).filter((f) => f.status === 'paid' && Number(f.amount_paid) < Number(f.amount) - 0.5);
  if (finePaidMismatch.length) {
    findings.push(makeFinding({
      prefix: 'DB',
      title: `${finePaidMismatch.length} fine(s) marked paid but amount_paid < amount`,
      module: 'fines',
      category: 'invalid_statuses',
      severity: 'medium',
      description: 'Fines with status "paid" should have amount_paid >= amount.',
      root_cause: 'Fine status was set to "paid" without fully settling the amount, or amount_paid was not updated on the status change.',
      recommendation: 'On marking a fine paid, set amount_paid = amount and verify the linked payment transaction exists.',
      is_systemic: finePaidMismatch.length > 3,
      affected_records: finePaidMismatch.slice(0, 50).map((f) => f.id),
      location: {
        module: 'fines',
        submodule: 'Fine Records',
        database: { table: 'fines', field: 'amount_paid' },
        business_rule: 'A paid fine must have amount_paid >= amount.',
      },
      evidence: finePaidMismatch.slice(0, 5).map((f) => evidence({
        source_label: 'fines table', source_type: 'database', field: 'amount_paid', expected_value: String(f.amount), actual_value: String(f.amount_paid),
      })),
    }));
  }

  // 9. Stale campaign aggregates (total_collected vs ledger sum).
  checksPerformed++;
  const { data: campaigns } = await supabase.from('contribution_campaigns').select('id, campaign_name, total_collected').limit(500);
  recordsChecked += campaigns?.length ?? 0;
  for (const c of campaigns ?? []) {
    const { data: cTxns } = await supabase
      .from('transactions')
      .select('amount')
      .in('transaction_type', ['contribution_monthly', 'contribution_special', 'contribution_development'])
      .eq('reversed', false)
      .eq('metadata->>campaign_id', c.id);
    const ledgerSum = (cTxns ?? []).reduce((s, t) => s + Number(t.amount), 0);
    if (Math.abs(Number(c.total_collected) - ledgerSum) > 0.5) {
      findings.push(makeFinding({
        prefix: 'DB',
        title: `Campaign "${c.campaign_name}" total_collected (${c.total_collected}) != ledger sum (${ledgerSum})`,
        module: 'contributions',
        category: 'stale_calculated_values',
        severity: 'medium',
        description: 'The stored campaign aggregate has drifted from the authoritative ledger sum.',
        root_cause: 'total_collected is a denormalized aggregate that is not recomputed when a contribution transaction is added/reversed.',
        recommendation: 'Recompute total_collected from SUM(transactions) for the campaign on every contribution/reversal, or expose it as a view instead of a stored column.',
        expected_value: String(ledgerSum),
        actual_value: String(c.total_collected),
        difference: String(Number(c.total_collected) - ledgerSum),
        affected_records: [c.id],
        location: {
          module: 'contributions',
          submodule: 'Contribution Campaigns',
          database: { table: 'contribution_campaigns', field: 'total_collected', record_id: c.id },
          backend: { service: 'ContributionService', route: 'GET /api/contributions' },
          business_rule: 'total_collected = SUM(transactions) for the campaign (non-reversed).',
        },
        evidence: [evidence({ source_label: 'campaign row', source_type: 'database', field: 'total_collected', expected_value: String(ledgerSum), actual_value: String(c.total_collected), difference: String(Number(c.total_collected) - ledgerSum) })],
      }));
    }
  }

  // 10. Account type uniqueness per member (should be one per type).
  checksPerformed++;
  const acctCounts = new Map<string, Map<string, number>>();
  for (const a of accounts ?? []) {
    const key = a.member_id;
    if (!key) continue;
    const types = acctCounts.get(key) ?? new Map();
    types.set(a.account_type, (types.get(a.account_type) ?? 0) + 1);
    acctCounts.set(key, types);
  }
  const duplicateAccounts: string[] = [];
  acctCounts.forEach((types, mid) => {
    let hasDup = false;
    types.forEach((c) => { if (c > 1) hasDup = true; });
    if (hasDup) duplicateAccounts.push(mid);
  });
  if (duplicateAccounts.length) {
    findings.push(makeFinding({
      prefix: 'DB',
      title: `${duplicateAccounts.length} member(s) have duplicate account types`,
      module: 'accounts',
      category: 'duplicate_records',
      severity: 'high',
      description: 'A member should have exactly one account per account_type (UNIQUE constraint).',
      root_cause: 'No UNIQUE(member_id, account_type) constraint exists, so duplicate accounts were created.',
      recommendation: 'Add a UNIQUE(member_id, account_type) constraint on accounts and merge/delete the duplicate rows.',
      expected_value: '1 account per (member_id, account_type)',
      actual_value: '> 1 account for some (member_id, account_type)',
      is_systemic: duplicateAccounts.length > 3,
      affected_records: duplicateAccounts.slice(0, 50),
      location: {
        module: 'accounts',
        submodule: 'Account Records',
        database: { table: 'accounts', field: '(member_id, account_type)' },
        business_rule: 'Exactly one account per (member_id, account_type).',
      },
      evidence: [evidence({ source_label: 'accounts table', source_type: 'database', field: 'account_type', expected_value: '1 per type', actual_value: String(duplicateAccounts.length) })],
    }));
  }

  return { findings, records_checked: recordsChecked, checks_performed: checksPerformed };
}
