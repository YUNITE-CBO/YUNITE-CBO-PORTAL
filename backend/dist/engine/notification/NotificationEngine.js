"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationEngine = void 0;
const Logger_1 = require("../../core/services/Logger");
const DatabaseService_1 = require("../../core/services/DatabaseService");
class NotificationEngine {
    static instance;
    constructor() { }
    static getInstance() {
        if (!NotificationEngine.instance) {
            NotificationEngine.instance = new NotificationEngine();
        }
        return NotificationEngine.instance;
    }
    /**
     * Send a notification to a user
     */
    async send(request) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        try {
            await prisma.notification.create({
                data: {
                    userId: request.userId,
                    title: request.title,
                    message: request.message,
                    type: (request.type || 'INFO'),
                    data: request.data || {},
                    actionUrl: request.actionUrl,
                },
            });
        }
        catch (error) {
            Logger_1.Logger.error('Failed to send notification', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId: request.userId,
            });
        }
    }
    /**
     * Send notification to multiple users
     */
    async sendBulk(requests) {
        await Promise.all(requests.map(req => this.send(req)));
    }
    /**
     * Send notification to all members of an organization
     */
    async sendToOrganization(organizationId, title, message, type, data) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const users = await prisma.user.findMany({
            where: { organizationId, status: 'ACTIVE' },
        });
        await this.sendBulk(users.map((user) => ({
            userId: user.id,
            title,
            message,
            type,
            data,
        })));
    }
    /**
     * Send notification to all active members
     */
    async sendToAllMembers(organizationId, title, message, type, data) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const members = await prisma.user.findMany({
            where: {
                organizationId,
                status: 'ACTIVE',
            },
        });
        await this.sendBulk(members.map((member) => ({
            userId: member.id,
            title,
            message,
            type,
            data,
        })));
    }
    /**
     * Mark notification as read
     */
    async markAsRead(notificationId) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        await prisma.notification.update({
            where: { id: notificationId },
            data: { isRead: true, readAt: new Date() },
        });
    }
    /**
     * Get unread notifications for a user
     */
    async getUnread(userId) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        return prisma.notification.findMany({
            where: { userId, isRead: false },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
    }
    /**
     * Get all notifications for a user with pagination
     */
    async getUserNotifications(userId, page = 1, limit = 20) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const skip = (page - 1) * limit;
        const [data, total, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.notification.count({ where: { userId } }),
            prisma.notification.count({ where: { userId, isRead: false } }),
        ]);
        return { data, total, unreadCount };
    }
}
exports.NotificationEngine = NotificationEngine;
//# sourceMappingURL=NotificationEngine.js.map