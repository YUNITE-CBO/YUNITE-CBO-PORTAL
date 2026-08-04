import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const updatePreferencesSchema = z.object({
  owner_type: z.enum(['member', 'user', 'system']),
  owner_id: z.string().uuid(),
  channels: z.object({
    in_app: z.boolean().optional(),
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
  }).optional(),
  enabled_categories: z.array(z.string().uuid()).optional(),
  disabled_categories: z.array(z.string().uuid()).optional(),
  quiet_hours_enabled: z.boolean().optional(),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quiet_hours_timezone: z.string().optional(),
  digest_frequency: z.enum(['immediate', 'daily', 'weekly', 'never']).optional(),
  email_format: z.enum(['html', 'text']).optional(),
  is_active: z.boolean().optional(),
});

// GET /api/notifications/preferences
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ownerId = searchParams.get('owner_id');
    const ownerType = searchParams.get('owner_type') as 'member' | 'user' | 'system';

    if (!ownerId || !ownerType) {
      return NextResponse.json(
        { success: false, error: 'owner_id and owner_type are required' },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    const { data } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('owner_type', ownerType)
      .single();

    return NextResponse.json({
      success: true,
      data: data || {
        owner_type: ownerType,
        owner_id: ownerId,
        channels: { in_app: true, email: true, sms: false },
        enabled_categories: [],
        disabled_categories: [],
        quiet_hours_enabled: false,
        digest_frequency: 'immediate',
        email_format: 'html',
        is_active: true,
      },
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

// POST /api/notifications/preferences - Create or update
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = updatePreferencesSchema.parse(body);

    const supabase = await createServiceClient();

    // Check if preferences exist
    const { data: existing } = await supabase
      .from('notification_preferences')
      .select('id')
      .eq('owner_id', validated.owner_id)
      .eq('owner_type', validated.owner_type)
      .single();

    if (existing) {
      // Update existing
      const updateData: Record<string, unknown> = {};
      if (validated.channels) updateData.channels = validated.channels;
      if (validated.enabled_categories) updateData.enabled_categories = validated.enabled_categories;
      if (validated.disabled_categories) updateData.disabled_categories = validated.disabled_categories;
      if (validated.quiet_hours_enabled !== undefined) updateData.quiet_hours_enabled = validated.quiet_hours_enabled;
      if (validated.quiet_hours_start) updateData.quiet_hours_start = validated.quiet_hours_start;
      if (validated.quiet_hours_end) updateData.quiet_hours_end = validated.quiet_hours_end;
      if (validated.quiet_hours_timezone) updateData.quiet_hours_timezone = validated.quiet_hours_timezone;
      if (validated.digest_frequency) updateData.digest_frequency = validated.digest_frequency;
      if (validated.email_format) updateData.email_format = validated.email_format;
      if (validated.is_active !== undefined) updateData.is_active = validated.is_active;

      const { data, error } = await supabase
        .from('notification_preferences')
        .update(updateData)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return NextResponse.json({
        success: true,
        message: 'Preferences updated',
        data,
      });
    } else {
      // Create new
      const { data, error } = await supabase
        .from('notification_preferences')
        .insert({
          id: uuidv4(),
          owner_type: validated.owner_type,
          owner_id: validated.owner_id,
          channels: validated.channels || { in_app: true, email: true, sms: false },
          enabled_categories: validated.enabled_categories || [],
          disabled_categories: validated.disabled_categories || [],
          quiet_hours_enabled: validated.quiet_hours_enabled || false,
          quiet_hours_start: validated.quiet_hours_start,
          quiet_hours_end: validated.quiet_hours_end,
          quiet_hours_timezone: validated.quiet_hours_timezone || 'Africa/Nairobi',
          digest_frequency: validated.digest_frequency || 'immediate',
          email_format: validated.email_format || 'html',
          is_active: validated.is_active !== false,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return NextResponse.json({
        success: true,
        message: 'Preferences created',
        data,
      }, { status: 201 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error saving preferences:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save preferences' },
      { status: 500 }
    );
  }
}
