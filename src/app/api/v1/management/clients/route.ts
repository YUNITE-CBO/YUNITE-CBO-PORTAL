import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { apiKeyService } from '@/lib/api/keys.service';
import { parseScopeList } from '@/lib/api/scopes';

export const GET = createHandler('api.clients.list', async () => {
  const clients = await apiKeyService.listClients();
  return { data: clients };
});

export const POST = createHandler('api.clients.create', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  if (!body.name || !body.slug) throw ApiError.validation('name and slug are required');
  const client = await apiKeyService.createClient(
    {
      name: String(body.name),
      slug: String(body.slug),
      client_type: body.client_type as 'lookup' | 'mobile' | 'third_party' | undefined,
      description: body.description ? String(body.description) : undefined,
      default_tier: body.default_tier as 'public' | 'standard' | 'privileged' | undefined,
    },
    ctx.principal.userId
  );

  // Grant requested permission scopes (array of "module.action" strings).
  // Validated against the manifest so only real scopes are stored.
  const permissions = parseScopeList(body.permissions);
  if (permissions.length) {
    await apiKeyService.setClientPermissions(client.id, permissions);
  }
  return { data: client, status: 201 };
});
