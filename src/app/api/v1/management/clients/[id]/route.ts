import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { apiKeyService } from '@/lib/api/keys.service';

export const PUT = createHandler(
  'api.clients.update',
  async (ctx) => {
    if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    if (body.status && !['active', 'inactive', 'suspended'].includes(String(body.status))) {
      throw ApiError.validation('status must be active, inactive, or suspended');
    }

    const client = await apiKeyService.updateClient(ctx.params.id, {
      name: body.name !== undefined ? String(body.name) : undefined,
      status: body.status as 'active' | 'inactive' | 'suspended' | undefined,
      description: body.description !== undefined ? (body.description ? String(body.description) : null) : undefined,
      default_tier: body.default_tier as 'public' | 'standard' | 'privileged' | undefined,
    });

    // Replace permission scopes if supplied (array of "module.action" strings).
    if (Array.isArray(body.permissions)) {
      await apiKeyService.setClientPermissions(
        client.id,
        (body.permissions as string[])
          .map((p) => {
            const [module, action] = p.split('.');
            return { module, action };
          })
          .filter((p) => p.module && p.action)
      );
    }

    return { data: client };
  }
);
