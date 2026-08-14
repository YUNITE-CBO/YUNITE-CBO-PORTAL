/**
 * GET /api/meetings — upcoming meetings for the home page.
 *
 * GAP: meetings are not available through the API-key gateway today (see
 * API_GAPS.md). This route returns `available: false` with a graceful note
 * rather than fabricated data. When `/api/v1/meetings` is added + the
 * `meetings.read` scope granted to the API client, this lights up.
 */
import { NextResponse } from 'next/server';
import { getUpcomingMeetings } from '@/lib/api/meeting.service';

export async function GET() {
  const meetings = await getUpcomingMeetings();
  if (meetings === null) {
    return NextResponse.json({
      success: true,
      available: false,
      data: [],
      note: 'Upcoming meeting details will appear here once the YUNITE meetings service is available through the member portal API.',
    });
  }
  return NextResponse.json({ success: true, available: true, data: meetings });
}
