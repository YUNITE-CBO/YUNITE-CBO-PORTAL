import { createHandler, requireFields } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { notificationService } from '@/lib/services/notifications/notification.service';

export const GET = createHandler('notifications.list', async (ctx) => {
  const { searchParams } = new URL(ctx.request.url);
  const recipientId = searchParams.get('recipient_id');
  if (!recipientId) throw ApiError.validation('recipient_id query parameter is required');
  const recipientType = (searchParams.get('recipient_type') as 'member' | 'user') ?? 'member';
  const limit = Number(searchParams.get('limit') ?? 20);
  const offset = Number(searchParams.get('offset') ?? 0);
  const result = await notificationService.getForRecipient(recipientId, recipientType, { limit, offset });
  const total = (result as { total?: number }).total ?? 0;
  return { data: (result as { notifications?: unknown[] }).notifications ?? result, pagination: { page: Math.floor(offset / limit) + 1, limit, total, total_pages: Math.ceil(total / limit) || 0 } };
});

export const POST = createHandler('notifications.send', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = requireFields<Record<string, unknown>>(ctx.body, ['subject', 'body', 'recipient_type']);
  // Sending delegated to the authoritative Notification Service.
  const result = await notificationService.send({
    subject: String(body.subject),
    body: String(body.body),
    recipient_type: body.recipient_type as 'member' | 'user',
    recipient_id: body.recipient_id ? String(body.recipient_id) : undefined,
    recipient_email: body.recipient_email as string | string[] | undefined,
    recipient_phone: body.recipient_phone ? String(body.recipient_phone) : undefined,
    recipient_name: body.recipient_name ? String(body.recipient_name) : undefined,
    priority: body.priority as 'low' | 'normal' | 'high' | 'urgent' | undefined,
    channels: body.channels as ('email' | 'sms' | 'in_app')[] | undefined,
    source_module: body.source_module ? String(body.source_module) : undefined,
    actor_id: ctx.principal.userId,
    actor_type: 'user',
    actor_name: ctx.principal.userEmail,
    created_by: ctx.principal.userId,
  });
  return { data: result, status: 201 };
});
