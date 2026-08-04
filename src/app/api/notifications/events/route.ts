import { NextRequest, NextResponse } from 'next/server';
import { notificationEventService } from '@/lib/services/notifications';
import { z } from 'zod';

const emitEventSchema = z.object({
  event_type: z.string().min(1),
  event_action: z.string().min(1),
  source_module: z.string().min(1),
  entity_type: z.string().optional(),
  entity_id: z.string().uuid().optional(),
  data: z.record(z.unknown()),
  actor_id: z.string().uuid().optional(),
  actor_type: z.string().optional(),
  actor_name: z.string().optional(),
});

// POST /api/notifications/events - Emit event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = emitEventSchema.parse(body);

    const eventId = await notificationEventService.emit(validated);

    return NextResponse.json({
      success: true,
      message: 'Event processed',
      data: { event_id: eventId },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error emitting event:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to emit event' },
      { status: 500 }
    );
  }
}

// GET /api/notifications/events - Get event logs
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const eventType = searchParams.get('event_type');
    const eventAction = searchParams.get('event_action');
    const sourceModule = searchParams.get('source_module');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const result = await notificationEventService.getEventLogs({
      event_type: eventType || undefined,
      event_action: eventAction || undefined,
      source_module: sourceModule || undefined,
      status: status || undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: result.events,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (error) {
    console.error('Error fetching event logs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch event logs' },
      { status: 500 }
    );
  }
}
