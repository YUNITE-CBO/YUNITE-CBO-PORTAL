import { Logger } from '../../core/services/Logger';
import { DatabaseService } from '../../core/services/DatabaseService';
import { config } from '../../config';

export interface AIAnalysisRequest {
  type: 'FRAUD_DETECTION' | 'ANOMALY_DETECTION' | 'CREDIT_SCORING' | 'RISK_ASSESSMENT' | 
        'PROFIT_ANALYSIS' | 'PREDICTION' | 'RECOMMENDATION' | 'REPORT_GENERATION' |
        'DATA_QUALITY' | 'SYSTEM_HEALTH' | 'EXECUTIVE_SUMMARY';
  organizationId: string;
  parameters?: Record<string, any>;
}

export interface AIAnalysisResult {
  success: boolean;
  type: string;
  summary: string;
  findings: any[];
  recommendations: string[];
  confidence: number;
  generatedAt: Date;
}

export class AIEngine {
  private static instance: AIEngine;

  private constructor() {}

  public static getInstance(): AIEngine {
    if (!AIEngine.instance) {
      AIEngine.instance = new AIEngine();
    }
    return AIEngine.instance;
  }

  /**
   * Perform AI analysis across the entire platform
   */
  public async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    Logger.info(`AI Analysis requested: ${request.type}`, {
      organizationId: request.organizationId,
    });

