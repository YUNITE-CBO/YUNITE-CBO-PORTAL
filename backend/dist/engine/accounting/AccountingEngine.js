"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountingEngine = void 0;
const Logger_1 = require("../../core/services/Logger");
const IDGenerator_1 = require("../../core/services/IDGenerator");
const DatabaseService_1 = require("../../core/services/DatabaseService");
const AppError_1 = require("../../common/errors/AppError");
class AccountingEngine {
    static instance;
    constructor() { }
    static getInstance() {
        if (!AccountingEngine.instance) {
            AccountingEngine.instance = new AccountingEngine();
        }
        return AccountingEngine.instance;
    }
    /**
     * Create a journal entry with double-entry bookkeeping.
     * Every financial transaction MUST create balanced journal entries.
     */
    async createJournalEntry(request) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const entryNumber = IDGenerator_1.IDGenerator.entryNumber();
        try {
            // Validate lines
            if (request.lines.length < 2) {
                throw new AppError_1.BusinessRuleError('Journal entry must have at least 2 lines (debit and credit)');
            }
            // Calculate totals
            let totalDebit = 0;
            let totalCredit = 0;
            for (const line of request.lines) {
                const debit = line.debit || 0;
                const credit = line.credit || 0;
                if (debit > 0 && credit > 0) {
                    throw new AppError_1.BusinessRuleError('A journal line cannot have both debit and credit values');
                }
                if (debit === 0 && credit === 0) {
                    throw new AppError_1.BusinessRuleError('A journal line must have either debit or credit value');
                }
                totalDebit += debit;
                totalCredit += credit;
                // Verify account exists
                const account = await prisma.account.findFirst({
                    where: { code: line.accountCode, organizationId: request.organizationId },
                });
                if (!account) {
                    throw new AppError_1.BusinessRuleError(`Account not found: ${line.accountCode}`);
                }
            }
            // Validate balanced entry
            if (Math.abs(totalDebit - totalCredit) > 0.001) {
                throw new AppError_1.BusinessRuleError(`Journal entry is not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`);
            }
            // Create journal entry with lines
            const journalEntry = await prisma.journalEntry.create({
                data: {
                    entryNumber,
                    description: request.description,
                    reference: request.reference,
                    referenceType: request.referenceType,
                    totalDebit,
                    totalCredit,
                    isBalanced: true,
                    organizationId: request.organizationId,
                    branchId: request.branchId,
                    createdById: request.createdById,
                    journalLines: {
                        create: request.lines.map(line => ({
                            accountId: line.accountCode, // Using code as accountId for lookup simplicity
                            debit: line.debit || 0,
                            credit: line.credit || 0,
                            description: line.description || request.description,
                        })),
                    },
                },
                include: { journalLines: true },
            });
            Logger_1.Logger.info(`Journal entry created: ${entryNumber}`, {
                totalDebit,
                totalCredit,
                lineCount: request.lines.length,
            });
            return {
                success: true,
                journalEntryId: journalEntry.id,
                entryNumber: journalEntry.entryNumber,
                totalDebit,
                totalCredit,
                isBalanced: true,
            };
        }
        catch (error) {
            Logger_1.Logger.error(`Failed to create journal entry: ${entryNumber}`, {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }
    /**
     * Reverse a journal entry (create reversal entry)
     */
    async reverseJournalEntry(journalEntryId, reason, userId) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const original = await prisma.journalEntry.findUnique({
            where: { id: journalEntryId },
            include: { journalLines: true },
        });
        if (!original) {
            throw new AppError_1.BusinessRuleError('Journal entry not found');
        }
        if (original.isReversal) {
            throw new AppError_1.BusinessRuleError('Cannot reverse a reversal entry');
        }
        // Create reversal entry (swap debits and credits)
        const reversalLines = original.journalLines.map((line) => ({
            accountCode: line.accountId,
            debit: Number(line.credit) || 0,
            credit: Number(line.debit) || 0,
            description: `Reversal: ${line.description || original.description}`,
        }));
        const result = await this.createJournalEntry({
            description: `Reversal of ${original.entryNumber}: ${reason}`,
            reference: original.entryNumber,
            referenceType: 'REVERSAL',
            organizationId: original.organizationId,
            branchId: original.branchId || undefined,
            createdById: userId,
            lines: reversalLines,
        });
        // Mark original as reversed
        await prisma.journalEntry.update({
            where: { id: journalEntryId },
            data: {
                isReversal: true,
                reversedById: userId,
                reversedAt: new Date(),
            },
        });
        return result;
    }
    /**
     * Calculate account balance
     */
    async getAccountBalance(accountId) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const lines = await prisma.journalEntryLine.findMany({
            where: { accountId },
        });
        const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
        const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
        // For asset and expense accounts: balance = debit - credit
        // For liability, equity, and revenue accounts: balance = credit - debit
        const account = await prisma.account.findUnique({ where: { id: accountId } });
        let balance = 0;
        if (account) {
            if (account.type === 'ASSET' || account.type === 'EXPENSE') {
                balance = totalDebit - totalCredit;
            }
            else {
                balance = totalCredit - totalDebit;
            }
        }
        return {
            accountId,
            balance,
            totalDebit,
            totalCredit,
        };
    }
    /**
     * Generate trial balance
     */
    async getTrialBalance(organizationId, upToDate) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const date = upToDate || new Date();
        const accounts = await prisma.account.findMany({
            where: { organizationId, isActive: true },
        });
        const trialBalance = [];
        for (const account of accounts) {
            const lines = await prisma.journalEntryLine.findMany({
                where: {
                    accountId: account.id,
                    journalEntry: {
                        date: { lte: date },
                        status: 'COMPLETED',
                    },
                },
            });
            const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit), 0);
            const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit), 0);
            let balance = 0;
            if (account.type === 'ASSET' || account.type === 'EXPENSE') {
                balance = totalDebit - totalCredit;
            }
            else {
                balance = totalCredit - totalDebit;
            }
            trialBalance.push({
                accountCode: account.code,
                accountName: account.name,
                type: account.type,
                totalDebit,
                totalCredit,
                balance,
            });
        }
        return {
            date,
            totalAccounts: trialBalance.length,
            totalDebit: trialBalance.reduce((s, a) => s + a.totalDebit, 0),
            totalCredit: trialBalance.reduce((s, a) => s + a.totalCredit, 0),
            accounts: trialBalance,
        };
    }
    /**
     * Generate balance sheet
     */
    async getBalanceSheet(organizationId, asOfDate) {
        const trialBalance = await this.getTrialBalance(organizationId, asOfDate || new Date());
        const balanceSheet = {
            assets: trialBalance.accounts.filter((a) => a.type === 'ASSET'),
            liabilities: trialBalance.accounts.filter((a) => a.type === 'LIABILITY'),
            equity: trialBalance.accounts.filter((a) => a.type === 'EQUITY'),
        };
        const totalAssets = balanceSheet.assets.reduce((s, a) => s + a.balance, 0);
        const totalLiabilities = balanceSheet.liabilities.reduce((s, a) => s + a.balance, 0);
        const totalEquity = balanceSheet.equity.reduce((s, a) => s + a.balance, 0);
        return {
            asOfDate: asOfDate || new Date(),
            totalAssets,
            totalLiabilities,
            totalEquity,
            totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
            assets: balanceSheet.assets,
            liabilities: balanceSheet.liabilities,
            equity: balanceSheet.equity,
            isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
        };
    }
    /**
     * Generate income statement
     */
    async getIncomeStatement(organizationId, startDate, endDate) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const revenueAccounts = await prisma.account.findMany({
            where: { organizationId, type: 'REVENUE', isActive: true },
        });
        const expenseAccounts = await prisma.account.findMany({
            where: { organizationId, type: 'EXPENSE', isActive: true },
        });
        const getAccountBalance = async (accountId) => {
            const lines = await prisma.journalEntryLine.findMany({
                where: {
                    accountId,
                    journalEntry: {
                        date: { gte: startDate, lte: endDate },
                        status: 'COMPLETED',
                    },
                },
            });
            const credit = lines.reduce((s, l) => s + Number(l.credit), 0);
            const debit = lines.reduce((s, l) => s + Number(l.debit), 0);
            return { totalCredit: credit, totalDebit: debit, balance: credit - debit };
        };
        const revenues = [];
        for (const acc of revenueAccounts) {
            const bal = await getAccountBalance(acc.id);
            revenues.push({ ...acc, ...bal });
        }
        const expenses = [];
        for (const acc of expenseAccounts) {
            const bal = await getAccountBalance(acc.id);
            expenses.push({ ...acc, ...bal });
        }
        const totalRevenue = revenues.reduce((s, r) => s + r.balance, 0);
        const totalExpenses = expenses.reduce((s, e) => s + e.balance, 0);
        const netIncome = totalRevenue - totalExpenses;
        return {
            period: { startDate, endDate },
            totalRevenue,
            totalExpenses,
            netIncome,
            revenues,
            expenses,
        };
    }
}
exports.AccountingEngine = AccountingEngine;
//# sourceMappingURL=AccountingEngine.js.map