import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { apiKeyService } from '@/lib/api/keys.service';
import { parseScopeList } from '@/lib/api/scopes';

/**
 * Replace the full set of permission scopes (module.action) granted to a
 * client. Existing scopes are deleted and the supplied set is inserted
 * atomically, so this is a put-style "set" operation. Scopes are validated
 * against the manifest so only real, grantable scopes are stored.
 */
export const PUT = createHandler('api.clients.permissions', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = (ctx.body ?? {}) as Record<string, unknown>;

  const permissions = parseScopeList(body.permissions);

  await apiKeyService.setClientPermissions(ctx.params.id, permissions);
  const updated = await apiKeyService.getClientPermissions(ctx.params.id);
  return { data: { client_id: ctx.params.id, permissions: updated } };
});
