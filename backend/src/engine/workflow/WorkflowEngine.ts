import { Logger } from '../../core/services/Logger';
import { IDGenerator } from '../../core/services/IDGenerator';
import { DatabaseService } from '../../core/services/DatabaseService';
import { ApprovalStatus } from '../../core/domain/ValueObject';
import { BusinessRuleError } from '../../common/errors/AppError';

export interface WorkflowDefinition {
  name: string;
  entityType: string;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  name: string;
  order: number;
  requiredRoles: string[];
  action: string;
  fromStatus: string;
  toStatus: string;
}

export interface ApprovalRequest {
  entityType: string;
  entityId: string;
  action: string;
  requestedById: string;
  organizationId: string;
  comments?: string;
  metadata?: any;
}

export class WorkflowEngine {
  private static instance: WorkflowEngine;
  private workflows: Map<string, WorkflowDefinition> = new Map();

  private constructor() {
    this.registerDefaultWorkflows();
  }

  public static getInstance(): WorkflowEngine {
    if (!WorkflowEngine.instance) {
      WorkflowEngine.instance = new WorkflowEngine();
    }
    return WorkflowEngine.instance;
  }

  private registerDefaultWorkflows(): void {
    // Loan Approval Workflow
    this.registerWorkflow({
      name: 'LOAN_APPROVAL',
      entityType: 'loan',
      steps: [
        { name: 'SUBMIT', order: 1, requiredRoles: ['MEMBER', 'OFFICER'], action: 'submit', fromStatus: 'DRAFT', toStatus: 'PENDING' },
        { name: 'REVIEW', order: 2, requiredRoles: ['LOAN_OFFICER', 'MANAGER'], action: 'review', fromStatus: 'PENDING', toStatus: 'UNDER_REVIEW' },
        { name: 'APPROVE', order: 3, requiredRoles: ['MANAGER', 'BOARD'], action: 'approve', fromStatus: 'UNDER_REVIEW', toStatus: 'APPROVED' },
        { name: 'DISBURSE', order: 4, requiredRoles: ['MANAGER', 'FINANCE'], action: 'disburse', fromStatus: 'APPROVED', toStatus: 'DISBURSED' },
      ],
    });

    // Member Registration Workflow
    this.registerWorkflow({
      name: 'MEMBER_REGISTRATION',
      entityType: 'member',
      steps: [
        { name: 'APPLY', order: 1, requiredRoles: ['MEMBER', 'OFFICER'], action: 'apply', fromStatus: 'DRAFT', toStatus: 'PENDING' },
        { name: 'VERIFY', order: 2, requiredRoles: ['OFFICER', 'MANAGER'], action: 'verify', fromStatus: 'PENDING', toStatus: 'ACTIVE' },
      ],
    });

    // Withdrawal Approval Workflow
    this.registerWorkflow({
      name: 'WITHDRAWAL_APPROVAL',
      entityType: 'withdrawal',
      steps: [
        { name: 'REQUEST', order: 1, requiredRoles: ['MEMBER'], action: 'request', fromStatus: 'DRAFT', toStatus: 'PENDING' },
        { name: 'APPROVE', order: 2, requiredRoles: ['MANAGER'], action: 'approve', fromStatus: 'PENDING', toStatus: 'APPROVED' },
      ],
    });

    // Project Approval Workflow
    this.registerWorkflow({
      name: 'PROJECT_APPROVAL',
      entityType: 'project',
      steps: [
        { name: 'PROPOSE', order: 1, requiredRoles: ['MANAGER'], action: 'propose', fromStatus: 'DRAFT', toStatus: 'PENDING' },
        { name: 'REVIEW', order: 2, requiredRoles: ['BOARD'], action: 'review', fromStatus: 'PENDING', toStatus: 'UNDER_REVIEW' },
        { name: 'APPROVE', order: 3, requiredRoles: ['BOARD', 'DIRECTOR'], action: 'approve', fromStatus: 'UNDER_REVIEW', toStatus: 'APPROVED' },
      ],
    });

    // Procurement Workflow
    this.registerWorkflow({
      name: 'PROCUREMENT_APPROVAL',
      entityType: 'procurement',
      steps: [
        { name: 'REQUEST', order: 1, requiredRoles: ['OFFICER', 'MANAGER'], action: 'request', fromStatus: 'DRAFT', toStatus: 'PENDING' },
        { name: 'APPROVE', order: 2, requiredRoles: ['MANAGER', 'BOARD'], action: 'approve', fromStatus: 'PENDING', toStatus: 'APPROVED' },
      ],
    });

    // Payroll Approval Workflow
    this.registerWorkflow({
      name: 'PAYROLL_APPROVAL',
      entityType: 'payroll',
      steps: [
        { name: 'PROCESS', order: 1, requiredRoles: ['FINANCE'], action: 'process', fromStatus: 'DRAFT', toStatus: 'PENDING' },
        { name: 'APPROVE', order: 2, requiredRoles: ['MANAGER', 'DIRECTOR'], action: 'approve', fromStatus: 'PENDING', toStatus: 'APPROVED' },
      ],
    });
  }

  public registerWorkflow(workflow: WorkflowDefinition): void {
    const key = `${workflow.entityType}:${workflow.name}`;
    this.workflows.set(key, workflow);
    Logger.info(`Workflow registered: ${key}`);
  }

