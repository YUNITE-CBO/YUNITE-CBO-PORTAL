import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { apiKeyService } from '@/lib/api/keys.service';

export const GET = createHandler('api.clients.get', async (ctx) => {
  const client = await apiKeyService.getClient(ctx.params.id);
  const permissions = await apiKeyService.getClientPermissions(ctx.params.id);
  return { data: { ...client, permissions } };
});

export const PUT = createHandler('api.clients.update', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = (ctx.body ?? {}) as Record<string, unknown>;

  const status = body.status as 'active' | 'inactive' | 'suspended' | undefined;
  if (status && !['active', 'inactive', 'suspended'].includes(status)) {
    throw ApiError.validation('status must be active, inactive, or suspended');
  }
  const default_tier = body.default_tier as 'public' | 'standard' | 'privileged' | undefined;
  if (default_tier && !['public', 'standard', 'privileged'].includes(default_tier)) {
    throw ApiError.validation('default_tier must be public, standard, or privileged');
  }

  const client = await apiKeyService.updateClient(ctx.params.id, {
    name: body.name !== undefined ? String(body.name) : undefined,
    status,
    description: body.description !== undefined
      ? (body.description === null ? null : String(body.description))
      : undefined,
    default_tier,
  });
  return { data: client };
});
