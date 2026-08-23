import { createHandler, requireFields } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { supportTicketService } from '@/lib/services/support-ticket.service';
export const dynamic = 'force-dynamic';

export const GET = createHandler('support.list', async (ctx) => {
  const { searchParams } = new URL(ctx.request.url);
  const memberId = searchParams.get('member_id');
  const status = searchParams.get('status') ?? undefined;
  const category = searchParams.get('category') ?? undefined;

  const tickets = memberId
    ? await supportTicketService.listForMember(memberId)
    : await supportTicketService.listAll({ status, category });
  return { data: tickets };
});

export const POST = createHandler('support.create', async (ctx) => {
  const body = requireFields<Record<string, unknown>>(ctx.body, ['member_id', 'subject', 'message']);
  const subject = String(body.subject).trim();
  const message = String(body.message).trim();
  if (subject.length < 3 || subject.length > 200) {
    throw ApiError.validation('subject must be between 3 and 200 characters');
  }
  if (message.length < 10 || message.length > 5000) {
    throw ApiError.validation('message must be between 10 and 5000 characters');
  }

  const ticket = await supportTicketService.createForMember(String(body.member_id), {
    subject,
    message,
    category: body.category ? String(body.category) : undefined,
    source: body.source ? String(body.source) : undefined,
  });
  return { data: ticket, status: 201 };
});
