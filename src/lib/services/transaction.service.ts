import { createClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export class TransactionService {
  async postTransaction(params: any) {
    const supabase = await createClient();
    const { data: account } = await supabase.from('accounts').select('*').eq('member_id', params.member_id).eq('account_type', params.account_type).eq('status', 'active').single();
    if (!account) throw new Error('Account not found');
    
    const balanceBefore = Number(account.balance);
    let balanceChange = ['deposit', 'contribution', 'loan_repayment', 'share_purchase', 'interest'].includes(params.transaction_type) ? Math.abs(params.amount) : -Math.abs(params.amount);
    if (params.transaction_type === 'adjustment') balanceChange = params.amount;
    const balanceAfter = balanceBefore + balanceChange;
    
    const id = uuidv4();
    const { data: txn, error } = await supabase.from('transactions').insert({
      id, transaction_ref: `TXN-${id.slice(0,8)}`, account_id: account.id, member_id: params.member_id,
      transaction_type: params.transaction_type, amount: Math.abs(params.amount),
      balance_before: balanceBefore, balance_after: balanceAfter,
      description: params.description, reference_number: params.reference_number,
      posted_by: params.user_id, reversed: false, metadata: params.metadata
    }).select().single();
    
    if (error) throw new Error(error.message);
    await supabase.from('accounts').update({balance: balanceAfter}).eq('id', account.id);
    return txn;
  }

  async reverse(params: any) {
    const supabase = await createClient();
    const { data: orig } = await supabase.from('transactions').select('*').eq('id', params.transaction_id).single();
    if (!orig) throw new Error('Not found');
    if (orig.reversed) throw new Error('Already reversed');
    
    const { data } = await supabase.from('transactions').insert({
      transaction_ref: `REV-${orig.transaction_ref}`, account_id: orig.account_id, member_id: orig.member_id,
      transaction_type: 'reversal', amount: orig.amount, balance_before: orig.balance_after, balance_after: orig.balance_before,
      description: `Reversal: ${params.reason}`, posted_by: params.user_id, metadata: {original_transaction_id: orig.id}
    }).select().single();
    
    await supabase.from('accounts').update({balance: orig.balance_before}).eq('id', orig.account_id);
    await supabase.from('transactions').update({reversed: true, reversed_at: new Date().toISOString(), reversed_by: params.user_id, reversal_reason: params.reason}).eq('id', orig.id);
    return data;
  }

  async getRecent(params: any) {
    const supabase = await createClient();
    const { data, error } = await supabase.from('transactions').select('*,member:members(first_name,last_name,member_number),user:users(full_name)').eq('reversed', false).order('posted_at', {ascending: false}).limit(params.limit || 50);
    if (error) throw new Error(error.message);
    return data || [];
  }

  async getHistory(params: any) {
    const supabase = await createClient();
    const page = params.page || 1, limit = params.limit || 50, offset = (page - 1) * limit;
    let query = supabase.from('transactions').select('*', {count: 'exact'}).eq('member_id', params.member_id).eq('reversed', false);
    if (params.account_type) {
      const { data: accounts } = await supabase.from('accounts').select('id').eq('member_id', params.member_id).eq('account_type', params.account_type);
      if (accounts?.length) query = query.in('account_id', accounts.map((a: any) => a.id));
    }
    if (params.transaction_type) query = query.eq('transaction_type', params.transaction_type);
    const { data, count, error } = await query.order('posted_at', {ascending: false}).range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    return { transactions: data || [], total: count || 0 };
  }
}
export const transactionService = new TransactionService();
