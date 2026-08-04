import { NextRequest, NextResponse } from 'next/server';
import { notificationService } from '@/lib/services/notifications';
import { z } from 'zod';

const actionSchema = z.object({
  action: z.enum(['mark_read', 'mark_all_read', 'cancel', 'retry', 'get_unread_count']),
  notification_id: z.string().uuid().optional(),
  recipient_id: z.string().uuid().optional(),
  recipient_type: z.enum(['member', 'user']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = actionSchema.parse(body);

    switch (validated.action) {
      case 'mark_read':
        if (!validated.notification_id) {
          return NextResponse.json(
            { success: false, error: 'notification_id is required' },
            { status: 400 }
          );
        }
        await notificationService.markAsRead(validated.notification_id);
        return NextResponse.json({
          success: true,
          message: 'Notification marked as read',
        });

      case 'mark_all_read':
        if (!validated.recipient_id || !validated.recipient_type) {
          return NextResponse.json(
            { success: false, error: 'recipient_id and recipient_type are required' },
            { status: 400 }
          );
        }
        await notificationService.markAllAsRead(validated.recipient_id, validated.recipient_type);
        return NextResponse.json({
          success: true,
          message: 'All notifications marked as read',
        });

      case 'cancel':
        if (!validated.notification_id) {
          return NextResponse.json(
            { success: false, error: 'notification_id is required' },
            { status: 400 }
          );
        }
        await notificationService.cancel(validated.notification_id);
        return NextResponse.json({
          success: true,
          message: 'Notification cancelled',
        });

      case 'retry':
        if (!validated.notification_id) {
          return NextResponse.json(
            { success: false, error: 'notification_id is required' },
            { status: 400 }
          );
        }
        await notificationService.retry(validated.notification_id);
        return NextResponse.json({
          success: true,
          message: 'Notification retry initiated',
        });

      case 'get_unread_count':
        if (!validated.recipient_id || !validated.recipient_type) {
          return NextResponse.json(
            { success: false, error: 'recipient_id and recipient_type are required' },
            { status: 400 }
          );
        }
        const count = await notificationService.getUnreadCount(validated.recipient_id, validated.recipient_type);
        return NextResponse.json({
          success: true,
          data: { unread_count: count },
        });

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error processing notification action:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process action' },
      { status: 500 }
    );
  }
}
