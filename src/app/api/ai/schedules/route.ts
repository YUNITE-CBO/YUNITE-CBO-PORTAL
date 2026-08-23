/**
 * GET  /api/ai/schedules — list investigation schedules (admin+)
 * POST /api/ai/schedules — create a schedule (super_admin only)
 *
 * Schedules drive the cron-triggered AI investigations. Editing them is a
 * privileged operation (super_admin) because it controls automated system
 * behavior + provider cost.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, requireSuperAdmin } from '../_guard';
import { listSchedules, upsertSchedule } from '@/ai/persistence';
import type { InvestigationScope } from '@/ai/types';

const VALID_SCOPES: Set<InvestigationScope> = new Set<InvestigationScope>([
  'database', 'cross_module', 'business_rules', 'api', 'financial',
  'unity_fund', 'full_system',
]);

export async function GET() {
  try {
    const auth = await requireAdminAuth();
    if (!auth.ok) return auth.response!;
    return NextResponse.json({ success: true, data: await listSchedules() });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response!;
  const forbidden = requireSuperAdmin(auth);
  if (forbidden) return forbidden;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const scope = body?.scope as InvestigationScope;
  if (!scope || !VALID_SCOPES.has(scope)) {
    return NextResponse.json({ success: false, error: 'Invalid scope' }, { status: 400 });
  }
  const cadence = body?.cadence as 'daily' | 'weekly' | 'monthly' | 'on_demand';
  if (!['daily', 'weekly', 'monthly', 'on_demand'].includes(cadence)) {
    return NextResponse.json({ success: false, error: 'Invalid cadence' }, { status: 400 });
  }

  try {
    const data = await upsertSchedule({
      name: body.name,
      scope,
      cadence,
      is_enabled: body.is_enabled ?? true,
      day_of_week: body.day_of_week ?? null,
      day_of_month: body.day_of_month ?? null,
      time_of_day: body.time_of_day ?? null,
      created_by: auth.userId,
    });
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
