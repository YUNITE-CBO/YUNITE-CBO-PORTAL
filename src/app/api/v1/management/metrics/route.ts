import { createHandler } from '@/lib/api/handler';
import { apiManagementService } from '@/lib/api/management.service';
export const dynamic = 'force-dynamic';

export const GET = createHandler('api.metrics', async (ctx) => {
  const hours = ctx.request.url.includes('hours=') ? Number(new URL(ctx.request.url).searchParams.get('hours')) : 24;
  const metrics = await apiManagementService.getMetrics(hours);
  return { data: metrics };
});
