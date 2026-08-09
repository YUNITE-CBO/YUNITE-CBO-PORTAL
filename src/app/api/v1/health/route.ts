import { createHandler } from '@/lib/api/handler';
import { apiManagementService } from '@/lib/api/management.service';
import { createServiceClient } from '@/lib/supabase/server';

export const GET = createHandler('system.health', async () => {
  const supabase = await createServiceClient();
  const { error } = await supabase.from('members').select('id').limit(1);
  const database = error ? 'disconnected' : 'connected';

  let overview;
  try {
    overview = await apiManagementService.getOverview();
  } catch {
    overview = null;
  }

  return {
    data: {
      status: database === 'connected' ? 'healthy' : 'unhealthy',
      version: 'v1',
      database,
      timestamp: new Date().toISOString(),
      system: 'YUNITE Enterprise OS',
      api: {
        endpoints: overview?.endpoint_count ?? null,
        active_clients: overview?.active_clients ?? null,
        requests_24h: overview?.totals.requests_24h ?? null,
      },
    },
  };
});
