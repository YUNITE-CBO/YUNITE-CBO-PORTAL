import { NextRequest, NextResponse } from 'next/server';
import { notificationService } from '@/lib/services/notifications';
import { getAuthUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

// GET /api/notifications/[id] - Fetch a single notification's full contents.
// The recipient may only view their own notifications; super_admin may view any.
// Supports an optional ?mark_read=true query to mark the notification as read
// in the same request (used by the detail page on open).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getAuthUser(request);
    if (!authResult.success || !authResult.user) {
      return unauthorizedResponse(authResult.error);
    }
    const currentUser = authResult.user;

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Notification id is required' },
        { status: 400 }
      );
    }

    const notification = await notificationService.getById(id);
    if (!notification) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }

    // Authorization: only the recipient (or a super_admin) may read it.
    const isRecipient =
      (notification.recipient_id && notification.recipient_id === currentUser.user_id) ||
      (notification.recipient_type === 'system' && currentUser.isSuperAdmin);

    if (!isRecipient && !currentUser.isSuperAdmin) {
      return forbiddenResponse('You are not authorized to view this notification');
    }

    const searchParams = request.nextUrl.searchParams;
    if (searchParams.get('mark_read') === 'true' && notification.status !== 'read') {
      await notificationService.markAsRead(id);
      notification.status = 'read';
      notification.read_at = new Date().toISOString();
    }

    return NextResponse.json({ success: true, data: notification });
  } catch (error) {
    console.error('Error fetching notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notification' },
      { status: 500 }
    );
  }
}
