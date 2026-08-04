/**
 * STATEMENT SERVICE - Financial Statement Generation
 * 
 * Generates professional financial statements from live data.
 * Supports weekly, monthly, quarterly, annual, and custom statements.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { notificationService } from './notification.service';
import { emailService } from './email.service';
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from 'date-fns';

export type StatementType =
  | 'member_weekly'
  | 'member_monthly'
  | 'member_quarterly'
  | 'member_annual'
  | 'loan_statement'
  | 'savings_statement'
  | 'contribution_statement'
  | 'welfare_statement'
  | 'organization_summary'
  | 'custom';

export interface StatementData {
  statement_type: StatementType;
  period_start: Date;
  period_end: Date;
  recipient_type: 'member' | 'admin' | 'organization';
  recipient_id?: string;
  recipient_email?: string;
  recipient_name?: string;
  schedule_id?: string;
  schedule_run_id?: string;
  created_by?: string;
}

export interface GeneratedStatement {
  id: string;
  statement_ref: string;
  title: string;
  period: string;
  summary: {
    opening_balance: number;
    total_credits: number;
    total_debits: number;
    closing_balance: number;
    transaction_count: number;
  };
  transactions: Array<{
    date: string;
    description: string;
    reference: string;
    debit: number;
    credit: number;
    balance: number;
  }>;
  metadata: Record<string, unknown>;
}

export class StatementService {
  /**
   * Generate a statement
   */
  async generate(data: StatementData): Promise<GeneratedStatement> {
    const supabase = await createServiceClient();
    const statementRef = this.generateStatementRef(data.statement_type);

    // Resolve recipient details if needed
    if (data.recipient_type === 'member' && data.recipient_id && !data.recipient_email) {
      const member = await this.getMember(data.recipient_id);
      if (member) {
        data.recipient_email = member.email || undefined;
        data.recipient_name = `${member.first_name} ${member.last_name}`;
      }
    }

    // Create statement record
    const { data: statement, error } = await supabase
      .from('notification_statements')
      .insert({
        id: uuidv4(),
        statement_ref: statementRef,
        statement_type: data.statement_type,
        period_start: data.period_start.toISOString().split('T')[0],
        period_end: data.period_end.toISOString().split('T')[0],
        recipient_type: data.recipient_type,
        recipient_id: data.recipient_id,
        recipient_email: data.recipient_email,
        recipient_name: data.recipient_name,
        title: this.getStatementTitle(data.statement_type, data.period_start, data.period_end),
        status: 'generating',
        schedule_id: data.schedule_id,
        schedule_run_id: data.schedule_run_id,
        created_by: data.created_by,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create statement record: ${error.message}`);
    }

    try {
      // Generate statement content based on type
      const statementData = await this.buildStatementContent(data);

      // Update statement with generated data
      await supabase
        .from('notification_statements')
        .update({
          status: 'ready',
          generated_data: statementData as any,
          summary: statementData.summary,
        })
        .eq('id', statement.id);

      return {
        id: statement.id,
        statement_ref: statementRef,
        title: statementData.title,
        period: statementData.period,
        summary: statementData.summary,
        transactions: statementData.transactions,
        metadata: statementData.metadata,
      };
    } catch (genError: any) {
      // Mark as failed
      await supabase
        .from('notification_statements')
        .update({
          status: 'failed',
          error_message: genError.message,
        })
        .eq('id', statement.id);

      throw genError;
    }
  }

  /**
   * Generate and deliver statement via email
   */
  async generateAndDeliver(data: StatementData): Promise<{ statement_id: string; email_sent: boolean }> {
    const statement = await this.generate(data);
    
    let emailSent = false;

    if (data.recipient_email) {
      const emailHtml = this.renderStatementEmail(statement, data);
      
      const result = await emailService.send({
        to: data.recipient_email,
        toName: data.recipient_name,
        subject: statement.title,
        htmlBody: emailHtml,
      });

      emailSent = result.success;

      // Update statement delivery status
      const supabase = await createServiceClient();
      await supabase
        .from('notification_statements')
        .update({
          email_sent: emailSent,
          email_sent_at: emailSent ? new Date().toISOString() : null,
        })
        .eq('id', statement.id);
    }

    return { statement_id: statement.id, email_sent: emailSent };
  }

  /**
   * Build statement content based on type
   */
  private async buildStatementContent(data: StatementData): Promise<{
    title: string;
    period: string;
    summary: any;
    transactions: any[];
    metadata: any;
  }> {
    const orgName = await this.getOrganizationName();
    const currency = await this.getCurrency();

    switch (data.statement_type) {
      case 'member_weekly':
      case 'member_monthly':
      case 'member_quarterly':
      case 'member_annual':
        return this.buildMemberStatement(data, orgName, currency);

      case 'loan_statement':
        return this.buildLoanStatement(data, orgName, currency);

      case 'savings_statement':
        return this.buildSavingsStatement(data, orgName, currency);

      case 'contribution_statement':
        return this.buildContributionStatement(data, orgName, currency);

      case 'welfare_statement':
        return this.buildWelfareStatement(data, orgName, currency);

      case 'organization_summary':
        return this.buildOrgSummary(data, orgName, currency);

      default:
        return this.buildCustomStatement(data, orgName, currency);
    }
  }

  /**
   * Build member statement
   */
  private async buildMemberStatement(
    data: StatementData,
    orgName: string,
    currency: string
  ): Promise<any> {
    const supabase = await createServiceClient();

    const memberId = data.recipient_id;
    if (!memberId) throw new Error('Member ID required');

    // Get member info
    const { data: member } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .single();

    // Get all accounts
    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .eq('member_id', memberId)
      .eq('status', 'active');

    // Get transactions for the period
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('member_id', memberId)
      .eq('reversed', false)
      .gte('created_at', data.period_start.toISOString())
      .lte('created_at', data.period_end.toISOString())
      .order('created_at', { ascending: true });

    // Calculate opening balance (balance at start of period)
    const { data: priorTransactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('member_id', memberId)
      .eq('reversed', false)
      .lt('created_at', data.period_start.toISOString());

    const openingBalance = this.calculateBalance(priorTransactions || []);
    const transactionList = this.formatTransactions(transactions || []);
    const closingBalance = openingBalance + transactionList.reduce((sum, t) => sum + t.credit - t.debit, 0);

    const periodStr = `${format(data.period_start, 'dd MMM yyyy')} - ${format(data.period_end, 'dd MMM yyyy')}`;

    return {
      title: `${orgName} - Account Statement`,
      period: periodStr,
      summary: {
        opening_balance: openingBalance,
        total_credits: transactionList.reduce((sum, t) => sum + t.credit, 0),
        total_debits: transactionList.reduce((sum, t) => sum + t.debit, 0),
        closing_balance: closingBalance,
        transaction_count: transactionList.length,
      },
      transactions: transactionList,
      metadata: {
        member_name: `${member?.first_name} ${member?.last_name}`,
        member_number: member?.member_number,
        organization_name: orgName,
        currency,
        statement_type: data.statement_type,
      },
    };
  }

  /**
   * Build loan statement
   */
  private async buildLoanStatement(
    data: StatementData,
    orgName: string,
    currency: string
  ): Promise<any> {
    const supabase = await createServiceClient();

    const memberId = data.recipient_id;
    if (!memberId) throw new Error('Member ID required');

    // Get member info
    const { data: member } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .single();

    // Get active loans
    const { data: loans } = await supabase
      .from('loans')
      .select('*')
      .eq('member_id', memberId)
      .in('status', ['approved', 'disbursed', 'active']);

    // Get loan transactions for the period
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('member_id', memberId)
      .in('transaction_type', ['loan_disbursement', 'loan_repayment'])
      .eq('reversed', false)
      .gte('created_at', data.period_start.toISOString())
      .lte('created_at', data.period_end.toISOString())
      .order('created_at', { ascending: true });

    const transactionList = this.formatTransactions(transactions || []);
    const disbursements = transactionList.filter(t => t.description.includes('Disbursement'));
    const repayments = transactionList.filter(t => t.description.includes('Repayment'));

    const periodStr = `${format(data.period_start, 'dd MMM yyyy')} - ${format(data.period_end, 'dd MMM yyyy')}`;

    return {
      title: `${orgName} - Loan Statement`,
      period: periodStr,
      summary: {
        opening_balance: loans?.reduce((sum, l) => sum + Number(l.amount_due), 0) || 0,
        total_credits: repayments.reduce((sum, t) => sum + t.credit, 0),
        total_debits: disbursements.reduce((sum, t) => sum + t.debit, 0),
        closing_balance: (loans?.reduce((sum, l) => sum + Number(l.amount_due), 0) || 0) - repayments.reduce((sum, t) => sum + t.credit, 0) + disbursements.reduce((sum, t) => sum + t.debit, 0),
        transaction_count: transactionList.length,
        active_loans: loans?.length || 0,
        total_disbursed: loans?.reduce((sum, l) => sum + Number(l.principal_amount), 0) || 0,
        total_repaid: loans?.reduce((sum, l) => sum + Number(l.amount_paid), 0) || 0,
      },
      transactions: transactionList,
      metadata: {
        member_name: `${member?.first_name} ${member?.last_name}`,
        member_number: member?.member_number,
        organization_name: orgName,
        currency,
        loans: loans?.map(l => ({
          loan_number: l.loan_number,
          principal: l.principal_amount,
          total_amount: l.total_amount,
          amount_paid: l.amount_paid,
          amount_due: l.amount_due,
          status: l.status,
        })),
      },
    };
  }

  /**
   * Build savings statement
   */
  private async buildSavingsStatement(
    data: StatementData,
    orgName: string,
    currency: string
  ): Promise<any> {
    const supabase = await createServiceClient();

    const memberId = data.recipient_id;
    if (!memberId) throw new Error('Member ID required');

    const { data: member } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .single();

    // Get savings account
    const { data: savingsAccount } = await supabase
      .from('accounts')
      .select('*')
      .eq('member_id', memberId)
      .eq('account_type', 'savings')
      .single();

    // Get savings transactions
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('account_id', savingsAccount?.id)
      .eq('reversed', false)
      .in('transaction_type', ['savings_deposit', 'savings_withdrawal', 'savings_adjustment'])
      .gte('created_at', data.period_start.toISOString())
      .lte('created_at', data.period_end.toISOString())
      .order('created_at', { ascending: true });

    const transactionList = this.formatTransactions(transactions || []);
    const deposits = transactionList.filter(t => t.description.includes('Deposit') || t.credit > 0);
    const withdrawals = transactionList.filter(t => t.description.includes('Withdrawal') || t.debit > 0);

    const periodStr = `${format(data.period_start, 'dd MMM yyyy')} - ${format(data.period_end, 'dd MMM yyyy')}`;

    return {
      title: `${orgName} - Savings Statement`,
      period: periodStr,
      summary: {
        opening_balance: transactionList.length > 0 ? transactionList[0].balance - (transactionList[0].credit - transactionList[0].debit) : 0,
        total_credits: deposits.reduce((sum, t) => sum + t.credit, 0),
        total_debits: withdrawals.reduce((sum, t) => sum + t.debit, 0),
        closing_balance: transactionList.length > 0 ? transactionList[transactionList.length - 1].balance : 0,
        transaction_count: transactionList.length,
      },
      transactions: transactionList,
      metadata: {
        member_name: `${member?.first_name} ${member?.last_name}`,
        member_number: member?.member_number,
        organization_name: orgName,
        currency,
        account_number: savingsAccount?.account_number,
      },
    };
  }

  /**
   * Build contribution statement
   */
  private async buildContributionStatement(
    data: StatementData,
    orgName: string,
    currency: string
  ): Promise<any> {
    const supabase = await createServiceClient();

    const memberId = data.recipient_id;
    if (!memberId) throw new Error('Member ID required');

    const { data: member } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .single();

    // Get contribution transactions
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('member_id', memberId)
      .eq('reversed', false)
      .in('transaction_type', ['contribution_monthly', 'contribution_special', 'contribution_development'])
      .gte('created_at', data.period_start.toISOString())
      .lte('created_at', data.period_end.toISOString())
      .order('created_at', { ascending: true });

    // Group by campaign if metadata exists
    const byCampaign: Record<string, any[]> = {};
    for (const txn of transactions || []) {
      const campaignId = (txn.metadata as any)?.campaign_id || 'General';
      if (!byCampaign[campaignId]) byCampaign[campaignId] = [];
      byCampaign[campaignId].push(txn);
    }

    const transactionList = this.formatTransactions(transactions || []);

    const periodStr = `${format(data.period_start, 'dd MMM yyyy')} - ${format(data.period_end, 'dd MMM yyyy')}`;

    return {
      title: `${orgName} - Contribution Statement`,
      period: periodStr,
      summary: {
        opening_balance: 0,
        total_credits: transactionList.reduce((sum, t) => sum + t.credit, 0),
        total_debits: 0,
        closing_balance: transactionList.reduce((sum, t) => sum + t.credit, 0),
        transaction_count: transactionList.length,
        campaigns: Object.keys(byCampaign).length,
      },
      transactions: transactionList,
      metadata: {
        member_name: `${member?.first_name} ${member?.last_name}`,
        member_number: member?.member_number,
        organization_name: orgName,
        currency,
        by_campaign: Object.entries(byCampaign).map(([id, txns]) => ({
          campaign_id: id,
          total: txns.reduce((sum: number, t: any) => sum + Number(t.amount), 0),
          count: txns.length,
        })),
      },
    };
  }

  /**
   * Build welfare statement
   */
  private async buildWelfareStatement(
    data: StatementData,
    orgName: string,
    currency: string
  ): Promise<any> {
    const supabase = await createServiceClient();

    const memberId = data.recipient_id;
    if (!memberId) throw new Error('Member ID required');

    const { data: member } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .single();

    // Get welfare transactions
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('member_id', memberId)
      .eq('reversed', false)
      .in('transaction_type', ['welfare_deposit', 'welfare_disbursement'])
      .gte('created_at', data.period_start.toISOString())
      .lte('created_at', data.period_end.toISOString())
      .order('created_at', { ascending: true });

    const transactionList = this.formatTransactions(transactions || []);

    const periodStr = `${format(data.period_start, 'dd MMM yyyy')} - ${format(data.period_end, 'dd MMM yyyy')}`;

    return {
      title: `${orgName} - Welfare Statement`,
      period: periodStr,
      summary: {
        opening_balance: 0,
        total_credits: transactionList.filter(t => t.credit > 0).reduce((sum, t) => sum + t.credit, 0),
        total_debits: transactionList.filter(t => t.debit > 0).reduce((sum, t) => sum + t.debit, 0),
        closing_balance: 0,
        transaction_count: transactionList.length,
      },
      transactions: transactionList,
      metadata: {
        member_name: `${member?.first_name} ${member?.last_name}`,
        member_number: member?.member_number,
        organization_name: orgName,
        currency,
      },
    };
  }

  /**
   * Build organization summary
   */
  private async buildOrgSummary(
    data: StatementData,
    orgName: string,
    currency: string
  ): Promise<any> {
    const supabase = await createServiceClient();

    // Get summary stats
    const [membersCount, activeLoans, totalSavings, totalContributions] = await Promise.all([
      supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('loans').select('*', { count: 'exact', head: true }).in('status', ['active', 'disbursed']),
      this.getTotalSavings(),
      this.getTotalContributions(),
    ]);

    const periodStr = `${format(data.period_start, 'dd MMM yyyy')} - ${format(data.period_end, 'dd MMM yyyy')}`;

    return {
      title: `${orgName} - Organization Summary`,
      period: periodStr,
      summary: {
        opening_balance: 0,
        total_credits: totalContributions,
        total_debits: 0,
        closing_balance: totalSavings + totalContributions,
        transaction_count: 0,
        active_members: membersCount.count || 0,
        active_loans: activeLoans.count || 0,
        total_savings: totalSavings,
        total_contributions: totalContributions,
      },
      transactions: [],
      metadata: {
        organization_name: orgName,
        currency,
        generated_at: new Date().toISOString(),
      },
    };
  }

  /**
   * Build custom statement
   */
  private async buildCustomStatement(
    data: StatementData,
    orgName: string,
    currency: string
  ): Promise<any> {
    const periodStr = `${format(data.period_start, 'dd MMM yyyy')} - ${format(data.period_end, 'dd MMM yyyy')}`;

    return {
      title: `${orgName} - Statement`,
      period: periodStr,
      summary: {
        opening_balance: 0,
        total_credits: 0,
        total_debits: 0,
        closing_balance: 0,
        transaction_count: 0,
      },
      transactions: [],
      metadata: {
        organization_name: orgName,
        currency,
      },
    };
  }

  /**
   * Get member details
   */
  private async getMember(memberId: string) {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .single();
    return data;
  }

  /**
   * Get organization name
   */
  private async getOrganizationName(): Promise<string> {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'organization.name')
      .single();
    return data?.value || 'YUNITE CBO';
  }

  /**
   * Get currency
   */
  private async getCurrency(): Promise<string> {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'organization.currency')
      .single();
    return data?.value || 'KES';
  }

  /**
   * Get total savings
   */
  private async getTotalSavings(): Promise<number> {
    const supabase = await createServiceClient();
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id')
      .eq('account_type', 'savings');

    if (!accounts?.length) return 0;

    let total = 0;
    for (const account of accounts) {
      const { data: txns } = await supabase
        .from('transactions')
        .select('transaction_type, amount')
        .eq('account_id', account.id)
        .eq('reversed', false)
        .neq('transaction_type', 'reversal');

      for (const txn of txns || []) {
        if (['savings_deposit', 'savings_adjustment', 'welfare_deposit', 'contribution_monthly', 'contribution_special', 'contribution_development'].includes(txn.transaction_type)) {
          total += Number(txn.amount);
        } else if (['savings_withdrawal'].includes(txn.transaction_type)) {
          total -= Number(txn.amount);
        }
      }
    }

    return total;
  }

  /**
   * Get total contributions
   */
  private async getTotalContributions(): Promise<number> {
    const supabase = await createServiceClient();
    const { data: txns } = await supabase
      .from('transactions')
      .select('amount')
      .eq('reversed', false)
      .in('transaction_type', ['contribution_monthly', 'contribution_special', 'contribution_development']);

    return (txns || []).reduce((sum, t) => sum + Number(t.amount), 0);
  }

  /**
   * Calculate balance from transactions
   */
  private calculateBalance(transactions: any[]): number {
    let balance = 0;
    for (const txn of transactions) {
      if (['savings_deposit', 'savings_adjustment', 'loan_repayment', 'contribution_monthly', 'contribution_special', 'contribution_development', 'welfare_deposit'].includes(txn.transaction_type)) {
        balance += Number(txn.amount);
      } else if (['savings_withdrawal', 'loan_disbursement', 'welfare_disbursement'].includes(txn.transaction_type)) {
        balance -= Number(txn.amount);
      }
    }
    return balance;
  }

  /**
   * Format transactions for statement
   */
  private formatTransactions(transactions: any[]): any[] {
    let runningBalance = 0;
    const formatted: any[] = [];

    for (const txn of transactions) {
      const isCredit = ['savings_deposit', 'savings_adjustment', 'loan_repayment', 'contribution_monthly', 'contribution_special', 'contribution_development', 'welfare_deposit'].includes(txn.transaction_type);
      const amount = Number(txn.amount);
      
      if (isCredit) {
        runningBalance += amount;
      } else {
        runningBalance -= amount;
      }

      formatted.push({
        date: format(parseISO(txn.created_at), 'yyyy-MM-dd'),
        description: this.formatTransactionDescription(txn),
        reference: txn.reference_number || txn.transaction_ref,
        debit: isCredit ? 0 : amount,
        credit: isCredit ? amount : 0,
        balance: runningBalance,
      });
    }

    return formatted;
  }

  /**
   * Format transaction description
   */
  private formatTransactionDescription(txn: any): string {
    const typeMap: Record<string, string> = {
      savings_deposit: 'Savings Deposit',
      savings_withdrawal: 'Savings Withdrawal',
      savings_adjustment: 'Savings Adjustment',
      contribution_monthly: 'Monthly Contribution',
      contribution_special: 'Special Contribution',
      contribution_development: 'Development Contribution',
      welfare_deposit: 'Welfare Contribution',
      welfare_disbursement: 'Welfare Disbursement',
      loan_disbursement: 'Loan Disbursement',
      loan_repayment: 'Loan Repayment',
      fine_payment: 'Fine Payment',
      reversal: 'Reversal',
    };

    return typeMap[txn.transaction_type] || txn.transaction_type;
  }

  /**
   * Get statement title
   */
  private getStatementTitle(type: StatementType, start: Date, end: Date): string {
    const period = `${format(start, 'MMMM yyyy')}`;
    
    switch (type) {
      case 'member_weekly':
        return `Weekly Statement - ${period}`;
      case 'member_monthly':
        return `Monthly Statement - ${period}`;
      case 'member_quarterly':
        return `Quarterly Statement - ${period}`;
      case 'member_annual':
        return `Annual Statement - ${format(start, 'yyyy')}`;
      case 'loan_statement':
        return `Loan Statement - ${period}`;
      case 'savings_statement':
        return `Savings Statement - ${period}`;
      case 'contribution_statement':
        return `Contribution Statement - ${period}`;
      case 'welfare_statement':
        return `Welfare Statement - ${period}`;
      case 'organization_summary':
        return `Organization Summary - ${period}`;
      default:
        return `Statement - ${period}`;
    }
  }

  /**
   * Generate statement reference
   */
  private generateStatementRef(type: StatementType): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = uuidv4().split('-')[0].toUpperCase();
    const typeCode = type.substring(0, 3).toUpperCase();
    return `STMT-${typeCode}-${date}-${random}`;
  }

  /**
   * Render statement as HTML email
   */
  private renderStatementEmail(statement: GeneratedStatement, data: StatementData): string {
    const orgName = 'YUNITE CBO';
    const currency = 'KES';

    return emailService.getDefaultEmailTemplate(`
      <h2 style="color: #1a56db; margin-bottom: 20px;">${statement.title}</h2>
      
      <p><strong>Period:</strong> ${statement.period}</p>
      
      ${statement.metadata.member_name ? `<p><strong>Member:</strong> ${statement.metadata.member_name}</p>` : ''}
      ${statement.metadata.member_number ? `<p><strong>Member Number:</strong> ${statement.metadata.member_number}</p>` : ''}
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
      
      <h3 style="color: #374151;">Summary</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr style="background-color: #f9fafb;">
          <td style="padding: 10px; border: 1px solid #e5e7eb;">Opening Balance</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: right;">${currency} ${statement.summary.opening_balance.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e5e7eb;">Total Credits</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: right; color: #059669;">${currency} ${statement.summary.total_credits.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e5e7eb;">Total Debits</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: right; color: #dc2626;">${currency} ${statement.summary.total_debits.toLocaleString()}</td>
        </tr>
        <tr style="background-color: #f9fafb; font-weight: bold;">
          <td style="padding: 10px; border: 1px solid #e5e7eb;">Closing Balance</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: right;">${currency} ${statement.summary.closing_balance.toLocaleString()}</td>
        </tr>
      </table>
      
      ${statement.transactions.length > 0 ? `
        <h3 style="color: #374151;">Transactions</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background-color: #1a56db; color: white;">
              <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Date</th>
              <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Description</th>
              <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">Debit</th>
              <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">Credit</th>
              <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${statement.transactions.slice(0, 20).map(t => `
              <tr>
                <td style="padding: 6px; border: 1px solid #e5e7eb;">${t.date}</td>
                <td style="padding: 6px; border: 1px solid #e5e7eb;">${t.description}</td>
                <td style="padding: 6px; border: 1px solid #e5e7eb; text-align: right;">${t.debit > 0 ? `${currency} ${t.debit.toLocaleString()}` : '-'}</td>
                <td style="padding: 6px; border: 1px solid #e5e7eb; text-align: right;">${t.credit > 0 ? `${currency} ${t.credit.toLocaleString()}` : '-'}</td>
                <td style="padding: 6px; border: 1px solid #e5e7eb; text-align: right;">${currency} ${t.balance.toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${statement.transactions.length > 20 ? `<p style="color: #6b7280; font-size: 12px;">... and ${statement.transactions.length - 20} more transactions</p>` : ''}
      ` : ''}
      
      <p style="margin-top: 30px; font-size: 12px; color: #6b7280;">
        This statement was generated on ${format(new Date(), 'dd MMMM yyyy, HH:mm')}.<br>
        For questions or concerns, please contact ${orgName} support.
      </p>
    `);
  }

  /**
   * Get statement by ID
   */
  async getById(statementId: string) {
    const supabase = await createServiceClient();

    const { data } = await supabase
      .from('notification_statements')
      .select('*')
      .eq('id', statementId)
      .single();

    return data;
  }

  /**
   * Get statements for a recipient
   */
  async getForRecipient(recipientId: string, options?: {
    statement_type?: StatementType;
    limit?: number;
    offset?: number;
  }) {
    const supabase = await createServiceClient();
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;

    let query = supabase
      .from('notification_statements')
      .select('*', { count: 'exact' })
      .eq('recipient_id', recipientId)
      .eq('status', 'ready');

    if (options?.statement_type) {
      query = query.eq('statement_type', options.statement_type);
    }

    const { data, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    return {
      statements: data || [],
      total: count || 0,
      limit,
      offset,
    };
  }

  /**
   * Delete old statements
   */
  async cleanupOldStatements(retentionDays: number = 365): Promise<number> {
    const supabase = await createServiceClient();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const { error } = await supabase
      .from('notification_statements')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .eq('status', 'ready');

    if (error) {
      console.error('Failed to cleanup old statements:', error);
      return 0;
    }

    return 1;
  }
}

export const statementService = new StatementService();
