import { createHandler } from '@/lib/api/handler';
import { apiManagementService } from '@/lib/api/management.service';

export const GET = createHandler('api.endpoints', async () => {
  const endpoints = await apiManagementService.getEndpoints();
  return { data: endpoints };
});
