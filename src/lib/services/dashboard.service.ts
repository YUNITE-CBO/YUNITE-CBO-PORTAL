/**
 * DASHBOARD SERVICE - Live calculations, never stored
 */

import { createServiceClient } from '@/lib/supabase/server';
import { transactionEngine } from './transaction.engine';

export interface DashboardStats {
  total_members: number;
  active_members: number;
  pending_members: number;
  total_savings: number;
  total_shares: number;
  total_contributions: number;
  total_welfare: number;
  total_fines_pending: number;
  total_loans_outstanding: number;
  total_loan_repayments: number;
  // Loan counts
  total_loan_applications: number;
  pending_loan_applications: number;
  active_loans: number;
}

export interface ActivityItem {
  id: string;
  type: string;
  description: string;
  amount?: number;
  member_name?: string;
  user_name?: string;
  created_at: string;
}

export interface DashboardAlert {
  type: 'warning' | 'error' | 'info';
  title: string;
  message: string;
}

export class DashboardService {
  /**
   * Get live dashboard stats
   * All values calculated from authoritative sources
   */
  async getStats(): Promise<DashboardStats> {
    const supabase = await createServiceClient();

    // Member counts
    const [totalMembers, activeMembers, pendingMembers] = await Promise.all([
      this.count('members'),
      this.count('members', { status: 'active' }),
      this.count('members', { status: 'pending' }),
    ]);

    // Calculate all financial totals from transactions
    const [savingsTxns, contributionTxns, welfareTxns, fineTxns, loanTxns] = await Promise.all([
      this.getTransactionTotals('savings'),
      this.getTransactionTotals('contributions'),
      this.getTransactionTotals('welfare'),
      this.getTransactionTotals('fines'),
      this.getLoanTotals(),
    ]);

    // Get loan counts
    const [totalLoans, pendingLoans, activeLoansCount] = await Promise.all([
      this.count('loans'),
      this.count('loans', { status: 'pending' }),
      this.count('loans', { status: 'disbursed' }),
    ]);

    // Get share value and calculate total shares
    const { data: shareValueSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'shares.share_value')
      .single();
    const shareValue = shareValueSetting ? parseFloat(shareValueSetting.value) : 100;
    const totalShares = Math.floor(savingsTxns.totalDeposits / shareValue);

    return {
      total_members: totalMembers,
      active_members: activeMembers,
      pending_members: pendingMembers,
      total_savings: savingsTxns.balance,
      total_shares: totalShares,
      total_contributions: contributionTxns.balance,
      total_welfare: welfareTxns.balance,
      total_fines_pending: fineTxns.balance,
      total_loans_outstanding: loanTxns.outstanding,
      total_loan_repayments: loanTxns.repayments,
      // Loan counts
      total_loan_applications: totalLoans,
      pending_loan_applications: pendingLoans,
      active_loans: activeLoansCount,
    };
  }

