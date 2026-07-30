export interface AuditEntry {
    userId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    changes?: any;
    ipAddress?: string;
    userAgent?: string;
    deviceInfo?: any;
    location?: string;
    module?: string;
    organizationId?: string;
    branchId?: string;
    duration?: number;
}
export declare class AuditEngine {
    private static instance;
    private constructor();
    static getInstance(): AuditEngine;
    /**
     * Log an audit entry for any action in the system.
     * Every action that modifies data MUST be logged through this.
     */
    log(entry: AuditEntry): Promise<void>;
    /**
     * Query audit logs with filters
     */
    query(params: {
        userId?: string;
        action?: string;
        resource?: string;
        resourceId?: string;
        module?: string;
        organizationId?: string;
        startDate?: Date;
        endDate?: Date;
        page?: number;
        limit?: number;
    }): Promise<{
        data: any[];
        total: number;
        page: number;
        limit: number;
    }>;
    /**
     * Get audit summary statistics
     */
    getStats(organizationId: string): Promise<any>;
}
//# sourceMappingURL=AuditEngine.d.ts.map