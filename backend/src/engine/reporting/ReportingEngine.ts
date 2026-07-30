import { Logger } from '../../core/services/Logger';
import { DatabaseService } from '../../core/services/DatabaseService';
import { AccountingEngine } from '../accounting/AccountingEngine';

export interface ReportRequest {
  type: 'MEMBER_STATEMENT' | 'ACCOUNT_STATEMENT' | 'LOAN_STATEMENT' | 'SAVINGS_STATEMENT' |
        'PROJECT_STATEMENT' | 'ORGANIZATION_STATEMENT' | 'BRANCH_REPORT' | 'PROFIT_REPORT' |
        'INCOME_REPORT' | 'EXPENSE_REPORT' | 'CASH_FLOW' | 'BALANCE_SHEET' | 'TRIAL_BALANCE' |
        'GENERAL_LEDGER' | 'AUDIT_REPORT' | 'COMPLIANCE_REPORT' | 'EXECUTIVE_DASHBOARD' |
        'AI_REPORT' | 'CUSTOM';
  organizationId: string;
  branchId?: string;
  memberId?: string;
  startDate?: Date;
  endDate?: Date;
  format?: 'json' | 'csv' | 'pdf';
  filters?: Record<string, any>;
}

export class ReportingEngine {
  private static instance: ReportingEngine;

  private constructor() {}

  public static getInstance(): ReportingEngine {
    if (!ReportingEngine.instance) {
      ReportingEngine.instance = new ReportingEngine();
    }
    return ReportingEngine.instance;
  }

  public async generateReport(request: ReportRequest): Promise<any> {
    Logger.info(`Generating report: ${request.type}`, {
      organizationId: request.organizationId,
    });

    switch (request.type) {
      case 'BALANCE_SHEET':
        return this.generateBalanceSheet(request);
      case 'TRIAL_BALANCE':
        return this.generateTrialBalance(request);
      case 'INCOME_REPORT':
      case 'PROFIT_REPORT':
        return this.generateIncomeStatement(request);
      case 'MEMBER_STATEMENT':
        return this.generateMemberStatement(request);
      case 'SAVINGS_STATEMENT':
        return this.generateSavingsStatement(request);
      case 'LOAN_STATEMENT':
        return this.generateLoanStatement(request);
      case 'EXECUTIVE_DASHBOARD':
        return this.generateExecutiveDashboard(request);
      case 'BRANCH_REPORT':
        return this.generateBranchReport(request);
      case 'CASH_FLOW':
        return this.generateCashFlow(request);
      case 'GENERAL_LEDGER':
        return this.generateGeneralLedger(request);
      case 'AUDIT_REPORT':
        return this.generateAuditReport(request);
      default:
        return this.generateCustomReport(request);
    }
  }

  private async generateBalanceSheet(request: ReportRequest): Promise<any> {
    const accounting = AccountingEngine.getInstance();
    return accounting.getBalanceSheet(request.organizationId, request.endDate);
  }

  private async generateTrialBalance(request: ReportRequest): Promise<any> {
    const accounting = AccountingEngine.getInstance();
    return accounting.getTrialBalance(request.organizationId, request.endDate);
  }

  private async generateIncomeStatement(request: ReportRequest): Promise<any> {
    const accounting = AccountingEngine.getInstance();
    const startDate = request.startDate || new Date(new Date().getFullYear(), 0, 1);
    const endDate = request.endDate || new Date();
    return accounting.getIncomeStatement(request.organizationId, startDate, endDate);
  }

