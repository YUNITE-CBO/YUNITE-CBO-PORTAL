import { NextRequest, NextResponse } from 'next/server';
import { notificationService } from '@/lib/services/notifications';
import { requirePermission, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { z } from 'zod';

const sendNotificationSchema = z.object({
  template_code: z.string().optional(),
  category_code: z.string().optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  channels: z.array(z.enum(['in_app', 'email', 'sms'])).optional(),
  recipient_type: z.enum(['member', 'user', 'admin', 'all_admins', 'system', 'bulk_members']),
  recipient_id: z.string().uuid().optional(),
  recipient_email: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  recipient_phone: z.string().optional(),
  recipient_name: z.string().optional(),
  source_module: z.string().optional(),
  source_entity_type: z.string().optional(),
  source_entity_id: z.string().uuid().optional(),
  source_action: z.string().optional(),
  scheduled_for: z.string().datetime().optional(),
  variables: z.record(z.unknown()).optional(),
  idempotency_key: z.string().optional(),
  actor_id: z.string().uuid().optional(),
  actor_type: z.string().optional(),
  actor_name: z.string().optional(),
});

// GET /api/notifications - Get notifications
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const recipientId = searchParams.get('recipient_id');
    const recipientType = searchParams.get('recipient_type') as 'member' | 'user' | null;
    const status = searchParams.get('status') as any;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const unreadOnly = searchParams.get('unread_only') === 'true';

    if (!recipientId || !recipientType) {
      return NextResponse.json(
        { success: false, error: 'recipient_id and recipient_type are required' },
        { status: 400 }
      );
    }

    const result = await notificationService.getForRecipient(recipientId, recipientType, {
      status,
      limit,
      offset,
      unreadOnly,
    });

    return NextResponse.json({
      success: true,
      data: result.notifications,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

// POST /api/notifications - Send notification
export async function POST(request: NextRequest) {
  try {
    // Authenticate and authorize via the centralized RBAC framework.
    // This replaces hand-rolled cookie parsing / inline JWT verification and
    // enforces the notifications.create permission (super_admin/admin/staff).
    const authResult = await requirePermission(request, 'notifications', 'create');
    if (!authResult.success || !authResult.user) {
      return authResult.status === 401
        ? unauthorizedResponse(authResult.error)
        : forbiddenResponse(authResult.error);
    }
    const currentUser = authResult.user;

    const body = await request.json();
    const validated = sendNotificationSchema.parse(body);

    const result = await notificationService.send({
      ...validated,
      scheduled_for: validated.scheduled_for ? new Date(validated.scheduled_for) : undefined,
      // Attribute the notification to the authenticated sender unless the
      // caller explicitly provided actor metadata.
      actor_id: validated.actor_id || currentUser.user_id,
      actor_type: validated.actor_type || 'user',
      actor_name: validated.actor_name || currentUser.email,
    });

    if (!result) {
      console.error('Notification service returned null - possible database or configuration issue');
      return NextResponse.json(
        { success: false, error: 'Failed to send notification. Please check that the notification tables exist and environment variables are configured correctly.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Notification sent successfully',
      data: result,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    // Log the full error for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error sending notification:', errorMessage, errorStack);
    
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to send notification: ${errorMessage}`,
        ...(process.env.NODE_ENV === 'development' && { stack: errorStack })
      },
      { status: 500 }
    );
  }
}
