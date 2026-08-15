import { createHandler } from '@/lib/api/handler';
import { apiManagementService } from '@/lib/api/management.service';
export const dynamic = 'force-dynamic';

export const GET = createHandler('api.logs', async (ctx) => {
  const { searchParams } = new URL(ctx.request.url);
  const page = Number(searchParams.get('page') ?? 1);
  const limit = Number(searchParams.get('limit') ?? 50);
  const client_id = searchParams.get('client_id') ?? undefined;
  const status_code = searchParams.get('status') ? Number(searchParams.get('status')) : undefined;
  const is_error = searchParams.get('is_error') === 'true' ? true : searchParams.get('is_error') === 'false' ? false : undefined;
  const endpoint_id = searchParams.get('endpoint_id') ?? undefined;
  const start = searchParams.get('start') ?? undefined;
  const end = searchParams.get('end') ?? undefined;
  const request_id = searchParams.get('request_id') ?? undefined;

  const result = await apiManagementService.getLogs({ page, limit, client_id, status_code, is_error, endpoint_id, start, end, request_id });
  return {
    data: result.data,
    pagination: result.pagination,
  };
});
