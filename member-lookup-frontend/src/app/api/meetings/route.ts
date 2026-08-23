/**
 * GET /api/meetings — upcoming meetings for the home page.
 *
 * Served by the backend gateway `GET /api/v1/meetings` (`meetings.read`
 * scope, migration 048). If the backend predates that endpoint or the scope
 * grant has not been applied, returns `available: false` with a graceful
 * note rather than fabricated data.
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
