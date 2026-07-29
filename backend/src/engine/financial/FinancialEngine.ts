import { Logger } from '../../core/services/Logger';
import { IDGenerator } from '../../core/services/IDGenerator';
import { DatabaseService } from '../../core/services/DatabaseService';
import { InMemoryEventBus } from '../../events/bus/InMemoryEventBus';
import { EventType } from '../../core/domain/ValueObject';
import { DomainEvent } from '../../core/domain/DomainEvent';
import {
  AppError,
  InsufficientFundsError,
  BusinessRuleError,
} from '../../common/errors/AppError';

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

export class FinancialEngine {
  private static instance: FinancialEngine;
  private eventBus: InMemoryEventBus;

  private constructor() {
    this.eventBus = InMemoryEventBus.getInstance();
  }

  public static getInstance(): FinancialEngine {
    if (!FinancialEngine.instance) {
      FinancialEngine.instance = new FinancialEngine();
    }
    return FinancialEngine.instance;
  }

  /**
   * Process a transaction through the central transaction engine.
   * Every financial action in the system MUST go through this method.
   */
  public async processTransaction(request: TransactionRequest): Promise<TransactionResult> {
    const prisma = DatabaseService.getInstance();
    const transactionNumber = IDGenerator.transactionNumber();

    try {
      Logger.info(`Processing transaction: ${request.type} - ${request.amount}`, {
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
          paymentMethod: request.paymentMethod as any,
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

      Logger.info(`Transaction completed: ${transactionNumber}`, {
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
    } catch (error) {
      Logger.error(`Transaction failed: ${transactionNumber}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        request,
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to process transaction',
        500,
        'TRANSACTION_FAILED'
      );
    }
  }

  /**
   * Reverse a transaction (immutable reversal)
   */
  public async reverseTransaction(
    transactionId: string,
    reason: string,
    userId: string
  ): Promise<TransactionResult> {
    const prisma = DatabaseService.getInstance();
    const originalTxn = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!originalTxn) {
      throw new AppError('Transaction not found', 404, 'NOT_FOUND');
    }

    if (originalTxn.status === 'REVERSED') {
      throw new BusinessRuleError('Transaction is already reversed');
    }

    const reversalNumber = IDGenerator.transactionNumber();

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
  private async publishTransactionEvent(transaction: any, request: TransactionRequest): Promise<void> {
    const event: DomainEvent = {
      eventId: IDGenerator.uuid(),
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
        correlationId: IDGenerator.uuid(),
      },
    };

    await this.eventBus.publish(event);
  }

  /**
   * Map transaction types to domain event types
   */
  private mapTransactionTypeToEvent(type: string): EventType {
    const eventMap: Record<string, EventType> = {
      SAVINGS_DEPOSIT: EventType.SAVINGS_DEPOSIT,
      SAVINGS_WITHDRAWAL: EventType.SAVINGS_WITHDRAWAL,
      LOAN_DISBURSEMENT: EventType.LOAN_DISBURSED,
      LOAN_REPAYMENT: EventType.LOAN_REPAID,
      SHARE_PURCHASE: EventType.SHARE_PURCHASED,
      TRANSFER: EventType.TRANSACTION_POSTED,
      ADJUSTMENT: EventType.TRANSACTION_POSTED,
      REVERSAL: EventType.TRANSACTION_POSTED,
      DIVIDEND_DISTRIBUTION: EventType.PROFIT_DISTRIBUTED,
    };

    return eventMap[type] || EventType.TRANSACTION_POSTED;
  }
}