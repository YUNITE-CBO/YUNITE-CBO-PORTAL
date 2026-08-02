import { NextRequest, NextResponse } from 'next/server';
import { dashboardService } from '@/lib/services';

// GET /api/dashboard - Get dashboard data
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'stats';

    if (type === 'activity') {
      const limit = parseInt(searchParams.get('limit') || '20');
      const activity = await dashboardService.getRecentActivity(limit);
      return NextResponse.json({ success: true, data: activity });
    }

    if (type === 'alerts') {
      const alerts = await dashboardService.getAlerts();
      return NextResponse.json({ success: true, data: alerts });
    }

    // Default: return all dashboard data
    const [stats, activity, alerts] = await Promise.all([
      dashboardService.getStats(),
      dashboardService.getRecentActivity(20),
      dashboardService.getAlerts(),
    ]);

    return NextResponse.json({
      success: true,
      data: { stats, activity, alerts },
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
