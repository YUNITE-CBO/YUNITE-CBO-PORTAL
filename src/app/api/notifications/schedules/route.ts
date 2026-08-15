import { NextRequest, NextResponse } from 'next/server';
import { scheduleService } from '@/lib/services/notifications';
import { z } from 'zod';
export const dynamic = 'force-dynamic';

const createScheduleSchema = z.object({
  schedule_code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  category_id: z.string().uuid().optional(),
  schedule_type: z.enum(['once', 'daily', 'weekly', 'monthly', 'quarterly', 'annual', 'custom']),
  cron_expression: z.string().optional(),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  template_id: z.string().uuid(),
  conditions: z.record(z.unknown()).optional(),
  recipient_type: z.enum(['all_members', 'active_members', 'specific_members', 'admins', 'specific_users', 'loans_overdue', 'welfare_pending']),
  recipient_filter: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
  created_by: z.string().uuid().optional(),
});

const updateScheduleSchema = createScheduleSchema.partial();

// GET /api/notifications/schedules
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const scheduleId = searchParams.get('id');
    const isActive = searchParams.get('is_active');
    const categoryId = searchParams.get('category_id');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get single schedule
    if (scheduleId) {
      const schedule = await scheduleService.getById(scheduleId);
      if (!schedule) {
        return NextResponse.json(
          { success: false, error: 'Schedule not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: schedule });
    }

    // Get all schedules
    const result = await scheduleService.getAll({
      is_active: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      category_id: categoryId || undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: result.schedules,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch schedules' },
      { status: 500 }
    );
  }
}

// POST /api/notifications/schedules
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createScheduleSchema.parse(body);

    const schedule = await scheduleService.create(validated);

    return NextResponse.json({
      success: true,
      message: 'Schedule created successfully',
      data: schedule,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating schedule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create schedule' },
      { status: 500 }
    );
  }
}

// PUT /api/notifications/schedules
export async function PUT(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const scheduleId = searchParams.get('id');

    if (!scheduleId) {
      return NextResponse.json(
        { success: false, error: 'Schedule ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validated = updateScheduleSchema.parse(body);

    const schedule = await scheduleService.update(scheduleId, validated);

    return NextResponse.json({
      success: true,
      message: 'Schedule updated successfully',
      data: schedule,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error updating schedule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update schedule' },
      { status: 500 }
    );
  }
}

// DELETE /api/notifications/schedules
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const scheduleId = searchParams.get('id');

    if (!scheduleId) {
      return NextResponse.json(
        { success: false, error: 'Schedule ID is required' },
        { status: 400 }
      );
    }

    await scheduleService.delete(scheduleId);

    return NextResponse.json({
      success: true,
      message: 'Schedule deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete schedule' },
      { status: 500 }
    );
  }
}
