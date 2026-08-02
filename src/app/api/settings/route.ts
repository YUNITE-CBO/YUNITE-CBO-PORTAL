import { NextRequest, NextResponse } from 'next/server';
import { settingsService } from '@/lib/services';
import { z } from 'zod';

const updateSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  description: z.string().optional(),
});

// GET /api/settings - Get all settings
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const key = searchParams.get('key');

    if (key) {
      const settings = await settingsService.getAll();
      const setting = settings.find(s => s.key === key);
      return NextResponse.json({
        success: true,
        data: setting || { key, value: null },
      });
    }

    const settings = await settingsService.getAll();
    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// PUT /api/settings - Update a setting
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = updateSchema.parse(body);

    const userId = '00000000-0000-0000-0000-000000000000';

    const setting = await settingsService.update({
      ...validated,
      user_id: userId,
    });

    return NextResponse.json({
      success: true,
      message: 'Setting updated successfully',
      data: setting,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Failed to update setting';
    console.error('Error updating setting:', error);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
