export interface ReportRequest {
    type: 'MEMBER_STATEMENT' | 'ACCOUNT_STATEMENT' | 'LOAN_STATEMENT' | 'SAVINGS_STATEMENT' | 'PROJECT_STATEMENT' | 'ORGANIZATION_STATEMENT' | 'BRANCH_REPORT' | 'PROFIT_REPORT' | 'INCOME_REPORT' | 'EXPENSE_REPORT' | 'CASH_FLOW' | 'BALANCE_SHEET' | 'TRIAL_BALANCE' | 'GENERAL_LEDGER' | 'AUDIT_REPORT' | 'COMPLIANCE_REPORT' | 'EXECUTIVE_DASHBOARD' | 'AI_REPORT' | 'CUSTOM';
    organizationId: string;
    branchId?: string;
    memberId?: string;
    startDate?: Date;
    endDate?: Date;
    format?: 'json' | 'csv' | 'pdf';
    filters?: Record<string, any>;
}
export declare class ReportingEngine {
    private static instance;
    private constructor();
    static getInstance(): ReportingEngine;
    generateReport(request: ReportRequest): Promise<any>;
    private generateBalanceSheet;
    private generateTrialBalance;
    private generateIncomeStatement;
    private generateMemberStatement;
    private generateSavingsStatement;
    private generateLoanStatement;
    private generateExecutiveDashboard;
    private generateBranchReport;
    private generateCashFlow;
    private generateGeneralLedger;
    private generateAuditReport;
    private generateCustomReport;
}
//# sourceMappingURL=ReportingEngine.d.ts.map