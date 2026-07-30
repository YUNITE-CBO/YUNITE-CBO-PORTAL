export interface JournalEntryRequest {
    description: string;
    reference?: string;
    referenceType?: string;
    organizationId: string;
    branchId?: string;
    createdById: string;
    lines: JournalLineRequest[];
}
export interface JournalLineRequest {
    accountCode: string;
    debit?: number;
    credit?: number;
    description?: string;
}
export interface JournalEntryResult {
    success: boolean;
    journalEntryId: string;
    entryNumber: string;
    totalDebit: number;
    totalCredit: number;
    isBalanced: boolean;
}
export declare class AccountingEngine {
    private static instance;
    private constructor();
    static getInstance(): AccountingEngine;
    /**
     * Create a journal entry with double-entry bookkeeping.
     * Every financial transaction MUST create balanced journal entries.
     */
    createJournalEntry(request: JournalEntryRequest): Promise<JournalEntryResult>;
    /**
     * Reverse a journal entry (create reversal entry)
     */
    reverseJournalEntry(journalEntryId: string, reason: string, userId: string): Promise<JournalEntryResult>;
    /**
     * Calculate account balance
     */
    getAccountBalance(accountId: string): Promise<{
        accountId: string;
        balance: number;
        totalDebit: number;
        totalCredit: number;
    }>;
    /**
     * Generate trial balance
     */
    getTrialBalance(organizationId: string, upToDate?: Date): Promise<{
        date: Date;
        totalAccounts: number;
        totalDebit: number;
        totalCredit: number;
        accounts: Array<{
            accountCode: string;
            accountName: string;
            type: string;
            totalDebit: number;
            totalCredit: number;
            balance: number;
        }>;
    }>;
    /**
     * Generate balance sheet
     */
    getBalanceSheet(organizationId: string, asOfDate?: Date): Promise<{
        asOfDate: Date;
        totalAssets: number;
        totalLiabilities: number;
        totalEquity: number;
        totalLiabilitiesAndEquity: number;
        assets: Array<{
            accountCode: string;
            accountName: string;
            type: string;
            totalDebit: number;
            totalCredit: number;
            balance: number;
        }>;
        liabilities: Array<{
            accountCode: string;
            accountName: string;
            type: string;
            totalDebit: number;
            totalCredit: number;
            balance: number;
        }>;
        equity: Array<{
            accountCode: string;
            accountName: string;
            type: string;
            totalDebit: number;
            totalCredit: number;
            balance: number;
        }>;
        isBalanced: boolean;
    }>;
    /**
     * Generate income statement
     */
    getIncomeStatement(organizationId: string, startDate: Date, endDate: Date): Promise<any>;
}
//# sourceMappingURL=AccountingEngine.d.ts.map