/**
 * Configuration Management API
 * Phase 4: Enterprise Configuration Management Framework
 */

import { NextRequest, NextResponse } from 'next/server';
import { configurationService } from '@/lib/services/configuration.service';
import { authService } from '@/lib/services/auth.service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const history = searchParams.get('history');
    const status = searchParams.get('status');

    // Get configuration status summary
    if (status === 'true') {
      const summary = await configurationService.getStatusSummary();
      return NextResponse.json({ success: true, data: summary });
    }

    // Get configuration history
    if (history === 'true') {
      const settingKey = searchParams.get('settingKey') || undefined;
      const limit = parseInt(searchParams.get('limit') || '50');
      const offset = parseInt(searchParams.get('offset') || '0');
      
      const result = await configurationService.getHistory({
        settingKey,
        limit,
        offset,
      });
      
      return NextResponse.json({ success: true, data: result });
    }

    // Get settings by category
    if (category) {
      const data = await configurationService.getByCategory(category);
      if (!data) {
        return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data });
    }

    // Get all settings by category
    const data = await configurationService.getAllByCategory();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching configuration:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch configuration' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await authService.getSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { settings, reason, key, value } = body;

    // Get client info
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    const userAgent = request.headers.get('user-agent') || '';

    // Update single setting
    if (key && value !== undefined) {
      const result = await configurationService.updateSetting(
        key,
        value,
        session.user.id,
        session.user.full_name,
        reason,
        ipAddress,
        userAgent
      );

      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: 'Setting updated successfully' });
    }

    // Update multiple settings
    if (settings && typeof settings === 'object') {
      const result = await configurationService.updateMany(
        settings,
        session.user.id,
        session.user.full_name,
        reason,
        ipAddress,
        userAgent
      );

      if (!result.success) {
        return NextResponse.json({ 
          success: false, 
          error: 'Some settings failed to update',
          details: result.errors 
        }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: 'Settings updated successfully' });
    }

    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  } catch (error) {
    console.error('Error updating configuration:', error);
    return NextResponse.json({ success: false, error: 'Failed to update configuration' }, { status: 500 });
  }
}
