"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancialEngine = void 0;
const Logger_1 = require("../../core/services/Logger");
const IDGenerator_1 = require("../../core/services/IDGenerator");
const DatabaseService_1 = require("../../core/services/DatabaseService");
const InMemoryEventBus_1 = require("../../events/bus/InMemoryEventBus");
const ValueObject_1 = require("../../core/domain/ValueObject");
const AppError_1 = require("../../common/errors/AppError");
class FinancialEngine {
    static instance;
    eventBus;
    constructor() {
        this.eventBus = InMemoryEventBus_1.InMemoryEventBus.getInstance();
    }
    static getInstance() {
        if (!FinancialEngine.instance) {
            FinancialEngine.instance = new FinancialEngine();
        }
        return FinancialEngine.instance;
    }
    /**
     * Process a transaction through the central transaction engine.
     * Every financial action in the system MUST go through this method.
     */
    async processTransaction(request) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const transactionNumber = IDGenerator_1.IDGenerator.transactionNumber();
        try {
            Logger_1.Logger.info(`Processing transaction: ${request.type} - ${request.amount}`, {
                transactionNumber,
                memberId: request.memberId,
                organizationId: request.organizationId,
            });
            // Create the transaction record
            const transaction = await prisma.transaction.create({
                data: {
                    transactionNumber,
                    type: request.type.toUpperCase(),
                    amount: request.amount,
                    description: request.description || '',
                    reference: request.reference,
                    referenceNumber: request.referenceNumber,
                    paymentMethod: request.paymentMethod,
                    paymentReference: request.paymentReference,
                    status: 'COMPLETED',
                    organizationId: request.organizationId,
                    branchId: request.branchId,
                    memberId: request.memberId,
                    entityType: request.entityType,
                    entityId: request.entityId,
                    createdById: request.createdById,
                },
            });
            // Publish transaction event
            await this.publishTransactionEvent(transaction, request);
            Logger_1.Logger.info(`Transaction completed: ${transactionNumber}`, {
                transactionId: transaction.id,
                amount: request.amount,
                type: request.type,
            });
            return {
                success: true,
                transactionId: transaction.id,
                transactionNumber: transaction.transactionNumber,
                message: 'Transaction processed successfully',
            };
        }
        catch (error) {
            Logger_1.Logger.error(`Transaction failed: ${transactionNumber}`, {
                error: error instanceof Error ? error.message : 'Unknown error',
                request,
            });
            if (error instanceof AppError_1.AppError) {
                throw error;
            }
            throw new AppError_1.AppError('Failed to process transaction', 500, 'TRANSACTION_FAILED');
        }
    }
    /**
     * Reverse a transaction (immutable reversal)
     */
    async reverseTransaction(transactionId, reason, userId) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const originalTxn = await prisma.transaction.findUnique({
            where: { id: transactionId },
        });
        if (!originalTxn) {
            throw new AppError_1.AppError('Transaction not found', 404, 'NOT_FOUND');
        }
        if (originalTxn.status === 'REVERSED') {
            throw new AppError_1.BusinessRuleError('Transaction is already reversed');
        }
        const reversalNumber = IDGenerator_1.IDGenerator.transactionNumber();
        const reversal = await prisma.transaction.create({
            data: {
                transactionNumber: reversalNumber,
                type: 'REVERSAL',
                amount: originalTxn.amount,
                description: `Reversal: ${reason}`,
                reference: originalTxn.transactionNumber,
                status: 'COMPLETED',
                organizationId: originalTxn.organizationId,
                branchId: originalTxn.branchId,
                memberId: originalTxn.memberId,
                createdById: userId,
                reversedById: userId,
                reversedAt: new Date(),
                reversalReason: reason,
            },
        });
        // Mark original as reversed
        await prisma.transaction.update({
            where: { id: transactionId },
            data: {
                status: 'REVERSED',
                reversedById: userId,
                reversedAt: new Date(),
                reversalReason: reason,
            },
        });
        return {
            success: true,
            transactionId: reversal.id,
            transactionNumber: reversalNumber,
            message: 'Transaction reversed successfully',
        };
    }
    /**
     * Publish a domain event for the transaction
     */
    async publishTransactionEvent(transaction, request) {
        const event = {
            eventId: IDGenerator_1.IDGenerator.uuid(),
            eventType: this.mapTransactionTypeToEvent(request.type),
            aggregateId: transaction.id,
            aggregateType: 'Transaction',
            timestamp: new Date(),
            data: {
                transactionId: transaction.id,
                transactionNumber: transaction.transactionNumber,
                type: request.type,
                amount: request.amount,
                description: request.description,
                memberId: request.memberId,
                organizationId: request.organizationId,
                entityType: request.entityType,
                entityId: request.entityId,
                metadata: request.metadata,
            },
            metadata: {
                userId: request.createdById,
                organizationId: request.organizationId,
                branchId: request.branchId,
                correlationId: IDGenerator_1.IDGenerator.uuid(),
            },
        };
        await this.eventBus.publish(event);
    }
    /**
     * Map transaction types to domain event types
     */
    mapTransactionTypeToEvent(type) {
        const eventMap = {
            SAVINGS_DEPOSIT: ValueObject_1.EventType.SAVINGS_DEPOSIT,
            SAVINGS_WITHDRAWAL: ValueObject_1.EventType.SAVINGS_WITHDRAWAL,
            LOAN_DISBURSEMENT: ValueObject_1.EventType.LOAN_DISBURSED,
            LOAN_REPAYMENT: ValueObject_1.EventType.LOAN_REPAID,
            SHARE_PURCHASE: ValueObject_1.EventType.SHARE_PURCHASED,
            TRANSFER: ValueObject_1.EventType.TRANSACTION_POSTED,
            ADJUSTMENT: ValueObject_1.EventType.TRANSACTION_POSTED,
            REVERSAL: ValueObject_1.EventType.TRANSACTION_POSTED,
            DIVIDEND_DISTRIBUTION: ValueObject_1.EventType.PROFIT_DISTRIBUTED,
        };
        return eventMap[type] || ValueObject_1.EventType.TRANSACTION_POSTED;
    }
}
exports.FinancialEngine = FinancialEngine;
//# sourceMappingURL=FinancialEngine.js.map