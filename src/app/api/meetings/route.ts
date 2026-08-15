import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/services/auth.service';
import { meetingsService, MeetingInput } from '@/lib/services/meetings.service';
export const dynamic = 'force-dynamic';

/**
 * Meetings API
 *
 *   GET  /api/meetings          - list meetings (any authenticated user)
 *   POST /api/meetings          - create meeting (admin+) + broadcast
 *
 * Create/update broadcasts to all active members; reminders run on the cron.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await authService.getSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const upcoming = searchParams.get('upcoming') === 'true';
    const meetings = await meetingsService.list(upcoming);
    return NextResponse.json({ success: true, data: meetings });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Failed to list meetings', message: error?.message || String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
    const body = (await request.json()) as MeetingInput;
    if (!body.meeting_title || !body.scheduled_date) {
      return NextResponse.json(
        { success: false, error: 'meeting_title and scheduled_date are required' },
        { status: 400 }
      );
    }
    const meeting = await meetingsService.create({
      ...body,
      created_by: session.user.id,
    });
    return NextResponse.json({ success: true, data: meeting }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Failed to create meeting', message: error?.message || String(error) },
      { status: 500 }
    );
  }
}
