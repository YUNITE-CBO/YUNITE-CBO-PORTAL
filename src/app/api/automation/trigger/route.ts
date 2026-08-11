import { NextResponse } from 'next/server';
import { authService } from '@/lib/services/auth.service';
import { automationRunner } from '@/lib/services/automation/runner.service';

/**
 * POST /api/automation/trigger
 *
 * Session-authenticated manual trigger for the automation engine. Used by the
 * "Run Now" button in the Workflows settings UI. Unlike /api/cron/automation
 * (which is CRON_SECRET-protected because Render cron carries no session
 * cookie), this route authenticates via the normal session cookie and is
 * restricted to admin+ so privileged users can force a tick on demand
 * (useful for testing after changing settings, without waiting for the cron).
 */
export async function POST() {
  try {
    const session = await authService.getSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const role = session.user.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: admin access required' },
        { status: 403 }
      );
    }

    const result = await automationRunner.tick('manual');
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[automation/trigger] manual tick failed:', error);
    return NextResponse.json(
      { success: false, error: 'Automation tick failed', message: error?.message || String(error) },
      { status: 500 }
    );
  }
}
