import { createHandler, positiveAmount } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { fineService } from '@/lib/services/fine.service';

export const POST = createHandler('fines.pay', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const amount = positiveAmount(body.amount, 'amount');
  const result = await fineService.pay(ctx.params.id, amount, ctx.principal.userId);
  return { data: result };
});
