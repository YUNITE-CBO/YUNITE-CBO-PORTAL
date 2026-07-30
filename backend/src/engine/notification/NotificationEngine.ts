import { Logger } from '../../core/services/Logger';
import { IDGenerator } from '../../core/services/IDGenerator';
import { DatabaseService } from '../../core/services/DatabaseService';

export interface NotificationRequest {
  userId: string;
  title: string;
  message: string;
  type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ALERT' | 'REMINDER';
  data?: any;
  actionUrl?: string;
}

export class NotificationEngine {
  private static instance: NotificationEngine;

  private constructor() {}

  public static getInstance(): NotificationEngine {
    if (!NotificationEngine.instance) {
      NotificationEngine.instance = new NotificationEngine();
    }
    return NotificationEngine.instance;
  }

  /**
   * Send a notification to a user
   */
  public async send(request: NotificationRequest): Promise<void> {
    const prisma = DatabaseService.getInstance();

    try {
      await prisma.notification.create({
        data: {
          userId: request.userId,
          title: request.title,
          message: request.message,
          type: (request.type || 'INFO') as any,
          data: request.data || {},
          actionUrl: request.actionUrl,
        },
      });
    } catch (error) {
      Logger.error('Failed to send notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.userId,
      });
    }
  }

  /**
   * Send notification to multiple users
   */
  public async sendBulk(requests: NotificationRequest[]): Promise<void> {
    await Promise.all(requests.map(req => this.send(req)));
  }

  /**
   * Send notification to all members of an organization
   */
  public async sendToOrganization(
    organizationId: string,
    title: string,
    message: string,
    type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ALERT' | 'REMINDER',
    data?: any
  ): Promise<void> {
    const prisma = DatabaseService.getInstance();
    const users = await prisma.user.findMany({
      where: { organizationId, status: 'ACTIVE' },
    });

    await this.sendBulk(
      users.map((user: { id: string }) => ({
        userId: user.id,
        title,
        message,
        type,
        data,
      }))
    );
  }

  /**
   * Send notification to all active members
   */
  public async sendToAllMembers(
    organizationId: string,
    title: string,
    message: string,
    type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ALERT' | 'REMINDER',
    data?: any
  ): Promise<void> {
    const prisma = DatabaseService.getInstance();
    const members = await prisma.user.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
    });

    await this.sendBulk(
      members.map((member: { id: string }) => ({
        userId: member.id,
        title,
        message,
        type,
        data,
      }))
    );
  }

  /**
   * Mark notification as read
   */
  public async markAsRead(notificationId: string): Promise<void> {
    const prisma = DatabaseService.getInstance();
    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Get unread notifications for a user
   */
  public async getUnread(userId: string): Promise<any[]> {
    const prisma = DatabaseService.getInstance();
    return prisma.notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Get all notifications for a user with pagination
   */
  public async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ data: any[]; total: number; unreadCount: number }> {
    const prisma = DatabaseService.getInstance();
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