  public getWorkflow(entityType: string, name: string): WorkflowDefinition | undefined {
    return this.workflows.get(`${entityType}:${name}`);
  }

  public async startApproval(request: ApprovalRequest): Promise<any> {
    const prisma = DatabaseService.getInstance();

    // Find matching workflow
    const workflow = this.findMatchingWorkflow(request.entityType, request.action);
    if (!workflow) {
      throw new BusinessRuleError(`No workflow found for ${request.entityType}:${request.action}`);
    }

    const firstStep = workflow.steps[0];
    if (!firstStep) {
      throw new BusinessRuleError(`Workflow ${workflow.name} has no steps defined`);
    }

    // Create approval record
    const approval = await prisma.approval.create({
      data: {
        entityType: request.entityType,
        entityId: request.entityId,
        action: request.action,
        status: 'PENDING',
        requestedById: request.requestedById,
        level: 1,
        maxLevel: workflow.steps.length,
        organizationId: request.organizationId,
        comments: request.comments,
      },
    });

    // Log workflow action
    await prisma.workflowAction.create({
      data: {
        workflowName: workflow.name,
        entityType: request.entityType,
        entityId: request.entityId,
        action: firstStep.action,
        fromStatus: firstStep.fromStatus,
        toStatus: firstStep.toStatus,
        performedById: request.requestedById,
        comments: request.comments,
        metadata: request.metadata || {},
      },
    });

    Logger.info(`Approval started for ${request.entityType}:${request.entityId}`, {
      workflow: workflow.name,
      approvalId: approval.id,
    });

    return approval;
  }

  public async processApproval(
    approvalId: string,
    userId: string,
    decision: 'APPROVED' | 'REJECTED',
    comments?: string
  ): Promise<any> {
    const prisma = DatabaseService.getInstance();
    const approval = await prisma.approval.findUnique({ where: { id: approvalId } });

    if (!approval) {
      throw new BusinessRuleError('Approval not found');
    }

    if (approval.status !== 'PENDING') {
      throw new BusinessRuleError('Approval is already processed');
    }

    const workflow = this.findMatchingWorkflow(approval.entityType, approval.action);
    if (!workflow) {
      throw new BusinessRuleError('Workflow not found');
    }

    if (decision === 'REJECTED') {
      await prisma.approval.update({
        where: { id: approvalId },
        data: {
          status: 'REJECTED',
          approvedById: userId,
          approvedAt: new Date(),
          rejectionReason: comments,
        },
      });

      await prisma.workflowAction.create({
        data: {
          workflowName: workflow.name,
          entityType: approval.entityType,
          entityId: approval.entityId,
          action: 'reject',
          fromStatus: 'PENDING',
          toStatus: 'REJECTED',
          performedById: userId,
          comments,
        },
      });

      return { status: 'REJECTED' };
    }

    // Check if more approval levels needed
    const isLastLevel = approval.level >= approval.maxLevel;
    const currentStep = workflow.steps[approval.level - 1];

    if (isLastLevel) {
      // Final approval
      const finalStep = workflow.steps[workflow.steps.length - 1];
      await prisma.approval.update({
        where: { id: approvalId },
        data: {
          status: 'APPROVED',
          approvedById: userId,
          approvedAt: new Date(),
        },
      });

      await prisma.workflowAction.create({
        data: {
          workflowName: workflow.name,
          entityType: approval.entityType,
          entityId: approval.entityId,
          action: finalStep.action,
          fromStatus: currentStep?.fromStatus || 'PENDING',
          toStatus: 'APPROVED',
          performedById: userId,
          comments,
        },
      });

      return { status: 'APPROVED', final: true };
    } else {
      // Move to next approval level
      const nextStep = workflow.steps[approval.level];

      await prisma.approval.update({
        where: { id: approvalId },
        data: {
          status: 'PENDING',
          approvedById: userId,
          approvedAt: new Date(),
          level: { increment: 1 },
        },
      });

      await prisma.workflowAction.create({
        data: {
          workflowName: workflow.name,
          entityType: approval.entityType,
          entityId: approval.entityId,
          action: `approve_level_${approval.level}`,
          fromStatus: currentStep?.fromStatus || 'PENDING',
          toStatus: nextStep?.fromStatus || 'PENDING',
          performedById: userId,
          comments,
        },
      });

      return { status: 'PENDING_NEXT_LEVEL', currentLevel: approval.level + 1, maxLevel: approval.maxLevel };
    }
  }

  private findMatchingWorkflow(entityType: string, action: string): WorkflowDefinition | undefined {
    for (const [_, workflow] of this.workflows) {
      if (workflow.entityType === entityType) {
        const matchingStep = workflow.steps.find(s => s.action === action);
        if (matchingStep) {
          return workflow;
        }
      }
    }
    return undefined;
  }

  public getPendingApprovals(organizationId: string, userId?: string): Promise<any> {
    return DatabaseService.getInstance().approval.findMany({
      where: {
        organizationId,
        status: 'PENDING',
        ...(userId ? { requestedById: userId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  public getApprovalHistory(entityType: string, entityId: string): Promise<any> {
    return DatabaseService.getInstance().workflowAction.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' },
      include: {
        performedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }
}