  private async generateMemberStatement(request: ReportRequest): Promise<any> {
    const prisma = DatabaseService.getInstance();
    const memberId = request.memberId;
    if (!memberId) throw new Error('Member ID required');

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      include: {
        savingsAccounts: { include: { transactions: { take: 50, orderBy: { createdAt: 'desc' } } } },
        shareAccounts: { include: { transactions: { take: 50, orderBy: { createdAt: 'desc' } } } },
        loans: { include: { repayments: { take: 50, orderBy: { createdAt: 'desc' } } } },
        fines: { take: 50, orderBy: { createdAt: 'desc' } },
        contributions: { take: 50, orderBy: { createdAt: 'desc' } },
      },
    });

    return {
      member: {
        memberNumber: member?.memberNumber,
        name: `${member?.firstName} ${member?.lastName}`,
        status: member?.status,
        registrationDate: member?.registrationDate,
      },
      savings: member?.savingsAccounts.map((a: any) => ({
        accountNumber: a.accountNumber,
        balance: Number(a.balance),
        transactions: a.transactions,
      })),
      shares: member?.shareAccounts.map((a: any) => ({
        accountNumber: a.accountNumber,
        shares: a.shares,
        totalValue: Number(a.totalValue),
        transactions: a.transactions,
      })),
      loans: member?.loans.map((l: any) => ({
        loanNumber: l.loanNumber,
        principal: Number(l.principal),
        balance: Number(l.balance),
        status: l.status,
        repayments: l.repayments,
      })),
      fines: member?.fines,
      contributions: member?.contributions,
    };
  }

  private async generateSavingsStatement(request: ReportRequest): Promise<any> {
    const prisma = DatabaseService.getInstance();
    const memberId = request.memberId;
    if (!memberId) throw new Error('Member ID required');

    const accounts = await prisma.savingsAccount.findMany({
      where: { memberId },
      include: {
        product: true,
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });

    return {
      memberId,
      accounts: accounts.map((a: any) => ({
        accountNumber: a.accountNumber,
        product: a.product.name,
        balance: Number(a.balance),
        availableBalance: Number(a.availableBalance),
        status: a.status,
        transactions: a.transactions.map((t: any) => ({
          date: t.createdAt,
          type: t.type,
          amount: Number(t.amount),
          balanceBefore: Number(t.balanceBefore),
          balanceAfter: Number(t.balanceAfter),
          description: t.description,
        })),
      })),
    };
  }

  private async generateLoanStatement(request: ReportRequest): Promise<any> {
    const prisma = DatabaseService.getInstance();
    const memberId = request.memberId;
    if (!memberId) throw new Error('Member ID required');

    const loans = await prisma.loan.findMany({
      where: { memberId },
      include: {
        product: true,
        repayments: { orderBy: { dueDate: 'asc' } },
        guarantors: { include: { member: { select: { firstName: true, lastName: true, memberNumber: true } } } },
      },
    });

    return {
      memberId,
      loans: loans.map((l: any) => ({
        loanNumber: l.loanNumber,
        product: l.product.name,
        principal: Number(l.principal),
        interestRate: Number(l.interestRate),
        tenure: l.tenure,
        monthlyPayment: Number(l.monthlyPayment),
        amountPaid: Number(l.amountPaid),
        balance: Number(l.balance),
        status: l.status,
        applicationDate: l.applicationDate,
        maturityDate: l.maturityDate,
        repayments: l.repayments.map((r: any) => ({
          dueDate: r.dueDate,
          amount: Number(r.amount),
          principal: Number(r.principal),
          interest: Number(r.interest),
          paidDate: r.paidDate,
          status: r.status,
        })),
        guarantors: l.guarantors.map((g: any) => ({
          name: `${g.member.firstName} ${g.member.lastName}`,
          memberNumber: g.member.memberNumber,
          amount: Number(g.amount),
          status: g.status,
        })),
      })),
    };
  }

  private async generateExecutiveDashboard(request: ReportRequest): Promise<any> {
    const prisma = DatabaseService.getInstance();
    const orgId = request.organizationId;

    const [
      totalMembers,
      activeMembers,
      savingsSummary,
      loanSummary,
      shareSummary,
      recentTransactions,
      pendingApprovals,
      upcomingMeetings,
    ] = await Promise.all([
      prisma.member.count({ where: { organizationId: orgId } }),
      prisma.member.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
      prisma.savingsAccount.aggregate({
        where: { member: { organizationId: orgId } },
        _sum: { balance: true },
        _count: true,
      }),
      prisma.loan.aggregate({
        where: { member: { organizationId: orgId }, status: { in: ['ACTIVE', 'DISBURSED'] } },
        _sum: { balance: true, principal: true },
        _count: true,
      }),
      prisma.shareAccount.aggregate({
        where: { member: { organizationId: orgId } },
        _sum: { totalValue: true, shares: true },
        _count: true,
      }),
      prisma.transaction.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { member: { select: { firstName: true, lastName: true, memberNumber: true } } },
      }),
      prisma.approval.count({ where: { organizationId: orgId, status: 'PENDING' } }),
      prisma.meeting.count({
        where: { organizationId: orgId, scheduledDate: { gte: new Date() }, status: 'SCHEDULED' },
      }),
    ]);

    return {
      overview: {
        totalMembers,
        activeMembers,
        memberGrowthRate: totalMembers > 0 ? ((activeMembers / totalMembers) * 100).toFixed(1) + '%' : '0%',
        totalSavings: Number(savingsSummary._sum.balance || 0),
        savingsAccounts: savingsSummary._count,
        outstandingLoans: Number(loanSummary._sum.balance || 0),
        totalLoanPrincipal: Number(loanSummary._sum.principal || 0),
        activeLoans: loanSummary._count,
        totalShareCapital: Number(shareSummary._sum.totalValue || 0),
        totalShares: Number(shareSummary._sum.shares || 0),
        shareAccounts: shareSummary._count,
      },
      recentTransactions: recentTransactions.map((t: any) => ({
        transactionNumber: t.transactionNumber,
        type: t.type,
        amount: Number(t.amount),
        status: t.status,
        member: t.member ? `${t.member.firstName} ${t.member.lastName}` : 'N/A',
        date: t.createdAt,
      })),
      pendingApprovals,
      upcomingMeetings,
      generatedAt: new Date(),
    };
  }

  private async generateBranchReport(request: ReportRequest): Promise<any> {
    const prisma = DatabaseService.getInstance();
    const branchId = request.branchId;
    if (!branchId) throw new Error('Branch ID required');

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: {
        members: { where: { status: 'ACTIVE' } },
        accounts: true,
      },
    });

    const totalSavings = await prisma.savingsAccount.aggregate({
      where: { member: { branchId } },
      _sum: { balance: true },
    });

    const totalLoans = await prisma.loan.aggregate({
      where: { member: { branchId }, status: { in: ['ACTIVE', 'DISBURSED'] } },
      _sum: { balance: true },
    });

    return {
      branch: {
        name: branch?.name,
        code: branch?.code,
        activeMembers: branch?.members.length,
        totalAccounts: branch?.accounts.length,
      },
      financials: {
        totalSavings: Number(totalSavings._sum.balance || 0),
        outstandingLoans: Number(totalLoans._sum.balance || 0),
      },
    };
  }

  private async generateCashFlow(request: ReportRequest): Promise<any> {
    const prisma = DatabaseService.getInstance();
    const startDate = request.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = request.endDate || new Date();

    const transactions = await prisma.transaction.findMany({
      where: {
        organizationId: request.organizationId,
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED',
      },
      orderBy: { createdAt: 'asc' },
    });

    const inflows = transactions.filter((t: any) => ['SAVINGS_DEPOSIT', 'LOAN_REPAYMENT', 'SHARE_PURCHASE', 'INCOME', 'DONATION', 'GRANT'].includes(t.type));
    const outflows = transactions.filter((t: any) => ['SAVINGS_WITHDRAWAL', 'LOAN_DISBURSEMENT', 'EXPENSE', 'PAYROLL'].includes(t.type));

    const totalInflow = inflows.reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalOutflow = outflows.reduce((s: number, t: any) => s + Number(t.amount), 0);

    return {
      period: { startDate, endDate },
      totalInflow,
      totalOutflow,
      netCashFlow: totalInflow - totalOutflow,
      inflows: inflows.slice(0, 50),
      outflows: outflows.slice(0, 50),
    };
  }

  private async generateGeneralLedger(request: ReportRequest): Promise<any> {
    const prisma = DatabaseService.getInstance();
    const startDate = request.startDate || new Date(0);
    const endDate = request.endDate || new Date();

    const entries = await prisma.journalEntry.findMany({
      where: {
        organizationId: request.organizationId,
        date: { gte: startDate, lte: endDate },
        status: 'COMPLETED',
      },
      include: {
        journalLines: {
          include: { account: true },
        },
      },
      orderBy: { date: 'asc' },
    });

    return {
      period: { startDate, endDate },
      entries: entries.map((e: any) => ({
        entryNumber: e.entryNumber,
        date: e.date,
        description: e.description,
        reference: e.reference,
        totalDebit: Number(e.totalDebit),
        totalCredit: Number(e.totalCredit),
        lines: e.journalLines.map((l: any) => ({
          accountCode: l.account.code,
          accountName: l.account.name,
          debit: Number(l.debit),
          credit: Number(l.credit),
          description: l.description,
        })),
      })),
    };
  }

  private async generateAuditReport(request: ReportRequest): Promise<any> {
    const prisma = DatabaseService.getInstance();
    const startDate = request.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = request.endDate || new Date();

    const logs = await prisma.auditLog.findMany({
      where: {
        organizationId: request.organizationId,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return {
      period: { startDate, endDate },
      totalLogs: logs.length,
      logs: logs.map((l: any) => ({
        date: l.createdAt,
        user: l.user ? `${l.user.firstName} ${l.user.lastName}` : 'System',
        action: l.action,
        resource: l.resource,
        resourceId: l.resourceId,
        changes: l.changes,
        ipAddress: l.ipAddress,
      })),
    };
  }

  private async generateCustomReport(request: ReportRequest): Promise<any> {
    return {
      type: 'CUSTOM',
      message: 'Custom report generation',
      filters: request.filters,
      generatedAt: new Date(),
    };
  }
}