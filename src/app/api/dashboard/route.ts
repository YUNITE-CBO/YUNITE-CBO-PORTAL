import { NextResponse } from 'next/server';
import { dashboardService } from '@/lib/services';

// GET /api/dashboard - Get live dashboard data
export async function GET() {
  try {
    const [stats, recentActivity, alerts] = await Promise.all([
      dashboardService.getStats(),
      dashboardService.getRecentActivity(20),
      dashboardService.getAlerts(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        stats,
        recent_activity: recentActivity,
        alerts,
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load dashboard' },
      { status: 500 }
    );
  }
}
