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
export declare class WorkflowEngine {
    private static instance;
    private workflows;
    private constructor();
    static getInstance(): WorkflowEngine;
    private registerDefaultWorkflows;
    registerWorkflow(workflow: WorkflowDefinition): void;
    getWorkflow(entityType: string, name: string): WorkflowDefinition | undefined;
    startApproval(request: ApprovalRequest): Promise<any>;
    processApproval(approvalId: string, userId: string, decision: 'APPROVED' | 'REJECTED', comments?: string): Promise<any>;
    private findMatchingWorkflow;
    getPendingApprovals(organizationId: string, userId?: string): Promise<any>;
    getApprovalHistory(entityType: string, entityId: string): Promise<any>;
}
//# sourceMappingURL=WorkflowEngine.d.ts.map