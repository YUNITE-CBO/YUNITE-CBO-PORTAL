import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .order('category', { ascending: true });

    if (error) throw error;

    // Transform to key-value pairs
    const settings = data?.reduce((acc, item) => {
      acc[item.key] = { value: item.value, description: item.description };
      return acc;
    }, {} as Record<string, { value: string; description: string | null }>);

    return NextResponse.json({ success: true, data: settings || {} });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = await createServiceClient();

    const updates = body.settings as Record<string, string>;

    for (const [key, value] of Object.entries(updates)) {
      const { error } = await supabase
        .from('settings')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('key', key);

      if (error) {
        // If key doesn't exist, insert it
        if (error.code === 'PGRST116') {
          await supabase.from('settings').insert({
            key,
            value,
            category: body.category || 'system',
            description: null,
            is_encrypted: false,
          });
        }
      }
    }

    return NextResponse.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ success: false, error: 'Failed to update settings' }, { status: 500 });
  }
}
