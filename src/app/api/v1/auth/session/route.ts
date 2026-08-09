import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { authService } from '@/lib/services/auth.service';

export const GET = createHandler('auth.session', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('Not authenticated');
  const result = await authService.getCurrentUser(ctx.principal.userId);
  if (!result.success || !result.user) throw ApiError.notFound('User not found');
  return { data: { user: result.user } };
});
