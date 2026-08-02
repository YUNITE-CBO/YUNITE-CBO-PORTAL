/**
 * LOAN SERVICE - Loan eligibility and management
 * 
 * Eligibility = Savings × Loan Percentage (from Settings)
 */

import { createClient } from '@/lib/supabase/server';
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
    const supabase = await createClient();
    
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

    // Create loan record
    const { data: loan, error } = await supabase
      .from('loans')
      .insert({
        id: uuidv4(),
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
    const supabase = await createClient();
    const { data } = await supabase
      .from('loans')
      .select('*, member:members(first_name, last_name, member_number, phone)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    return data || [];
  }

  /**
   * Get member loans
   */
  async getByMember(memberId: string) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('loans')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false });
    return data || [];
  }
}

export const loanService = new LoanService();
