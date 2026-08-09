import { createHandler } from '@/lib/api/handler';
import { apiManagementService } from '@/lib/api/management.service';

export const GET = createHandler('api.overview', async () => {
  const overview = await apiManagementService.getOverview();
  return { data: overview };
});
