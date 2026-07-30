export interface NotificationRequest {
    userId: string;
    title: string;
    message: string;
    type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ALERT' | 'REMINDER';
    data?: any;
    actionUrl?: string;
}
export declare class NotificationEngine {
    private static instance;
    private constructor();
    static getInstance(): NotificationEngine;
    /**
     * Send a notification to a user
     */
    send(request: NotificationRequest): Promise<void>;
    /**
     * Send notification to multiple users
     */
    sendBulk(requests: NotificationRequest[]): Promise<void>;
    /**
     * Send notification to all members of an organization
     */
    sendToOrganization(organizationId: string, title: string, message: string, type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ALERT' | 'REMINDER', data?: any): Promise<void>;
    /**
     * Send notification to all active members
     */
    sendToAllMembers(organizationId: string, title: string, message: string, type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ALERT' | 'REMINDER', data?: any): Promise<void>;
    /**
     * Mark notification as read
     */
    markAsRead(notificationId: string): Promise<void>;
    /**
     * Get unread notifications for a user
     */
    getUnread(userId: string): Promise<any[]>;
    /**
     * Get all notifications for a user with pagination
     */
    getUserNotifications(userId: string, page?: number, limit?: number): Promise<{
        data: any[];
        total: number;
        unreadCount: number;
    }>;
}
//# sourceMappingURL=NotificationEngine.d.ts.map