/**
 * GET  /api/ai/settings — read the AI Intelligence organization settings
 *                         (admin+).
 * PUT  /api/ai/settings — update one or more AI settings (admin+).
 *
 * These are DB-backed rows in the `settings` table under the 'ai'
 * configuration category (migration 033), governed by the same
 * ConfigurationService + audit/history framework as every other settings
 * surface. They are surfaced both here (for the AI Intelligence dashboard)
 * and under Settings → System Configuration → AI Intelligence.
 *
 * Why a dedicated endpoint (vs. PUT /api/configuration): the AI dashboard
 * needs to read its own settings in one call and apply admin auth (not the
 * broader configuration surface). The underlying update still goes through
 * ConfigurationService so audit history + encryption metadata are honored.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '../_guard';
import { configurationService } from '@/lib/services/configuration.service';
import { AI_SETTINGS_KEYS } from '@/ai/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response!;

  try {
    const values = await configurationService.getMany([...AI_SETTINGS_KEYS]);
    const data = AI_SETTINGS_KEYS.map((key) => ({
      key,
      value: values[key] ?? null,
    }));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('AI settings load error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load AI settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response!;

  try {
    const body = await request.json();
    const { settings } = body as { settings?: Record<string, string> };

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body: expected { settings }' }, { status: 400 });
    }

    // Reject unknown keys so callers cannot write arbitrary rows through here.
    const allowed = new Set<string>(AI_SETTINGS_KEYS);
    const updates: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings)) {
      if (!allowed.has(key)) {
        return NextResponse.json({ success: false, error: `Unknown AI setting: ${key}` }, { status: 400 });
      }
      if (typeof value !== 'string') {
        return NextResponse.json({ success: false, error: `Invalid value for ${key}` }, { status: 400 });
      }
      updates[key] = value;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No settings provided' }, { status: 400 });
    }

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    const userAgent = request.headers.get('user-agent') || '';

    const result = await configurationService.updateMany(
      updates,
      auth.userId || '',
      'admin',
      'AI Intelligence settings update',
      ipAddress,
      userAgent,
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: 'Some AI settings failed to update', details: result.errors }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'AI settings updated successfully' });
  } catch (error) {
    console.error('AI settings update error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update AI settings' }, { status: 500 });
  }
}
