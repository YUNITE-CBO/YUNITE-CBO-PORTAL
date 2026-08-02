import { NextRequest, NextResponse } from 'next/server';
import { settingsService } from '@/lib/services';

// GET /api/settings - Get all settings
export async function GET() {
  try {
    const settings = await settingsService.getAll();

    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Settings error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load settings' },
      { status: 500 }
    );
  }
}

// POST /api/settings - Update a setting
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.key || body.value === undefined) {
      return NextResponse.json(
        { success: false, error: 'Key and value required' },
        { status: 400 }
      );
    }

    const userId = body.user_id || '00000000-0000-0000-0000-000000000000';
    const setting = await settingsService.update(body.key, String(body.value), userId);

    return NextResponse.json({
      success: true,
      message: 'Setting updated successfully',
      data: setting,
    });
  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update setting' },
      { status: 500 }
    );
  }
}
