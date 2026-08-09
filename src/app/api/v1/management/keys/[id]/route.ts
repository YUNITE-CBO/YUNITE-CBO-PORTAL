import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { apiKeyService } from '@/lib/api/keys.service';

export const DELETE = createHandler('api.keys.revoke', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  await apiKeyService.revokeKey(ctx.params.id, ctx.principal.userId);
  return { data: { id: ctx.params.id, revoked: true } };
});
