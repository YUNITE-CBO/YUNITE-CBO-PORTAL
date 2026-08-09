import { createHandler, requireFields } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { fineService } from '@/lib/services/fine.service';

export const POST = createHandler('fines.waive', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = requireFields<Record<string, unknown>>(ctx.body, ['reason']);
  const fine = await fineService.waive(ctx.params.id, String(body.reason), ctx.principal.userId);
  return { data: fine };
});
