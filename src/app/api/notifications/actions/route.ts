import { NextRequest, NextResponse } from 'next/server';
import { notificationService } from '@/lib/services/notifications';
import { getAuthUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const actionSchema = z.object({
  action: z.enum(['mark_read', 'mark_all_read', 'cancel', 'retry', 'get_unread_count']),
  notification_id: z.string().uuid().optional(),
  recipient_id: z.string().uuid().optional(),
  recipient_type: z.enum(['member', 'user']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Every notification action requires an authenticated session. Previously
    // this route had NO auth, so anyone could mark/cancel/retry any user's
    // notifications. The recipient is now derived from the session for
    // self-scoped actions (mark_all_read / get_unread_count) so a buggy or
    // missing client-supplied recipient_id can't silently match zero rows
    // (which was why "Mark all as read" appeared to do nothing).
    const authResult = await getAuthUser(request);
    if (!authResult.success || !authResult.user) {
      return unauthorizedResponse(authResult.error);
    }
    const currentUser = authResult.user;

    const body = await request.json();
    const validated = actionSchema.parse(body);

    switch (validated.action) {
      case 'mark_read': {
        if (!validated.notification_id) {
          return NextResponse.json(
            { success: false, error: 'notification_id is required' },
            { status: 400 }
          );
        }
        // A user may only mark their OWN notifications read; super_admin may
        // mark any. This stops one user clearing another's unread state.
        if (!currentUser.isSuperAdmin) {
          const notification = await notificationService.getById(validated.notification_id);
          const isRecipient =
            !!notification &&
            notification.recipient_id === currentUser.user_id;
          if (!isRecipient) {
            return forbiddenResponse('You are not authorized to modify this notification');
          }
        }
        await notificationService.markAsRead(validated.notification_id);
        return NextResponse.json({
          success: true,
          message: 'Notification marked as read',
        });
      }

      case 'mark_all_read': {
        // Derive the recipient from the session — ignore any client-supplied
        // recipient_id (which was previously the literal string 'admin' and
        // matched zero rows, so "Mark all as read" did nothing).
        await notificationService.markAllAsRead(currentUser.user_id, 'user');
        return NextResponse.json({
          success: true,
          message: 'All notifications marked as read',
        });
      }

      case 'cancel': {
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
      }

      case 'retry': {
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
      }

      case 'get_unread_count': {
        // Session-scoped: returns the caller's own unread count, ignoring the
        // client-supplied recipient_id (which was previously 'admin').
        const count = await notificationService.getUnreadCount(currentUser.user_id, 'user');
        return NextResponse.json({
          success: true,
          data: { unread_count: count },
        });
      }

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
