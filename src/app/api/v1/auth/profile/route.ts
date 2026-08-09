import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { authService } from '@/lib/services/auth.service';

export const GET = createHandler('auth.profile', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('Not authenticated');
  const result = await authService.getCurrentUser(ctx.principal.userId);
  if (!result.success || !result.user) throw ApiError.notFound('User not found');
  return { data: result.user };
});

export const PUT = createHandler('auth.profile.update', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('Not authenticated');
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  // Profile update delegated to the authoritative Auth Service.
  const result = await authService.updateProfile(ctx.principal.userId, {
    full_name: body.full_name ? String(body.full_name) : undefined,
    phone: body.phone ? String(body.phone) : undefined,
    address: body.address ? String(body.address) : undefined,
    emergency_contact_name: body.emergency_contact_name ? String(body.emergency_contact_name) : undefined,
    emergency_contact_phone: body.emergency_contact_phone ? String(body.emergency_contact_phone) : undefined,
    avatar_url: body.avatar_url ? String(body.avatar_url) : undefined,
  });
  if (!result.success) throw ApiError.validation(result.error ?? 'Failed to update profile');
  return { data: { updated: true } };
});
