"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditEngine = void 0;
const Logger_1 = require("../../core/services/Logger");
const DatabaseService_1 = require("../../core/services/DatabaseService");
class AuditEngine {
    static instance;
    constructor() { }
    static getInstance() {
        if (!AuditEngine.instance) {
            AuditEngine.instance = new AuditEngine();
        }
        return AuditEngine.instance;
    }
    /**
     * Log an audit entry for any action in the system.
     * Every action that modifies data MUST be logged through this.
     */
    async log(entry) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        try {
            await prisma.auditLog.create({
                data: {
                    userId: entry.userId,
                    action: entry.action,
                    resource: entry.resource,
                    resourceId: entry.resourceId,
                    changes: entry.changes || {},
                    ipAddress: entry.ipAddress,
                    userAgent: entry.userAgent,
                    deviceInfo: entry.deviceInfo || {},
                    location: entry.location,
                    module: entry.module,
                    organizationId: entry.organizationId,
                    branchId: entry.branchId,
                    duration: entry.duration,
                },
            });
            Logger_1.Logger.audit(entry.action, entry.userId || 'system', entry.resource, entry.resourceId || '');
        }
        catch (error) {
            Logger_1.Logger.error('Failed to create audit log', {
                error: error instanceof Error ? error.message : 'Unknown error',
                entry,
            });
        }
    }
    /**
     * Query audit logs with filters
     */
    async query(params) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const page = params.page || 1;
        const limit = params.limit || 50;
        const skip = (page - 1) * limit;
        const where = {};
        if (params.userId)
            where.userId = params.userId;
        if (params.action)
            where.action = params.action;
        if (params.resource)
            where.resource = params.resource;
        if (params.resourceId)
            where.resourceId = params.resourceId;
        if (params.module)
            where.module = params.module;
        if (params.organizationId)
            where.organizationId = params.organizationId;
        if (params.startDate || params.endDate) {
            where.createdAt = {};
            if (params.startDate)
                where.createdAt.gte = params.startDate;
            if (params.endDate)
                where.createdAt.lte = params.endDate;
        }
        const [data, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
            }),
            prisma.auditLog.count({ where }),
        ]);
        return { data, total, page, limit };
    }
    /**
     * Get audit summary statistics
     */
    async getStats(organizationId) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const [totalLogs, actionCounts, recentActions] = await Promise.all([
            prisma.auditLog.count({ where: { organizationId } }),
            prisma.auditLog.groupBy({
                by: ['action'],
                where: { organizationId },
                _count: true,
            }),
            prisma.auditLog.findMany({
                where: { organizationId },
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: {
                    id: true,
                    action: true,
                    resource: true,
                    createdAt: true,
                    user: { select: { firstName: true, lastName: true } },
                },
            }),
        ]);
        return {
            totalLogs,
            actionCounts: actionCounts.map((a) => ({ action: a.action, count: a._count })),
            recentActions,
        };
    }
}
exports.AuditEngine = AuditEngine;
//# sourceMappingURL=AuditEngine.js.map