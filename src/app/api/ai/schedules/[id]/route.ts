/**
 * PUT    /api/ai/schedules/[id] — update a schedule (super_admin)
 * DELETE /api/ai/schedules/[id] — delete a schedule (super_admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, requireSuperAdmin } from '../../_guard';
import { upsertSchedule, deleteSchedule } from '@/ai/persistence';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
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

  try {
    const data = await upsertSchedule({
      id: params.id,
      name: body.name,
      scope: body.scope,
      cadence: body.cadence,
      is_enabled: body.is_enabled ?? true,
      day_of_week: body.day_of_week ?? null,
      day_of_month: body.day_of_month ?? null,
      time_of_day: body.time_of_day ?? null,
    });
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response!;
  const forbidden = requireSuperAdmin(auth);
  if (forbidden) return forbidden;

  await deleteSchedule(params.id);
  return NextResponse.json({ success: true });
}
