import { createHandler } from '@/lib/api/handler';
import { dashboardService } from '@/lib/services/dashboard.service';

export const GET = createHandler('dashboard.stats', async () => {
  // Stats delegated to the authoritative Dashboard Service.
  const [stats, activity, alerts] = await Promise.all([
    dashboardService.getStats(),
    dashboardService.getRecentActivity(),
    dashboardService.getAlerts(),
  ]);
  return { data: { stats, recent_activity: activity, alerts } };
});
