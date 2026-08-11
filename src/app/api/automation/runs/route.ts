import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { authService } from '@/lib/services/auth.service';

/**
 * GET /api/automation/runs
 *
 * Returns recent automation_runs rows for the Automation History panel in
 * the Workflows settings UI. Authenticated admin+ only (the runs contain
 * member obligation references and email addresses in the details JSON).
 *
 * Query params:
 *   limit  - max rows (default 20, capped at 100)
 *   type   - filter by run_type
 */
export async function GET(request: NextRequest) {
  try {
    const session = await authService.getSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const role = session.user.role;
    if (role !== 'admin' && role !== 'super_admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: admin access required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const runType = searchParams.get('type');

    const supabase = await createServiceClient();
    let query = supabase
      .from('automation_runs')
      .select('id, run_type, status, started_at, finished_at, duration_ms, trigger, items_processed, notifications_created, emails_sent, emails_skipped, errors_count, error_message, details')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (runType) {
      query = query.eq('run_type', runType);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error('Error fetching automation runs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch automation runs' },
      { status: 500 }
    );
  }
}
