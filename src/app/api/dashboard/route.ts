import { NextResponse } from 'next/server';
import { dashboardService } from '@/lib/services';

// This route queries the database at request time and must never be statically
// prerendered at build time. Without this, Next.js attempts static generation
// for the parameterless GET() and times out (DB unreachable during build),
// which fails the build with "Static page generation for /api/dashboard is
// still timing out after 3 attempts".
export const dynamic = 'force-dynamic';

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
