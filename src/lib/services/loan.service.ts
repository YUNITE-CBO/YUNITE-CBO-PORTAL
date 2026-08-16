/**
 * LOAN SERVICE - Loan eligibility and management
 * 
 * Eligibility = Savings × Loan Percentage (from Settings)
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { transactionEngine } from './transaction.engine';
import { settingsService } from './settings.service';
import { notificationEventService, notificationService } from './notifications';
import { unityFundEngine } from './unity-fund.engine';

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
    const minPeriod = await settingsService.getNumber('loan.min_period_months', 1);
    const maxPeriod = await settingsService.getNumber('loan.max_period_months', 12);
    const defaultPeriod = await settingsService.getNumber('loan.default_period_months', maxPeriod);

    // Validate repayment period: must be within the configured [min, max] range.
    // Per-loan overrides within the range (e.g. 3 months when default is 12) are
    // legitimate and must NOT be rejected — only out-of-range values are.
    let repaymentPeriod = application.repayment_period_months || defaultPeriod;
    repaymentPeriod = Math.round(repaymentPeriod);
    if (repaymentPeriod < minPeriod) {
      throw new Error(`Repayment period must be at least ${minPeriod} month(s).`);
    }
    if (repaymentPeriod > maxPeriod) {
      throw new Error(`Repayment period cannot exceed the configured maximum of ${maxPeriod} months.`);
    }

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

    // Emit notification event
    try {
      const { data: member } = await supabase
        .from('members')
        .select('id, first_name, last_name, email, phone')
        .eq('id', application.member_id)
        .single();

      if (member) {
        await notificationEventService.emitLoanApplication(loan.id, loan, member, application.user_id);
      }
    } catch (notifError) {
      console.error('Failed to emit loan application notification:', notifError);
    }

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

    // Emit notification event
    try {
      const { data: member } = await supabase
        .from('members')
        .select('id, first_name, last_name, email, phone')
        .eq('id', loan.member_id)
        .single();

      if (member) {
        await notificationService.sendFromTemplate(
          'loan.approved',
          { id: member.id, type: 'member', email: member.email || undefined, phone: member.phone || undefined, name: `${member.first_name} ${member.last_name}` },
          {
            loan_id: loan.id,
            loan_number: loan.loan_number,
            member_name: `${member.first_name} ${member.last_name}`,
            principal_amount: loan.principal_amount,
            currency: 'KES',
            interest_amount: loan.interest_amount,
            total_amount: loan.total_amount,
            monthly_repayment: loan.monthly_repayment,
            approval_date: new Date().toISOString().split('T')[0],
          },
          {
            source_module: 'loan-management',
            source_entity_type: 'loan',
            source_entity_id: loan.id,
            source_action: 'loan.approved',
          }
        );
      }
    } catch (notifError) {
      console.error('Failed to emit loan approval notification:', notifError);
    }

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

    // Emit notification event
    try {
      const { data: member } = await supabase
        .from('members')
        .select('id, first_name, last_name, email, phone')
        .eq('id', loan.member_id)
        .single();

      if (member) {
        await notificationService.sendFromTemplate(
          'loan.rejected',
          { id: member.id, type: 'member', email: member.email || undefined, phone: member.phone || undefined, name: `${member.first_name} ${member.last_name}` },
          {
            loan_id: loan.id,
            loan_number: loan.loan_number,
            member_name: `${member.first_name} ${member.last_name}`,
            rejection_reason: reason || 'Application did not meet requirements',
            rejection_date: new Date().toISOString().split('T')[0],
          },
          {
            source_module: 'loan-management',
            source_entity_type: 'loan',
            source_entity_id: loan.id,
            source_action: 'loan.rejected',
          }
        );
      }
    } catch (notifError) {
      console.error('Failed to emit loan rejection notification:', notifError);
    }

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

    // Get or create loans account for this member
    const loansAccount = await this.getOrCreateAccount(loan.member_id, 'loans');

    // Calculate balance for the disbursement transaction
    // balanceBefore = 0 (member has no prior loan balance in this account)
    // balanceAfter = principal_amount (the amount disbursed - increases what member owes)
    const balanceBefore = 0;
    const balanceAfter = Number(loan.principal_amount);

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

    // Create a loan disbursement transaction record
    const transactionRef = `LOAN-DISB-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    
    await supabase.from('transactions').insert({
      id: uuidv4(),
      transaction_ref: transactionRef,
      member_id: loan.member_id,
      account_id: loansAccount.id,
      transaction_type: 'loan_disbursement',
      amount: loan.principal_amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: `Loan disbursement - ${loan.loan_number}`,
      reference_number: loan.loan_number,
      posted_by: userId,
      reversed: false,
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

    // Emit notification event
    try {
      const { data: member } = await supabase
        .from('members')
        .select('id, first_name, last_name, email, phone')
        .eq('id', loan.member_id)
        .single();

      if (member) {
        await notificationService.sendFromTemplate(
          'loan.disbursed',
          { id: member.id, type: 'member', email: member.email || undefined, phone: member.phone || undefined, name: `${member.first_name} ${member.last_name}` },
          {
            loan_id: loan.id,
            loan_number: loan.loan_number,
            member_name: `${member.first_name} ${member.last_name}`,
            amount: loan.principal_amount,
            currency: 'KES',
            disbursement_date: updatedLoan.disbursement_date || new Date().toISOString().split('T')[0],
            repayment_start_date: updatedLoan.repayment_start_date || updatedLoan.disbursement_date,
            monthly_repayment: loan.monthly_repayment,
          },
          {
            source_module: 'loan-management',
            source_entity_type: 'loan',
            source_entity_id: loan.id,
            source_action: 'loan.disbursed',
          }
        );
      }
    } catch (notifError) {
      console.error('Failed to emit loan disbursement notification:', notifError);
    }

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

    // Get or create loans account for this member
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('member_id', loan.member_id)
      .eq('account_type', 'loans')
      .single();

    let accountId;
    if (account) {
      accountId = account.id;
    } else {
      const { data: newAccount } = await supabase
        .from('accounts')
        .insert({ member_id: loan.member_id, account_type: 'loans' })
        .select('id')
        .single();
      accountId = newAccount?.id;
    }

    // Calculate balance before from loan amount_due (loan balance is tracked separately)
    const balanceBefore = loan.amount_due;
    const balanceAfter = newAmountDue;

    // Create a single loan repayment transaction
    const transactionRef = `LOAN-RPY-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    
    await supabase.from('transactions').insert({
      id: uuidv4(),
      transaction_ref: transactionRef,
      member_id: loan.member_id,
      account_id: accountId,
      transaction_type: 'loan_repayment',
      amount: amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: `Loan repayment - ${loan.loan_number} (${newStatus === 'completed' ? 'FULL' : 'PARTIAL'})`,
      reference_number: loan.loan_number,
      posted_by: userId,
      reversed: false,
      metadata: { loan_id: loan.id, loan_number: loan.loan_number, is_full_repayment: newStatus === 'completed' },
    });

    // -----------------------------------------------------------------
    // LOAN INTEREST SEPARATION (Unity Fund rule §24, RULE 7-8):
    //   Loan Principal → Member/loan account (the loan_repayment above).
    //   Loan Interest  → Unity Fund (organization money).
    // The repayment amount is split pro-rata: the interest portion of THIS
    // payment is recorded as a Unity Fund actual inflow so it does NOT
    // inflate the member's personal financial position. The principal
    // portion stays on the member/loan account.
    // Idempotent: linked to the source repayment transaction via
    // repayment_transaction_id, so a reversal of the repayment can reverse
    // the interest receipt too (no duplicate Unity Fund entries).
    // -----------------------------------------------------------------
    await this.recordLoanInterestReceipt(loan, amount, transactionRef, userId, supabase);

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

    // Emit notification event
    try {
      const { data: member } = await supabase
        .from('members')
        .select('id, first_name, last_name, email, phone')
        .eq('id', loan.member_id)
        .single();

      if (member) {
        // Send repayment confirmation
        const templateCode = newStatus === 'completed' ? 'loan.repayment_complete' : 'savings.withdrawal';
        
        if (newStatus === 'completed') {
          await notificationService.sendFromTemplate(
            'loan.repayment_complete',
            { id: member.id, type: 'member', email: member.email || undefined, phone: member.phone || undefined, name: `${member.first_name} ${member.last_name}` },
            {
              loan_id: loan.id,
              loan_number: loan.loan_number,
              member_name: `${member.first_name} ${member.last_name}`,
              total_repaid: newAmountPaid,
              currency: 'KES',
              completion_date: new Date().toISOString().split('T')[0],
            },
            {
              source_module: 'loan-management',
              source_entity_type: 'loan',
              source_entity_id: loan.id,
              source_action: 'loan.repayment_complete',
            }
          );
        }
      }
    } catch (notifError) {
      console.error('Failed to emit loan repayment notification:', notifError);
    }

    return updatedLoan;
  }

  /**
   * Split a loan repayment into principal vs interest and record the
   * INTEREST portion as a Unity Fund actual inflow (organization money).
   *
   * The split is pro-rata against the loan's total interest/principal ratio,
   * capped at the remaining un-received interest for the loan so cumulative
   * interest receipts never exceed the loan's total interest_amount.
   *
   * Principal stays on the member/loan account (the loan_repayment
   * transaction). Only the interest portion reaches the Unity Fund, so a
   * member's personal financial position is never inflated by interest.
   *
   * Idempotent: linked to the source repayment transaction via
   * repayment_transaction_id (looked up before insert).
   */
  private async recordLoanInterestReceipt(
    loan: Record<string, unknown>,
    repaymentAmount: number,
    repaymentTransactionRef: string,
    userId: string,
    supabase: Awaited<ReturnType<typeof createServiceClient>>,
  ): Promise<void> {
    try {
      const principal = Number(loan.principal_amount) || 0;
      const totalInterest = Number(loan.interest_amount) || 0;
      const totalAmount = Number(loan.total_amount) || (principal + totalInterest);
      if (totalInterest <= 0 || totalAmount <= 0) return; // no interest to separate

      // Pro-rata interest portion of THIS payment.
      const interestRatio = totalInterest / totalAmount;
      let interestPortion = repaymentAmount * interestRatio;
      const principalPortion = repaymentAmount - interestPortion;

      // Cap at remaining un-received interest for the loan (cumulative guard).
      const { data: priorReceipts } = await supabase
        .from('loan_interest_receipts')
        .select('interest_amount')
        .eq('loan_id', String(loan.id))
        .eq('status', 'received');
      const alreadyReceived = (priorReceipts ?? []).reduce((s, r) => s + Number(r.interest_amount), 0);
      const remainingInterest = Math.max(0, totalInterest - alreadyReceived);
      interestPortion = Math.min(interestPortion, remainingInterest);
      if (interestPortion <= 0) return;

      // Look up the source repayment transaction id for the idempotency link.
      const { data: repaymentTxn } = await supabase
        .from('transactions')
        .select('id')
        .eq('transaction_ref', repaymentTransactionRef)
        .maybeSingle();

      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const receiptNumber = `LOAN-INT-${date}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      await supabase.from('loan_interest_receipts').insert({
        id: uuidv4(),
        receipt_number: receiptNumber,
        loan_id: String(loan.id),
        loan_number: String(loan.loan_number),
        member_id: String(loan.member_id),
        interest_amount: interestPortion,
        principal_portion: principalPortion,
        repayment_transaction_id: repaymentTxn?.id ?? null,
        received_date: new Date().toISOString(),
        status: 'received',
        recorded_by: userId,
      });

      // Audit the interest separation.
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        action: 'unity_fund.loan_interest.receive',
        record_id: String(loan.id),
        user_id: userId,
        after_value: {
          loan_number: loan.loan_number,
          repayment_amount: repaymentAmount,
          interest_portion: interestPortion,
          principal_portion: principalPortion,
          receipt_number: receiptNumber,
          note: 'Interest routed to Unity Fund (org money); principal stays on member/loan account.',
        },
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      // Interest separation must never break the core repayment flow.
      console.error('[loan-service] loan interest receipt failed:', err instanceof Error ? err.message : err);
    }
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
