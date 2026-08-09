import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { apiManagementService } from '@/lib/api/management.service';

export const GET = createHandler('api.metrics', async (ctx) => {
  const raw = new URL(ctx.request.url).searchParams.get('hours');
  let hours = 24;
  if (raw !== null) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw ApiError.validation('hours must be a positive number');
    }
    hours = parsed;
  }
  const metrics = await apiManagementService.getMetrics(hours);
  return { data: metrics };
});
