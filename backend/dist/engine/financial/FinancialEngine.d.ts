export interface TransactionRequest {
    type: string;
    amount: number;
    description?: string;
    reference?: string;
    referenceNumber?: string;
    paymentMethod?: string;
    paymentReference?: string;
    organizationId: string;
    branchId?: string;
    memberId?: string;
    entityType?: string;
    entityId?: string;
    createdById: string;
    metadata?: Record<string, any>;
}
export interface TransactionResult {
    success: boolean;
    transactionId: string;
    transactionNumber: string;
    journalEntryId?: string;
    balanceBefore?: number;
    balanceAfter?: number;
    message?: string;
}
export declare class FinancialEngine {
    private static instance;
    private eventBus;
    private constructor();
    static getInstance(): FinancialEngine;
    /**
     * Process a transaction through the central transaction engine.
     * Every financial action in the system MUST go through this method.
     */
    processTransaction(request: TransactionRequest): Promise<TransactionResult>;
    /**
     * Reverse a transaction (immutable reversal)
     */
    reverseTransaction(transactionId: string, reason: string, userId: string): Promise<TransactionResult>;
    /**
     * Publish a domain event for the transaction
     */
    private publishTransactionEvent;
    /**
     * Map transaction types to domain event types
     */
    private mapTransactionTypeToEvent;
}
//# sourceMappingURL=FinancialEngine.d.ts.map