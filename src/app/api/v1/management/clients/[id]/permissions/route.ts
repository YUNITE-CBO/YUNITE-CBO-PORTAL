import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { apiKeyService } from '@/lib/api/keys.service';

/**
 * Replace the full set of permission scopes (module.action) granted to a
 * client. Existing scopes are deleted and the supplied set is inserted
 * atomically, so this is a put-style "set" operation.
 */
export const PUT = createHandler('api.clients.permissions', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const raw = body.permissions;
  if (!Array.isArray(raw)) {
    throw ApiError.validation('permissions must be an array of "module.action" strings');
  }

  const permissions = (raw as unknown[])
    .map((p) => String(p).trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      const idx = p.indexOf('.');
      if (idx <= 0 || idx === p.length - 1) {
        throw ApiError.validation(`Invalid permission scope "${p}". Expected "module.action".`);
      }
      return { module: p.slice(0, idx), action: p.slice(idx + 1) };
    });

  await apiKeyService.setClientPermissions(ctx.params.id, permissions);
  const updated = await apiKeyService.getClientPermissions(ctx.params.id);
  return { data: { client_id: ctx.params.id, permissions: updated } };
});