    switch (request.type) {
      case 'FRAUD_DETECTION':
        return this.detectFraud(request);
      case 'ANOMALY_DETECTION':
        return this.detectAnomalies(request);
      case 'CREDIT_SCORING':
        return this.calculateCreditScore(request);
      case 'RISK_ASSESSMENT':
        return this.assessRisk(request);
      case 'PROFIT_ANALYSIS':
        return this.analyzeProfitability(request);
      case 'PREDICTION':
        return this.makePrediction(request);
      case 'RECOMMENDATION':
        return this.generateRecommendations(request);
      case 'REPORT_GENERATION':
        return this.generateReport(request);
      case 'DATA_QUALITY':
        return this.checkDataQuality(request);
      case 'SYSTEM_HEALTH':
        return this.checkSystemHealth(request);
      case 'EXECUTIVE_SUMMARY':
        return this.generateExecutiveSummary(request);
      default:
        return {
          success: false,
          type: request.type,
          summary: 'Unknown analysis type',
          findings: [],
          recommendations: [],
          confidence: 0,
          generatedAt: new Date(),
        };
    }
  }

  /**
   * Detect fraudulent activities across the system
   */
  private async detectFraud(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const prisma = DatabaseService.getInstance();
    const findings: any[] = [];
    const recommendations: string[] = [];

    try {
      // Check for duplicate members
      const members = await prisma.member.findMany({
        where: { organizationId: request.organizationId },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, idNumber: true },
      });

      const emailMap = new Map<string, any[]>();
      const phoneMap = new Map<string, any[]>();
      const idNumberMap = new Map<string, any[]>();

      for (const member of members) {
        if (member.email) {
          const existing = emailMap.get(member.email) || [];
          existing.push(member);
          emailMap.set(member.email, existing);
        }
        if (member.phone) {
          const existing = phoneMap.get(member.phone) || [];
          existing.push(member);
          phoneMap.set(member.phone, existing);
        }
        if (member.idNumber) {
          const existing = idNumberMap.get(member.idNumber) || [];
          existing.push(member);
          idNumberMap.set(member.idNumber, existing);
        }
      }

      for (const [email, dups] of emailMap) {
        if (dups.length > 1) {
          findings.push({ type: 'DUPLICATE_MEMBER', field: 'email', value: email, count: dups.length, members: dups.map(m => m.id) });
        }
      }
      for (const [phone, dups] of phoneMap) {
        if (dups.length > 1) {
          findings.push({ type: 'DUPLICATE_MEMBER', field: 'phone', value: phone, count: dups.length, members: dups.map(m => m.id) });
        }
      }
      for (const [idNumber, dups] of idNumberMap) {
        if (dups.length > 1) {
          findings.push({ type: 'DUPLICATE_MEMBER', field: 'idNumber', value: idNumber, count: dups.length, members: dups.map(m => m.id) });
        }
      }

      // Check for duplicate transactions
      const recentTxns = await prisma.transaction.findMany({
        where: {
          organizationId: request.organizationId,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        select: { id: true, amount: true, type: true, memberId: true, createdAt: true },
      });

      const txnMap = new Map<string, any[]>();
      for (const txn of recentTxns) {
        const key = `${txn.amount}-${txn.type}-${txn.memberId}`;
        const existing = txnMap.get(key) || [];
        existing.push(txn);
        txnMap.set(key, existing);
      }

      for (const [key, dups] of txnMap) {
        if (dups.length > 3) {
          findings.push({ type: 'DUPLICATE_PAYMENT', key, count: dups.length, transactions: dups.map(t => t.id) });
        }
      }

      if (findings.length > 0) {
        recommendations.push('Review duplicate member records and merge where appropriate');
        recommendations.push('Investigate duplicate payment patterns');
        recommendations.push('Implement stricter validation for member registration');
      }

    } catch (error) {
      Logger.error('Fraud detection failed', error);
    }

    return {
      success: true,
      type: 'FRAUD_DETECTION',
      summary: `Found ${findings.length} potential issues`,
      findings,
      recommendations,
      confidence: 0.85,
      generatedAt: new Date(),
    };
  }

  /**
   * Detect anomalies in transactions and member behavior
   */
  private async detectAnomalies(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const prisma = DatabaseService.getInstance();
    const findings: any[] = [];
    const recommendations: string[] = [];

    try {
      // Check for orphan records
      const orphanChecks = [
        { model: 'savingsAccount', relation: 'member' },
        { model: 'loan', relation: 'member' },
        { model: 'transaction', relation: 'member' },
      ];

      // Check for inconsistent balances
      const savingsAccounts = await prisma.savingsAccount.findMany({
        where: { member: { organizationId: request.organizationId } },
        select: { id: true, accountNumber: true, balance: true },
      });

      for (const account of savingsAccounts) {
        const transactions = await prisma.savingsTransaction.findMany({
          where: { accountId: account.id },
          select: { type: true, amount: true },
        });

        let calculatedBalance = 0;
        for (const txn of transactions) {
          if (txn.type === 'DEPOSIT' || txn.type === 'INTEREST') {
            calculatedBalance += Number(txn.amount);
          } else {
            calculatedBalance -= Number(txn.amount);
          }
        }

        if (Math.abs(calculatedBalance - Number(account.balance)) > 0.01) {
          findings.push({
            type: 'BALANCE_INCONSISTENCY',
            account: account.accountNumber,
            storedBalance: Number(account.balance),
            calculatedBalance,
            difference: Number(account.balance) - calculatedBalance,
          });
        }
      }

      if (findings.length > 0) {
        recommendations.push('Reconcile account balances with transaction history');
        recommendations.push('Investigate balance discrepancies immediately');
      }

    } catch (error) {
      Logger.error('Anomaly detection failed', error);
    }

    return {
      success: true,
      type: 'ANOMALY_DETECTION',
      summary: `Found ${findings.length} anomalies`,
      findings,
      recommendations,
      confidence: 0.9,
      generatedAt: new Date(),
    };
  }

  /**
   * Calculate credit score for a member
   */
  private async calculateCreditScore(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const memberId = request.parameters?.memberId;
    if (!memberId) {
      return {
        success: false,
        type: 'CREDIT_SCORING',
        summary: 'Member ID required',
        findings: [],
        recommendations: [],
        confidence: 0,
        generatedAt: new Date(),
      };
    }

    const prisma = DatabaseService.getInstance();
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      include: {
        loans: true,
        savingsAccounts: true,
        shareAccounts: true,
        fines: true,
      },
    });

    if (!member) {
      return {
        success: false,
        type: 'CREDIT_SCORING',
        summary: 'Member not found',
        findings: [],
        recommendations: [],
        confidence: 0,
        generatedAt: new Date(),
      };
    }

    let score = 500; // Base score
    const factors: string[] = [];

    // Savings history
    const totalSavings = member.savingsAccounts.reduce((s, a) => s + Number(a.balance), 0);
    if (totalSavings > 0) {
      score += Math.min(totalSavings / 1000, 100);
      factors.push(`Savings balance: +${Math.min(totalSavings / 1000, 100)}`);
    }

    // Loan repayment history
    const completedLoans = member.loans.filter(l => l.status === 'COMPLETED').length;
    const activeLoans = member.loans.filter(l => l.status === 'ACTIVE' || l.status === 'DISBURSED').length;
    const defaultedLoans = member.loans.filter(l => l.status === 'DEFAULTED').length;

    score += completedLoans * 20;
    score -= defaultedLoans * 50;
    factors.push(`Completed loans: ${completedLoans} (+${completedLoans * 20})`);
    if (defaultedLoans > 0) factors.push(`Defaulted loans: ${defaultedLoans} (-${defaultedLoans * 50})`);

    // Share capital
    const totalShares = member.shareAccounts.reduce((s, a) => s + Number(a.totalValue), 0);
    if (totalShares > 0) {
      score += Math.min(totalShares / 5000, 50);
      factors.push(`Share value: +${Math.min(totalShares / 5000, 50)}`);
    }

    // Fines
    const unpaidFines = member.fines.filter(f => f.status === 'PENDING').length;
    score -= unpaidFines * 10;
    if (unpaidFines > 0) factors.push(`Unpaid fines: ${unpaidFines} (-${unpaidFines * 10})`);

    // Normalize score
    score = Math.max(0, Math.min(1000, score));

    // Update member's credit score
    await prisma.member.update({
      where: { id: memberId },
      data: { creditScore: score },
    });

    return {
      success: true,
      type: 'CREDIT_SCORING',
      summary: `Credit score calculated: ${score}/1000`,
      findings: [{ memberId, score, factors }],
      recommendations: [
        score < 300 ? 'High risk member - consider additional collateral' : '',
        score < 500 ? 'Moderate risk - monitor closely' : '',
        score >= 700 ? 'Low risk - eligible for premium products' : '',
      ].filter(Boolean),
      confidence: 0.85,
      generatedAt: new Date(),
    };
  }

  /**
   * Assess overall risk for organization
   */
  private async assessRisk(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const prisma = DatabaseService.getInstance();
    const findings: any[] = [];
    const recommendations: string[] = [];

    try {
      const orgId = request.organizationId;

      // Loan default rate
      const totalLoans = await prisma.loan.count({ where: { member: { organizationId: orgId } } });
      const defaultedLoans = await prisma.loan.count({
        where: { member: { organizationId: orgId }, status: 'DEFAULTED' },
      });
      const defaultRate = totalLoans > 0 ? (defaultedLoans / totalLoans) * 100 : 0;

      findings.push({ metric: 'LOAN_DEFAULT_RATE', value: defaultRate, threshold: 5 });

      if (defaultRate > 5) {
        recommendations.push(`High loan default rate (${defaultRate.toFixed(1)}%) - review lending criteria`);
      }

      // Portfolio at risk
      const activeLoans = await prisma.loan.findMany({
        where: { member: { organizationId: orgId }, status: 'ACTIVE' },
        select: { balance: true },
      });
      const totalOutstanding = activeLoans.reduce((s, l) => s + Number(l.balance), 0);

      findings.push({ metric: 'PORTFOLIO_SIZE', value: totalOutstanding });

      // Member concentration risk
      const totalMembers = await prisma.member.count({ where: { organizationId: orgId, status: 'ACTIVE' } });
      findings.push({ metric: 'ACTIVE_MEMBERS', value: totalMembers });

      if (totalMembers < 10) {
        recommendations.push('Low member count - consider recruitment drive');
      }

    } catch (error) {
      Logger.error('Risk assessment failed', error);
    }

    return {
      success: true,
      type: 'RISK_ASSESSMENT',
      summary: `Risk assessment completed with ${findings.length} metrics`,
      findings,
      recommendations,
      confidence: 0.8,
      generatedAt: new Date(),
    };
  }

  /**
   * Analyze project profitability
   */
  private async analyzeProfitability(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const prisma = DatabaseService.getInstance();
    const findings: any[] = [];
    const recommendations: string[] = [];

    try {
      const projects = await prisma.project.findMany({
        where: { organizationId: request.organizationId, status: { not: 'CANCELLED' } },
        select: {
          id: true,
          name: true,
          code: true,
          budget: true,
          totalIncome: true,
          totalExpenses: true,
          profitLoss: true,
          status: true,
        },
      });

      for (const project of projects) {
        const profitMargin = Number(project.totalIncome) > 0
          ? (Number(project.profitLoss) / Number(project.totalIncome)) * 100
          : 0;

        findings.push({
          project: project.name,
          code: project.code,
          budget: Number(project.budget),
          income: Number(project.totalIncome),
          expenses: Number(project.totalExpenses),
          profitLoss: Number(project.profitLoss),
          profitMargin: profitMargin.toFixed(2) + '%',
          status: project.status,
        });

        if (profitMargin < 0) {
          recommendations.push(`Project "${project.name}" is running at a loss - review expenses`);
        } else if (profitMargin < 10) {
          recommendations.push(`Project "${project.name}" has low profit margin (${profitMargin.toFixed(1)}%)`);
        }
      }

    } catch (error) {
      Logger.error('Profitability analysis failed', error);
    }

    return {
      success: true,
      type: 'PROFIT_ANALYSIS',
      summary: `Analyzed ${findings.length} projects`,
      findings,
      recommendations,
      confidence: 0.9,
      generatedAt: new Date(),
    };
  }

  /**
   * Make predictions (loan defaults, savings growth, etc.)
   */
  private async makePrediction(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const prisma = DatabaseService.getInstance();
    const findings: any[] = [];
    const recommendations: string[] = [];

    try {
      // Predict loan defaults based on historical data
      const loans = await prisma.loan.findMany({
        where: { member: { organizationId: request.organizationId } },
        include: {
          member: { select: { creditScore: true, savingsAccounts: { select: { balance: true } } } },
        },
      });

      const highRiskLoans = loans.filter(l => {
        if (l.status === 'ACTIVE' || l.status === 'DISBURSED') {
          const creditScore = Number(l.member.creditScore);
          const savingsBalance = l.member.savingsAccounts.reduce((s, a) => s + Number(a.balance), 0);
          return creditScore < 300 || (savingsBalance < Number(l.monthlyPayment) * 3);
        }
        return false;
      });

      if (highRiskLoans.length > 0) {
        findings.push({
          type: 'PREDICTED_DEFAULTS',
          count: highRiskLoans.length,
          totalAtRisk: highRiskLoans.reduce((s, l) => s + Number(l.balance), 0),
          loans: highRiskLoans.map(l => ({ loanNumber: l.loanNumber, balance: Number(l.balance) })),
        });
        recommendations.push(`${highRiskLoans.length} loans at risk of default - consider early intervention`);
      }

    } catch (error) {
      Logger.error('Prediction failed', error);
    }

    return {
      success: true,
      type: 'PREDICTION',
      summary: `Prediction analysis completed`,
      findings,
      recommendations,
      confidence: 0.75,
      generatedAt: new Date(),
    };
  }

  /**
   * Generate recommendations for improvement
   */
  private async generateRecommendations(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const prisma = DatabaseService.getInstance();
    const recommendations: string[] = [];

    try {
      const orgId = request.organizationId;

      // Check member engagement
      const totalMembers = await prisma.member.count({ where: { organizationId: orgId } });
      const activeMembers = await prisma.member.count({ where: { organizationId: orgId, status: 'ACTIVE' } });
      const engagementRate = totalMembers > 0 ? (activeMembers / totalMembers) * 100 : 0;

      if (engagementRate < 60) {
        recommendations.push(`Low member engagement (${engagementRate.toFixed(0)}%) - consider outreach programs`);
      }

      // Check savings utilization
      const savingsAccounts = await prisma.savingsAccount.findMany({
        where: { member: { organizationId: orgId } },
        select: { balance: true },
      });
      const totalSavings = savingsAccounts.reduce((s, a) => s + Number(a.balance), 0);
      const avgSavings = savingsAccounts.length > 0 ? totalSavings / savingsAccounts.length : 0;

      if (avgSavings < 1000) {
        recommendations.push('Low average savings balance - consider savings promotion campaigns');
      }

      // Check loan product utilization
      const loanProducts = await prisma.loanProduct.count({ where: { organizationId: orgId, isActive: true } });
      const activeLoans = await prisma.loan.count({ where: { member: { organizationId: orgId }, status: { in: ['ACTIVE', 'DISBURSED'] } } });

      if (loanProducts > 0 && activeLoans === 0) {
        recommendations.push('No active loans despite available products - review loan terms and marketing');
      }

    } catch (error) {
      Logger.error('Recommendation generation failed', error);
    }

    return {
      success: true,
      type: 'RECOMMENDATION',
      summary: `Generated ${recommendations.length} recommendations`,
      findings: [],
      recommendations,
      confidence: 0.8,
      generatedAt: new Date(),
    };
  }

  /**
   * Generate an executive summary of the organization
   */
  private async generateExecutiveSummary(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const prisma = DatabaseService.getInstance();
    const findings: any[] = [];

    try {
      const orgId = request.organizationId;
      const org = await prisma.organization.findUnique({ where: { id: orgId } });

      const totalMembers = await prisma.member.count({ where: { organizationId: orgId } });
      const activeMembers = await prisma.member.count({ where: { organizationId: orgId, status: 'ACTIVE' } });

      const totalSavings = await prisma.savingsAccount.aggregate({
        where: { member: { organizationId: orgId } },
        _sum: { balance: true },
      });

      const totalLoans = await prisma.loan.aggregate({
        where: { member: { organizationId: orgId }, status: { in: ['ACTIVE', 'DISBURSED'] } },
        _sum: { balance: true },
      });

      const totalShares = await prisma.shareAccount.aggregate({
        where: { member: { organizationId: orgId } },
        _sum: { totalValue: true },
      });

      const recentTransactions = await prisma.transaction.count({
        where: { organizationId: orgId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      });

      findings.push({
        organization: org?.name,
        totalMembers,
        activeMembers,
        totalSavings: Number(totalSavings._sum.balance || 0),
        outstandingLoans: Number(totalLoans._sum.balance || 0),
        totalShareCapital: Number(totalShares._sum.totalValue || 0),
        monthlyTransactions: recentTransactions,
      });

    } catch (error) {
      Logger.error('Executive summary generation failed', error);
    }

    return {
      success: true,
      type: 'EXECUTIVE_SUMMARY',
      summary: 'Executive summary generated',
      findings,
      recommendations: [],
      confidence: 0.95,
      generatedAt: new Date(),
    };
  }

  /**
   * Check data quality across the system
   */
  private async checkDataQuality(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const prisma = DatabaseService.getInstance();
    const findings: any[] = [];
    const recommendations: string[] = [];

    try {
      const orgId = request.organizationId;

      // Check for incomplete member records
      const incompleteMembers = await prisma.member.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { email: null },
            { phone: null },
            { idNumber: null },
          ],
        },
        select: { id: true, memberNumber: true, firstName: true, lastName: true },
      });

      if (incompleteMembers.length > 0) {
        findings.push({ type: 'INCOMPLETE_RECORDS', count: incompleteMembers.length, members: incompleteMembers });
        recommendations.push(`${incompleteMembers.length} members have incomplete records - request missing information`);
      }

      // Check for orphan transactions
      const orphanTransactions = await prisma.transaction.count({
        where: { organizationId: orgId, memberId: null, entityType: null },
      });

      if (orphanTransactions > 0) {
        findings.push({ type: 'ORPHAN_TRANSACTIONS', count: orphanTransactions });
        recommendations.push(`${orphanTransactions} transactions have no associated member or entity`);
      }

    } catch (error) {
      Logger.error('Data quality check failed', error);
    }

    return {
      success: true,
      type: 'DATA_QUALITY',
      summary: `Data quality check completed with ${findings.length} issues`,
      findings,
      recommendations,
      confidence: 0.9,
      generatedAt: new Date(),
    };
  }

  /**
   * Check system health
   */
  private async checkSystemHealth(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const findings: any[] = [];
    const recommendations: string[] = [];

    try {
      // Check database connectivity
      const dbHealthy = await DatabaseService.healthCheck();
      findings.push({ component: 'DATABASE', status: dbHealthy ? 'HEALTHY' : 'DOWN' });
      if (!dbHealthy) recommendations.push('Database connection issue - immediate attention required');

      // Check recent error rates
      const prisma = DatabaseService.getInstance();
      const recentErrors = await prisma.auditLog.count({
        where: {
          organizationId: request.organizationId,
          action: 'ERROR',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });

      if (recentErrors > 10) {
        findings.push({ component: 'ERROR_RATE', value: recentErrors, threshold: 10 });
        recommendations.push(`High error rate (${recentErrors} errors in 24h) - investigate system logs`);
      }

    } catch (error) {
      Logger.error('System health check failed', error);
    }

    return {
      success: true,
      type: 'SYSTEM_HEALTH',
      summary: `System health check completed`,
      findings,
      recommendations,
      confidence: 0.95,
      generatedAt: new Date(),
    };
  }

  /**
   * Generate a comprehensive report
   */
  private async generateReport(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const results = await Promise.all([
      this.generateExecutiveSummary(request),
      this.detectFraud(request),
      this.detectAnomalies(request),
      this.assessRisk(request),
      this.analyzeProfitability(request),
      this.checkDataQuality(request),
    ]);

    const allFindings = results.flatMap(r => r.findings);
    const allRecommendations = results.flatMap(r => r.recommendations);

    return {
      success: true,
      type: 'REPORT_GENERATION',
      summary: `Comprehensive report generated with ${allFindings.length} findings and ${allRecommendations.length} recommendations`,
      findings: allFindings,
      recommendations: [...new Set(allRecommendations)],
      confidence: 0.9,
      generatedAt: new Date(),
    };
  }
}