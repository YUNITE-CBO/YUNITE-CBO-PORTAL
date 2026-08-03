/**
 * LOAN SERVICE - Loan eligibility and management
 * 
 * Eligibility = Savings × Loan Percentage (from Settings)
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { transactionEngine } from './transaction.engine';
import { settingsService } from './settings.service';

export interface LoanEligibility {
  savings_balance: number;
  max_percentage: number;
  max_loan_amount: number;
  current_loan_balance: number;
  available_credit: number;
}

export interface LoanApplication {
  member_id: string;
  loan_type: string;
  principal_amount: number;
  repayment_period_months?: number;
  purpose?: string;
  user_id: string;
}

export class LoanService {
  /**
   * Calculate loan eligibility
   * Max Loan = Savings × Loan Percentage
   */
  async calculateEligibility(memberId: string): Promise<LoanEligibility> {
    const [savingsBalance, maxPercentage, maxAmount, currentLoanBalance] = await Promise.all([
      transactionEngine.calculateBalance(memberId, 'savings'),
      settingsService.getNumber('loan.max_percentage', 75),
      settingsService.getNumber('loan.max_amount', 500000),
      transactionEngine.calculateBalance(memberId, 'loans'),
    ]);

    const maxLoanFromSavings = (savingsBalance * maxPercentage) / 100;
    const maxLoanAmount = Math.min(maxLoanFromSavings, maxAmount);
    const availableCredit = Math.max(0, maxLoanAmount - currentLoanBalance);

    return {
      savings_balance: savingsBalance,
      max_percentage: maxPercentage,
      max_loan_amount: maxLoanAmount,
      current_loan_balance: currentLoanBalance,
      available_credit: availableCredit,
    };
  }

  /**
   * Apply for loan
   */
  async apply(application: LoanApplication) {
    const supabase = await createServiceClient();
    
    // Check eligibility
    const eligibility = await this.calculateEligibility(application.member_id);
    
    if (application.principal_amount > eligibility.available_credit) {
      throw new Error(`Loan amount exceeds available credit of ${eligibility.available_credit}`);
    }

    // Get interest rate from settings
    const interestRate = await settingsService.getNumber('loan.default_interest_rate', 10);
    const repaymentPeriod = application.repayment_period_months || 
      await settingsService.getNumber('loan.max_period_months', 12);

    const interestAmount = (application.principal_amount * interestRate) / 100;
    const totalAmount = application.principal_amount + interestAmount;
    const monthlyRepayment = totalAmount / repaymentPeriod;

    // Generate loan number
    const loanNumber = `LN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Create loan record
    const { data: loan, error } = await supabase
      .from('loans')
      .insert({
        id: uuidv4(),
        loan_number: loanNumber,
        member_id: application.member_id,
        loan_type: application.loan_type,
        principal_amount: application.principal_amount,
        interest_rate: interestRate,
        interest_amount: interestAmount,
        total_amount: totalAmount,
        amount_paid: 0,
        amount_due: totalAmount,
        repayment_period_months: repaymentPeriod,
        monthly_repayment: monthlyRepayment,
        purpose: application.purpose,
        status: 'pending',
      })
      .select()
      .single();

    if (error || !loan) throw new Error(`Loan application failed: ${error?.message}`);

    // Audit
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: 'loans.apply',
      record_id: loan.id,
      user_id: application.user_id,
      after_value: { amount: application.principal_amount, type: application.loan_type },
      created_at: new Date().toISOString(),
    });

    return loan;
  }

  /**
   * Get pending loans
   */
  async getPending() {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('loans')
      .select('*, member:members(first_name, last_name, member_number, phone)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    return data || [];
  }

  /**
   * Get all loans
   */
  async getAll() {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('loans')
      .select('*, member:members(first_name, last_name, member_number, phone)')
      .order('created_at', { ascending: false });
    return data || [];
  }

  /**
   * Get loans by status
   */
  async getByStatus(status: string) {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('loans')
      .select('*, member:members(first_name, last_name, member_number, phone)')
      .eq('status', status)
      .order('created_at', { ascending: false });
    return data || [];
  }

  /**
   * Get member loans
   */
  async getByMember(memberId: string) {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('loans')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false });
    return data || [];
  }

  /**
   * Approve a loan
   */
  async approve(loanId: string, userId: string, disbursementDate?: string) {
    const supabase = await createServiceClient();
    
    const { data: loan, error } = await supabase
      .from('loans')
      .update({ 
        status: 'approved',
        disbursement_date: disbursementDate || null,
      })
      .eq('id', loanId)
      .eq('status', 'pending')
      .select()
      .single();

    if (error || !loan) throw new Error('Failed to approve loan');

    // Audit
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: 'loans.approve',
      record_id: loan.id,
      user_id: userId,
      after_value: { status: 'approved' },
      created_at: new Date().toISOString(),
    });

    return loan;
  }

  /**
   * Reject a loan
   */
  async reject(loanId: string, userId: string, reason?: string) {
    const supabase = await createServiceClient();
    
    const { data: loan, error } = await supabase
      .from('loans')
      .update({ 
        status: 'rejected',
      })
      .eq('id', loanId)
      .eq('status', 'pending')
      .select()
      .single();

    if (error || !loan) throw new Error('Failed to reject loan');

    // Audit
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: 'loans.reject',
      record_id: loan.id,
      user_id: userId,
      after_value: { status: 'rejected', reason },
      created_at: new Date().toISOString(),
    });

    return loan;
  }

  /**
   * Disburse a loan
   */
  async disburse(loanId: string, userId: string, disbursementDate?: string) {
    const supabase = await createServiceClient();
    
    // Get the loan details first
    const { data: loan } = await supabase
      .from('loans')
      .select('*')
      .eq('id', loanId)
      .eq('status', 'approved')
      .single();

    if (!loan) throw new Error('Loan not found or not approved');

    // Update loan status
    const { data: updatedLoan, error } = await supabase
      .from('loans')
      .update({ 
        status: 'disbursed',
        disbursement_date: disbursementDate || new Date().toISOString().split('T')[0],
        disbursed_by: userId,
      })
      .eq('id', loanId)
      .select()
      .single();

    if (error || !updatedLoan) throw new Error('Failed to disburse loan');

    // Create a loan account transaction (debit - this is money out)
    const loansAccount = await this.getOrCreateAccount(loan.member_id, 'loans');
    const transactionRef = `LOAN-DISB-${Date.now()}`;
    
    await supabase.from('transactions').insert({
      id: uuidv4(),
      transaction_ref: transactionRef,
      member_id: loan.member_id,
      account_id: loansAccount.id,
      transaction_type: 'loan_disbursement',
      amount: loan.principal_amount,
      description: `Loan disbursement - ${loan.loan_number}`,
      reference_number: loan.loan_number,
      metadata: { loan_id: loan.id },
    });

    // Audit
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: 'loans.disburse',
      record_id: loan.id,
      user_id: userId,
      after_value: { status: 'disbursed', amount: loan.principal_amount },
      created_at: new Date().toISOString(),
    });

    return updatedLoan;
  }

  /**
   * Repay a loan (partial or full)
   */
  async repay(loanId: string, userId: string, amount: number) {
    const supabase = await createServiceClient();
    
    // Get the loan details first
    const { data: loan } = await supabase
      .from('loans')
      .select('*')
      .eq('id', loanId)
      .in('status', ['disbursed', 'active'])
      .single();

    if (!loan) throw new Error('Loan not found or not active');

    // Validate amount
    const remainingAmount = loan.amount_due;
    if (amount > remainingAmount) {
      amount = remainingAmount; // Cap at remaining amount for full repayment
    }

    // Update loan amounts
    const newAmountPaid = loan.amount_paid + amount;
    const newAmountDue = loan.total_amount - newAmountPaid;
    const newStatus = newAmountDue <= 0 ? 'completed' : 'active';

    const { data: updatedLoan, error } = await supabase
      .from('loans')
      .update({ 
        amount_paid: newAmountPaid,
        amount_due: Math.max(0, newAmountDue),
        status: newStatus,
      })
      .eq('id', loanId)
      .select()
      .single();

    if (error || !updatedLoan) throw new Error('Failed to record repayment');

    // Create a loan repayment transaction
    const savingsAccount = await this.getOrCreateAccount(loan.member_id, 'savings');
    const loansAccount = await this.getOrCreateAccount(loan.member_id, 'loans');
    const transactionRef = `LOAN-RPY-${Date.now()}`;
    
    // Debit savings (money out of savings account to pay loan)
    await supabase.from('transactions').insert({
      id: uuidv4(),
      transaction_ref: transactionRef,
      member_id: loan.member_id,
      account_id: savingsAccount.id,
      transaction_type: 'loan_repayment',
      amount: amount,
      description: `Loan repayment - ${loan.loan_number} (${newStatus === 'completed' ? 'FULL' : 'PARTIAL'})`,
      reference_number: loan.loan_number,
      metadata: { loan_id: loan.id, loan_number: loan.loan_number, is_full_repayment: newStatus === 'completed' },
    });

    // Credit loans account
    await supabase.from('transactions').insert({
      id: uuidv4(),
      transaction_ref: `${transactionRef}-C`,
      member_id: loan.member_id,
      account_id: loansAccount.id,
      transaction_type: 'loan_repayment',
      amount: amount,
      description: `Loan repayment received - ${loan.loan_number}`,
      reference_number: loan.loan_number,
      metadata: { loan_id: loan.id, loan_number: loan.loan_number, is_full_repayment: newStatus === 'completed' },
    });

    // Audit
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: 'loans.repay',
      record_id: loan.id,
      user_id: userId,
      after_value: { 
        amount_paid: newAmountPaid, 
        amount_due: Math.max(0, newAmountDue),
        status: newStatus,
        repayment_amount: amount 
      },
      created_at: new Date().toISOString(),
    });

    return updatedLoan;
  }

  /**
   * Get or create account
   */
  private async getOrCreateAccount(memberId: string, accountType: string) {
    const supabase = await createServiceClient();
    
    const { data: existing } = await supabase
      .from('accounts')
      .select('*')
      .eq('member_id', memberId)
      .eq('account_type', accountType)
      .single();

    if (existing) return existing;

    const { data: newAccount } = await supabase
      .from('accounts')
      .insert({ member_id: memberId, account_type: accountType })
      .select()
      .single();

    return newAccount;
  }
}

export const loanService = new LoanService();
