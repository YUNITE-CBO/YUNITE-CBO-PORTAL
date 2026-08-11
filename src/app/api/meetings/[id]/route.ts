import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/services/auth.service';
import { meetingsService, MeetingInput } from '@/lib/services/meetings.service';

/**
 *   GET  /api/meetings/[id]   - get a single meeting (any authenticated user)
 *   PUT  /api/meetings/[id]   - update/cancel a meeting (admin+) + broadcast
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authService.getSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const meeting = await meetingsService.get(params.id);
    if (!meeting) {
      return NextResponse.json({ success: false, error: 'Meeting not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: meeting });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Failed to get meeting', message: error?.message || String(error) },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const body = (await request.json()) as Partial<MeetingInput>;
    const meeting = await meetingsService.update(params.id, body);
    return NextResponse.json({ success: true, data: meeting });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Failed to update meeting', message: error?.message || String(error) },
      { status: 500 }
    );
  }
}