  /**
   * Get recent activity
   */
  async getRecentActivity(limit: number = 20): Promise<ActivityItem[]> {
    const supabase = await createServiceClient();

    // Get recent transactions with member and user info
    const { data: transactions } = await supabase
      .from('transactions')
      .select(`
        id, transaction_type, amount, description, created_at,
        member:members(first_name, last_name, member_number),
        user:users(full_name)
      `)
      .eq('reversed', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Get recent member registrations
    const { data: members } = await supabase
      .from('members')
      .select('id, member_number, first_name, last_name, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    const activity: ActivityItem[] = [];

    // Map transactions
    (transactions || []).forEach((t: any) => {
      const typeMap: Record<string, string> = {
        savings_deposit: 'Savings Deposit',
        savings_withdrawal: 'Savings Withdrawal',
        contribution_monthly: 'Monthly Contribution',
        contribution_special: 'Special Contribution',
        welfare_deposit: 'Welfare Contribution',
        fine_payment: 'Fine Payment',
        loan_repayment: 'Loan Repayment',
        loan_disbursement: 'Loan Disbursement',
        registration_fee: 'Registration Fee',
        annual_fee: 'Annual Fee',
      };

      activity.push({
        id: `txn-${t.id}`,
        type: t.transaction_type,
        description: typeMap[t.transaction_type] || t.transaction_type,
        amount: Number(t.amount),
        member_name: t.member ? `${t.member.first_name} ${t.member.last_name}` : undefined,
        user_name: t.user?.full_name,
        created_at: t.created_at,
      });
    });

    // Map member registrations
    (members || []).forEach((m: any) => {
      activity.push({
        id: `member-${m.id}`,
        type: 'member_registration',
        description: 'New Member Registered',
        member_name: `${m.first_name} ${m.last_name}`,
        created_at: m.created_at,
      });
    });

    // Sort by date
    activity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return activity.slice(0, limit);
  }

  /**
   * Get alerts
   */
  async getAlerts(): Promise<DashboardAlert[]> {
    const supabase = await createServiceClient();
    const alerts: DashboardAlert[] = [];

    // Pending loans
    const { count: pendingLoans } = await supabase
      .from('loans')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (pendingLoans && pendingLoans > 0) {
      alerts.push({
        type: 'info',
        title: 'Pending Loans',
        message: `${pendingLoans} loan application(s) awaiting approval`,
      });
    }

    // Pending members
    const { count: pendingMembers } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (pendingMembers && pendingMembers > 0) {
      alerts.push({
        type: 'warning',
        title: 'Pending Registrations',
        message: `${pendingMembers} member registration(s) awaiting approval`,
      });
    }

    // Pending fines
    const { count: pendingFines } = await supabase
      .from('fines')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (pendingFines && pendingFines > 0) {
      alerts.push({
        type: 'info',
        title: 'Pending Fines',
        message: `${pendingFines} fine(s) awaiting payment`,
      });
    }

    return alerts;
  }

  // Helper methods
  private async count(table: string, filters?: Record<string, string>): Promise<number> {
    const supabase = await createServiceClient();
    let query = supabase.from(table).select('*', { count: 'exact', head: true });
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
    }

    const { count } = await query;
    return count || 0;
  }

  /**
   * Get transaction types for each account type
   * NOTE: Transaction type naming is NOT consistent with account type naming
   * - contributions: uses 'contribution_' (not 'contributions_')
   * - fines: uses 'fine_posting' (not 'fines_deposit')
   */
  private getTransactionTypes(accountType: string): { creditTypes: string[]; debitTypes: string[] } {
    const typeMap: Record<string, { creditTypes: string[]; debitTypes: string[] }> = {
      savings: {
        creditTypes: ['savings_deposit', 'savings_monthly', 'savings_special', 'savings_development'],
        debitTypes: ['savings_withdrawal', 'savings_disbursement'],
      },
      contributions: {
        // Note: Uses 'contribution_' not 'contributions_'
        creditTypes: ['contribution_monthly', 'contribution_special', 'contribution_development', 'contributions_deposit'],
        debitTypes: ['contribution_withdrawal', 'contribution_disbursement', 'contributions_withdrawal'],
      },
      welfare: {
        creditTypes: ['welfare_deposit', 'welfare_monthly', 'welfare_special', 'welfare_development'],
        debitTypes: ['welfare_withdrawal', 'welfare_disbursement'],
      },
      fines: {
        // Note: Uses 'fine_posting' not 'fines_deposit'
        creditTypes: ['fine_posting', 'fines_deposit', 'fines_monthly', 'fines_special'],
        debitTypes: ['fine_payment', 'fines_withdrawal', 'fines_disbursement'],
      },
    };

    return typeMap[accountType] || { creditTypes: [], debitTypes: [] };
  }

  private async getTransactionTotals(accountType: string) {
    const supabase = await createServiceClient();

    // Get account IDs for this type
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id')
      .eq('account_type', accountType);

    if (!accounts || accounts.length === 0) {
      return { totalDeposits: 0, totalWithdrawals: 0, balance: 0 };
    }

    const accountIds = accounts.map(a => a.id);

    // Get all non-reversed transactions
    const { data: txns } = await supabase
      .from('transactions')
      .select('transaction_type, amount')
      .in('account_id', accountIds)
      .eq('reversed', false);

    if (!txns) return { totalDeposits: 0, totalWithdrawals: 0, balance: 0 };

    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let balance = 0;

    // Use explicit type mapping instead of dynamic generation
    const { creditTypes, debitTypes } = this.getTransactionTypes(accountType);

    for (const txn of txns) {
      if (creditTypes.includes(txn.transaction_type)) {
        totalDeposits += Number(txn.amount);
        balance += Number(txn.amount);
      } else if (debitTypes.includes(txn.transaction_type)) {
        totalWithdrawals += Number(txn.amount);
        balance -= Number(txn.amount);
      }
    }

    return { totalDeposits, totalWithdrawals, balance };
  }

  private async getLoanTotals() {
    const supabase = await createServiceClient();

    // Get disbursements from transactions (these INCREASE outstanding)
    const { data: disbursements } = await supabase
      .from('transactions')
      .select('amount')
      .eq('transaction_type', 'loan_disbursement')
      .eq('reversed', false);

    const { data: repayments } = await supabase
      .from('transactions')
      .select('amount')
      .eq('transaction_type', 'loan_repayment')
      .eq('reversed', false);

    const totalDisbursements = disbursements?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    const totalRepayments = repayments?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

    // Outstanding = disbursements - repayments (what members owe)
    return {
      disbursements: totalDisbursements,
      repayments: totalRepayments,
      outstanding: totalDisbursements - totalRepayments,
    };
  }
}

export const dashboardService = new DashboardService();
