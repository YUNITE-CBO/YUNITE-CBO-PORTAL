import { createHandler, requireFields, positiveAmount } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { fineService, type FineType } from '@/lib/services/fine.service';
export const dynamic = 'force-dynamic';

export const GET = createHandler('fines.list', async (ctx) => {
  const { searchParams } = new URL(ctx.request.url);
  const data = await fineService.list(searchParams.get('member_id') ?? undefined);
  return { data };
});

export const POST = createHandler('fines.create', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = requireFields<Record<string, unknown>>(ctx.body, ['member_id', 'fine_type', 'amount', 'reason']);
  const fine = await fineService.issue(
    {
      member_id: String(body.member_id),
      fine_type: String(body.fine_type) as FineType,
      amount: positiveAmount(body.amount),
      reason: String(body.reason),
      due_date: body.due_date ? String(body.due_date) : undefined,
    },
    ctx.principal.userId
  );
  return { data: fine, status: 201 };
});
