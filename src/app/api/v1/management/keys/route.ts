import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { apiKeyService } from '@/lib/api/keys.service';

export const POST = createHandler('api.keys.issue', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  // Accept either client_id or client_slug for convenience.
  let clientId: string | undefined = body.client_id ? String(body.client_id) : undefined;
  if (!clientId && body.client_slug) {
    const client = await apiKeyService.getClientBySlug(String(body.client_slug));
    clientId = client.id;
  }
  if (!clientId) throw ApiError.validation('client_id or client_slug is required');
  if (!body.name) throw ApiError.validation('name is required');
  const result = await apiKeyService.generateKey(
    {
      client_id: clientId,
      name: String(body.name),
      environment: body.environment as 'live' | 'test' | undefined,
      expires_at: body.expires_at ? String(body.expires_at) : undefined,
    },
    ctx.principal.userId
  );
  // The plaintext key is returned only once, here. It is not persisted.
  return { data: result, status: 201 };
});

export const GET = createHandler('api.keys.list', async (ctx) => {
  const { searchParams } = new URL(ctx.request.url);
  const clientId = searchParams.get('client_id') ?? undefined;
  const keys = await apiKeyService.listKeys(clientId ?? undefined);
  return { data: keys };
});
