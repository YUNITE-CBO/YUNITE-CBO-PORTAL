/**
 * TRANSACTION ENGINE - The Heart of YUNITE
 * 
 * Every financial operation passes through this engine.
 * No module directly updates balances.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { notificationEventService } from './notifications';

export type TransactionType =
  | 'savings_deposit'
  | 'savings_withdrawal'
  | 'savings_adjustment'
  | 'registration_fee'
  | 'annual_fee'
  | 'contribution_monthly'
  | 'contribution_special'
  | 'contribution_development'
  | 'welfare_deposit'
  | 'welfare_disbursement'
  | 'fine_posting'
  | 'fine_payment'
  | 'loan_disbursement'
  | 'loan_repayment'
  | 'reversal';

export type AccountType = 'savings' | 'shares' | 'contributions' | 'welfare' | 'fines' | 'loans';

export interface TransactionRequest {
  member_id: string;
  account_type: AccountType;
  transaction_type: TransactionType;
  amount: number;
  description?: string;
  reference_number?: string;
  metadata?: Record<string, unknown>;
  user_id: string;
}

export interface CalculatedBalances {
  savings: number;
  shares: number;
  contributions: number;
  welfare: number;
  fines: number;
  loans: number;
}

export class TransactionEngine {
  /**
   * Execute a financial transaction
   */
  async execute(request: TransactionRequest) {
    const supabase = await createServiceClient();

    // Validate
    if (!request.member_id || !request.account_type || !request.transaction_type || !request.amount) {
      throw new Error('Missing required fields');
    }

    // Get account
    const { data: account } = await supabase
      .from('accounts')
      .select('*')
      .eq('member_id', request.member_id)
      .eq('account_type', request.account_type)
      .eq('status', 'active')
      .single();

    if (!account) throw new Error('Account not found');

    // Calculate current balance from ledger
    const currentBalance = await this.calculateBalance(request.member_id, request.account_type);

    // Calculate new balance
    const newBalance = this.calculateNewBalance(currentBalance, request.transaction_type, request.amount);

    // Validate sufficient balance for withdrawals
    if (newBalance < 0 && this.isDebitTransaction(request.transaction_type)) {
      throw new Error('Insufficient balance');
    }

    // Generate reference
    const transactionRef = this.generateTransactionRef(request.transaction_type);

    // Create transaction
    const { data: transaction, error } = await supabase
      .from('transactions')
      .insert({
        id: uuidv4(),
        transaction_ref: transactionRef,
        account_id: account.id,
        member_id: request.member_id,
        transaction_type: request.transaction_type,
        amount: request.amount,
        balance_before: currentBalance,
        balance_after: newBalance,
        description: request.description,
        reference_number: request.reference_number,
        posted_by: request.user_id,
        reversed: false,
        metadata: request.metadata,
      })
      .select()
      .single();

    if (error || !transaction) throw new Error(`Transaction failed: ${error?.message}`);

    // Audit log
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: `transactions.${request.transaction_type}`,
      record_id: transaction.id,
      user_id: request.user_id,
      after_value: { balance: newBalance, ref: transactionRef },
      created_at: new Date().toISOString(),
    });

    // Emit notification event for deposits and withdrawals
    try {
      const { data: member } = await supabase
        .from('members')
        .select('id, first_name, last_name, email')
        .eq('id', request.member_id)
        .single();

      if (member) {
        if (request.transaction_type === 'savings_deposit') {
          await notificationEventService.emitSavingsDeposit(
            member.id,
            `${member.first_name} ${member.last_name}`,
            request.amount,
            newBalance,
            transactionRef
          );
        }
      }
    } catch (notifError) {
      console.error('Failed to emit transaction notification:', notifError);
    }

    // Calculate all balances
    const balances = await this.calculateAllBalances(request.member_id);

    return { transaction, balances };
  }

  /**
   * Reverse a transaction
   */
  async reverse(transactionId: string, userId: string, reason: string) {
    const supabase = await createServiceClient();

    // Get original transaction
    const { data: original, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (fetchError || !original) {
      console.error('Error fetching original transaction:', fetchError);
      throw new Error('Transaction not found');
    }
    
    console.log('Reversing transaction:', {
      id: original.id,
      type: original.transaction_type,
      amount: original.amount,
      metadata: original.metadata
    });

    if (original.reversed) throw new Error('Already reversed');

    const reversalRef = `REV-${original.transaction_ref}`;
    const isDebitOriginal = this.isDebitTransaction(original.transaction_type as TransactionType);
    const balanceChange = isDebitOriginal ? Number(original.amount) : -Number(original.amount);

    // Create reversal transaction
    const { data: reversal, error: insertError } = await supabase
      .from('transactions')
      .insert({
        id: uuidv4(),
        transaction_ref: reversalRef,
        account_id: original.account_id,
        member_id: original.member_id,
        transaction_type: 'reversal',
        amount: original.amount,
        balance_before: original.balance_after,
        balance_after: Number(original.balance_after) + balanceChange,
        description: `Reversal: ${reason}`,
        posted_by: userId,
        reversed: false,
        metadata: { original_transaction_id: original.id },
      })
      .select()
      .single();

    if (insertError || !reversal) {
      console.error('Error creating reversal:', insertError);
      throw new Error('Reversal failed');
    }
    
    console.log('Reversal transaction created:', reversal.id);

    // Update original transaction as reversed
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        reversed: true,
        reversed_at: new Date().toISOString(),
        reversed_by: userId,
        reversal_reason: reason,
      })
      .eq('id', original.id);

    if (updateError) {
      console.error('Error marking original as reversed:', updateError);
    } else {
      console.log('Original transaction marked as reversed');
    }

    // SPECIAL HANDLING FOR LOAN DISBURSEMENTS
    // Reverse the disbursement effect on loan
    if (original.transaction_type === 'loan_disbursement' && original.metadata?.loan_id) {
      const loanId = original.metadata.loan_id;
      console.log('Reversing loan disbursement for loan:', loanId);
      
      const { data: loan } = await supabase
        .from('loans')
        .select('*')
        .eq('id', loanId)
        .single();

      if (loan) {
        // Revert loan status to approved (awaiting actual disbursement)
        const { error: loanUpdateError } = await supabase
          .from('loans')
          .update({
            status: 'approved',
            disbursement_date: null,
            disbursed_by: null,
          })
          .eq('id', loanId);
        
        if (loanUpdateError) {
          console.error('Error reverting loan disbursement:', loanUpdateError);
        } else {
          console.log('Loan disbursement reverted:', { loanId });
        }
      }
    }

    // SPECIAL HANDLING FOR LOAN REPAYMENTS
    if (original.transaction_type === 'loan_repayment' && original.metadata?.loan_id) {
      const loanId = original.metadata.loan_id;
      console.log('Reversing loan repayment for loan:', loanId);
      
      const { data: loan } = await supabase
        .from('loans')
        .select('*')
        .eq('id', loanId)
        .single();

      if (loan) {
        // Reverse the payment effect on loan
        const newAmountPaid = Math.max(0, Number(loan.amount_paid) - Number(original.amount));
        const newAmountDue = Number(loan.total_amount) - newAmountPaid;
        
        // Determine new status based on payment state
        let newStatus = 'active';
        if (newAmountPaid <= 0) {
          newStatus = 'disbursed'; // No payments made yet
        } else if (newAmountDue <= 0) {
          newStatus = 'completed'; // Fully paid
        }
        // else 'active' - partially paid

        const { error: loanUpdateError } = await supabase
          .from('loans')
          .update({
            amount_paid: newAmountPaid,
            amount_due: Math.max(0, newAmountDue),
            status: newStatus,
          })
          .eq('id', loanId);
        
        if (loanUpdateError) {
          console.error('Error updating loan:', loanUpdateError);
        } else {
          console.log('Loan updated:', { newAmountPaid, newAmountDue, newStatus });
        }
      }
    }

    // SPECIAL HANDLING FOR FINE POSTINGS (issuing a fine)
    // When reversing a fine posting, we need to mark the fine as waived
    if (original.transaction_type === 'fine_posting' && original.metadata?.fine_id) {
      const fineId = original.metadata.fine_id;
      console.log('Reversing fine posting for fine:', fineId);
      
      const { error: fineUpdateError } = await supabase
        .from('fines')
        .update({
          status: 'waived',
          waived_by: userId,
          waived_at: new Date().toISOString(),
          waiver_reason: `Reversed: ${reason}`,
        })
        .eq('id', fineId);

      if (fineUpdateError) {
        console.error('Error waiving fine:', fineUpdateError);
      } else {
        console.log('Fine waived:', { fineId });
      }
    }

    // SPECIAL HANDLING FOR FINE PAYMENTS
    // Need to update the fine record to reverse the payment
    if (original.transaction_type === 'fine_payment' && original.metadata?.fine_id) {
      const fineId = original.metadata.fine_id;
      console.log('Reversing fine payment for fine:', fineId);
      
      const { data: fine } = await supabase
        .from('fines')
        .select('*')
        .eq('id', fineId)
        .single();

      if (fine) {
        // The fine.amount_paid currently INCLUDES this payment
        // Subtract the payment amount to get the prior state
        const priorAmountPaid = Math.max(0, Number(fine.amount_paid) - Number(original.amount));
        
        // Determine status based on what's been paid
        let newStatus = 'pending';
        if (priorAmountPaid >= Number(fine.amount)) {
          newStatus = 'paid';
        } else if (priorAmountPaid > 0) {
          newStatus = 'partial';
        }
        // If priorAmountPaid <= 0, status stays 'pending'

        // Clear paid_date if status is not 'paid'
        const paidDate = newStatus === 'paid' ? fine.paid_date : null;

        const { error: fineUpdateError } = await supabase.from('fines').update({
          amount_paid: priorAmountPaid,
          status: newStatus,
          paid_date: paidDate,
        }).eq('id', fineId);

        if (fineUpdateError) {
          console.error('Error updating fine:', fineUpdateError);
        } else {
          console.log('Fine updated:', { priorAmountPaid, newStatus });
        }
      }
    }

    // SPECIAL HANDLING FOR CONTRIBUTIONS
    // Need to recalculate campaign totals if this was a campaign contribution
    const contributionTypes = ['contribution_monthly', 'contribution_special', 'contribution_development'];
    if (contributionTypes.includes(original.transaction_type) && original.metadata?.campaign_id) {
      const campaignId = original.metadata.campaign_id;
      console.log('Reversing contribution for campaign:', campaignId);
      
      // Recalculate campaign totals from non-reversed transactions of THIS campaign
      // Filter by both transaction_type AND campaign_id in metadata
      const { data: campaignTxns } = await supabase
        .from('transactions')
        .select('id, amount, metadata')
        .eq('transaction_type', original.transaction_type)
        .eq('reversed', false);

      // Filter transactions that belong to this specific campaign
      const relevantTxns = campaignTxns?.filter(t => 
        t.metadata && typeof t.metadata === 'object' && (t.metadata as any).campaign_id === campaignId
      ) || [];

      const totalAmount = relevantTxns.reduce((sum, t) => sum + Number(t.amount), 0);
      const count = relevantTxns.length;

      const { error: campaignUpdateError } = await supabase.from('campaigns').update({
        collected_amount: totalAmount,
        contribution_count: count,
      }).eq('id', campaignId);

      if (campaignUpdateError) {
        console.error('Error updating campaign:', campaignUpdateError);
      } else {
        console.log('Campaign updated:', { campaignId, totalAmount, count });
      }
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: 'transactions.reverse',
      record_id: reversal.id,
      user_id: userId,
      after_value: { original_id: original.id, reason },
      created_at: new Date().toISOString(),
    });

    // Calculate final balances
    const balances = await this.calculateAllBalances(original.member_id);
    console.log('Final balances:', balances);
    
    return { reversal, balances };
  }

  /**
   * Get transaction history
   */
  async getHistory(params: {
    member_id: string;
    account_type?: AccountType;
    start_date?: string;
    end_date?: string;
    page?: number;
    limit?: number;
  }) {
    const supabase = await createServiceClient();
    const page = params.page || 1;
    const limit = params.limit || 50;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('member_id', params.member_id)
      .eq('reversed', false);

    if (params.start_date) query = query.gte('created_at', params.start_date);
    if (params.end_date) query = query.lte('created_at', params.end_date);

    const { data, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    return {
      transactions: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  /**
   * Calculate balance from ledger (NOT stored)
   * Only includes non-reversed, non-reversal transactions
   */
  async calculateBalance(memberId: string, accountType: AccountType): Promise<number> {
    const supabase = await createServiceClient();

    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('member_id', memberId)
      .eq('account_type', accountType)
      .single();

    if (!account) return 0;

    // Get all non-reversed transactions EXCLUDING reversal transactions
    // Reversal transactions are excluded because they have their own balance_after recorded
    const { data: txns } = await supabase
      .from('transactions')
      .select('transaction_type, amount')
      .eq('account_id', account.id)
      .eq('reversed', false)
      .neq('transaction_type', 'reversal');

    if (!txns) return 0;

    let balance = 0;
    for (const txn of txns) {
      if (this.isDebitTransaction(txn.transaction_type as TransactionType)) {
        balance -= Number(txn.amount);
      } else {
        balance += Number(txn.amount);
      }
    }
    return balance;
  }

  /**
   * Calculate all balances for a member
   */
  async calculateAllBalances(memberId: string): Promise<CalculatedBalances> {
    const [savings, contributions, welfare, fines, shareValue] = await Promise.all([
      this.calculateBalance(memberId, 'savings'),
      this.calculateBalance(memberId, 'contributions'),
      this.calculateBalance(memberId, 'welfare'),
      this.calculateBalance(memberId, 'fines'),
      this.getShareValue(),
    ]);

    const shares = Math.floor(savings / shareValue);
    const loans = await this.calculateLoanBalance(memberId);

    return { savings, shares, contributions, welfare, fines, loans };
  }

  /**
   * Get share value from settings
   */
  private async getShareValue(): Promise<number> {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'shares.share_value')
      .single();
    return data ? parseFloat(data.value) : 100;
  }

  /**
   * Calculate loan balance
   */
  private async calculateLoanBalance(memberId: string): Promise<number> {
    const supabase = await createServiceClient();
    const { data: loans } = await supabase
      .from('loans')
      .select('amount_due')
      .eq('member_id', memberId)
      .in('status', ['approved', 'disbursed', 'active']);
    return loans?.reduce((sum, l) => sum + Number(l.amount_due || 0), 0) || 0;
  }

  private isDebitTransaction(type: TransactionType): boolean {
    // NOTE: loan_disbursement is NOT a debit - it INCREASES the outstanding loan balance
    // The loans account balance represents money OWED by the member
    // - loan_disbursement: increases (owes more)
    // - loan_repayment: decreases (paying down debt)
    const debitTypes: TransactionType[] = [
      'savings_withdrawal', 'registration_fee', 'annual_fee',
      'welfare_disbursement', 'fine_payment',
      // 'loan_disbursement' removed - it INCREASES the loans balance (what's owed)
    ];
    return debitTypes.includes(type);
  }

  private calculateNewBalance(current: number, type: TransactionType, amount: number): number {
    if (type === 'savings_adjustment') return current + amount;
    if (this.isDebitTransaction(type)) return current - amount;
    return current + amount;
  }

  private generateTransactionRef(type: TransactionType): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefixes: Record<string, string> = {
      savings_deposit: 'SDP', savings_withdrawal: 'SWD', savings_adjustment: 'SAD',
      registration_fee: 'RGF', annual_fee: 'ANF', contribution_monthly: 'CMT',
      contribution_special: 'CSP', contribution_development: 'CDV', welfare_deposit: 'WFD',
      welfare_disbursement: 'WFW', fine_posting: 'FNP', fine_payment: 'FNP',
      loan_disbursement: 'LND', loan_repayment: 'LNR', reversal: 'REV',
    };
    const prefix = prefixes[type] || 'TRN';
    return `TXN-${date}-${prefix}-${uuidv4().split('-')[0]}`;
  }
}

export const transactionEngine = new TransactionEngine();
