/**
 * POST /api/ai/member-verification — verify a member account end-to-end.
 *
 * Compares DATABASE → BACKEND API → MEMBER LOOKUP DISPLAY for every relevant
 * field and returns a per-field verification result + overall score. Does NOT
 * block the member lookup page (runs on demand here, async via scheduled jobs
 * elsewhere). Admin+ only (it surfaces internal reconciliation detail).
 *
 * Body: { memberId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '../_guard';
import { runInvestigation } from '@/ai';

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response!;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const memberId = body?.memberId;
  if (!memberId) {
    return NextResponse.json({ success: false, error: 'memberId is required' }, { status: 400 });
  }

  try {
    const result = await runInvestigation('member_verification', memberId, auth.userId, 'manual');
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[ai/member-verification] failed:', error);
    return NextResponse.json(
      { success: false, error: 'Member verification failed', message: error?.message || String(error) },
      { status: 500 },
    );
  }
}
