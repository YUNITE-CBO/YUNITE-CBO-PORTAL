"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowEngine = void 0;
const Logger_1 = require("../../core/services/Logger");
const DatabaseService_1 = require("../../core/services/DatabaseService");
const AppError_1 = require("../../common/errors/AppError");
class WorkflowEngine {
    static instance;
    workflows = new Map();
    constructor() {
        this.registerDefaultWorkflows();
    }
    static getInstance() {
        if (!WorkflowEngine.instance) {
            WorkflowEngine.instance = new WorkflowEngine();
        }
        return WorkflowEngine.instance;
    }
    registerDefaultWorkflows() {
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
    registerWorkflow(workflow) {
        const key = `${workflow.entityType}:${workflow.name}`;
        this.workflows.set(key, workflow);
        Logger_1.Logger.info(`Workflow registered: ${key}`);
    }
    getWorkflow(entityType, name) {
        return this.workflows.get(`${entityType}:${name}`);
    }
    async startApproval(request) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        // Find matching workflow
        const workflow = this.findMatchingWorkflow(request.entityType, request.action);
        if (!workflow) {
            throw new AppError_1.BusinessRuleError(`No workflow found for ${request.entityType}:${request.action}`);
        }
        const firstStep = workflow.steps[0];
        if (!firstStep) {
            throw new AppError_1.BusinessRuleError(`Workflow ${workflow.name} has no steps defined`);
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
        Logger_1.Logger.info(`Approval started for ${request.entityType}:${request.entityId}`, {
            workflow: workflow.name,
            approvalId: approval.id,
        });
        return approval;
    }
    async processApproval(approvalId, userId, decision, comments) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const approval = await prisma.approval.findUnique({ where: { id: approvalId } });
        if (!approval) {
            throw new AppError_1.BusinessRuleError('Approval not found');
        }
        if (approval.status !== 'PENDING') {
            throw new AppError_1.BusinessRuleError('Approval is already processed');
        }
        const workflow = this.findMatchingWorkflow(approval.entityType, approval.action);
        if (!workflow) {
            throw new AppError_1.BusinessRuleError('Workflow not found');
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
        }
        else {
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
    findMatchingWorkflow(entityType, action) {
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
    getPendingApprovals(organizationId, userId) {
        return DatabaseService_1.DatabaseService.getInstance().approval.findMany({
            where: {
                organizationId,
                status: 'PENDING',
                ...(userId ? { requestedById: userId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
    }
    getApprovalHistory(entityType, entityId) {
        return DatabaseService_1.DatabaseService.getInstance().workflowAction.findMany({
            where: { entityType, entityId },
            orderBy: { createdAt: 'asc' },
            include: {
                performedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });
    }
}
exports.WorkflowEngine = WorkflowEngine;
//# sourceMappingURL=WorkflowEngine.js.map