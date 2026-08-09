import { createHandler, requireFields } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { authService } from '@/lib/services/auth.service';

export const PUT = createHandler('auth.password', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('Not authenticated');
  const body = requireFields<Record<string, unknown>>(ctx.body, ['current_password', 'new_password']);
  if (body.new_password !== body.confirm_password) {
    throw ApiError.validation('New password and confirmation do not match');
  }
  const ipAddress = ctx.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const userAgent = ctx.request.headers.get('user-agent') || 'unknown';
  // Password change delegated to the authoritative Auth Service.
  const result = await authService.changePassword(
    ctx.principal.userId,
    String(body.current_password),
    String(body.new_password),
    ipAddress,
    userAgent
  );
  if (!result.success) throw ApiError.validation(result.error ?? 'Failed to change password');
  return { data: { changed: true } };
});
