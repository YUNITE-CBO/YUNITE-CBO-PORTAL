import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/health - Health check
export async function GET() {
  try {
    const supabase = await createServiceClient();

    // Test database connection
    const { error } = await supabase.from('members').select('id').limit(1);

    if (error) {
      return NextResponse.json({
        success: false,
        status: 'unhealthy',
        database: 'disconnected',
        error: error.message,
      }, { status: 503 });
    }

    return NextResponse.json({
      success: true,
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      system: 'YUNITE Enterprise OS v1.0.0',
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 503 });
  }
}
