import { createHandler, requireFields } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { settingsService } from '@/lib/services/settings.service';

export const GET = createHandler('organization.settings.list', async () => {
  const data = await settingsService.getAll();
  return { data };
});

export const PUT = createHandler('organization.settings.update', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = requireFields<Record<string, unknown>>(ctx.body, ['key', 'value']);
  // Setting update delegated to the authoritative Settings Service.
  await settingsService.update(String(body.key), String(body.value), ctx.principal.userId);
  const data = await settingsService.get(String(body.key));
  return { data: { key: body.key, value: data } };
});
