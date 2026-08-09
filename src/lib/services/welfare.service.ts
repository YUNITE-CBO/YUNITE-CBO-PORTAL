/**
 * Welfare Service — thin orchestration over the Transaction Engine.
 *
 * Welfare balances are derived from the transactions ledger; this service
 * only orchestrates the domain record + delegates ledger movement.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { transactionEngine } from './transaction.engine';

export interface WelfareDepositInput {
  member_id: string;
  amount: number;
  description?: string;
  reference_number?: string;
  type?: 'deposit' | 'disbursement';
}

export class WelfareService {
  async list(memberId?: string) {
    const supabase = await createServiceClient();
    let q = supabase
      .from('transactions')
      .select('id, transaction_ref, member_id, amount, transaction_type, description, reference_number, metadata, posted_at, created_at, member:members(id, member_number, first_name, last_name)')
      .in('transaction_type', ['welfare_deposit', 'welfare_disbursement'])
      .eq('reversed', false);
    if (memberId) q = q.eq('member_id', memberId);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    const totals = await this.summary();
    return { transactions: data ?? [], summary: totals };
  }

  async summary() {
    const supabase = await createServiceClient();
    const [deposits, disbursements] = await Promise.all([
      supabase.from('transactions').select('amount').eq('transaction_type', 'welfare_deposit').eq('reversed', false),
      supabase.from('transactions').select('amount').eq('transaction_type', 'welfare_disbursement').eq('reversed', false),
    ]);
    const totalDeposits = (deposits.data ?? []).reduce((s, t) => s + Number(t.amount), 0);
    const totalDisbursements = (disbursements.data ?? []).reduce((s, t) => s + Number(t.amount), 0);
    return { total_deposits: totalDeposits, total_disbursements: totalDisbursements, balance: totalDeposits - totalDisbursements };
  }

  async record(input: WelfareDepositInput, userId: string) {
    const isDisbursement = input.type === 'disbursement';
    // Ledger movement delegated to the authoritative Transaction Engine.
    const result = await transactionEngine.execute({
      member_id: input.member_id,
      account_type: 'welfare',
      transaction_type: isDisbursement ? 'welfare_disbursement' : 'welfare_deposit',
      amount: input.amount,
      description: input.description ?? (isDisbursement ? 'Welfare disbursement' : 'Welfare deposit'),
      reference_number: input.reference_number,
      user_id: userId,
    });
    return result;
  }
}

export const welfareService = new WelfareService();
