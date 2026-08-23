/**
 * POST /api/ai/member-search — search members by name/number/id/phone/email.
 *
 * Returns candidate matches with which identifiers matched (req. #11, #18).
 * The UI requires selection when multiple members match — never guesses.
 * Admin+ only.
 *
 * Body: { query: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '../_guard';
import { searchMembers } from '@/ai';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminAuth();
    if (!auth.ok) return auth.response!;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const query = String(body?.query ?? '').trim();
    if (!query) {
      return NextResponse.json({ success: false, error: 'query is required' }, { status: 400 });
    }

    const candidates = await searchMembers(query, 20);
    return NextResponse.json({ success: true, data: candidates });
  } catch (error: any) {
    console.error('[ai/member-search] failed:', error);
    return NextResponse.json(
      { success: false, error: 'Member search failed', message: error?.message || String(error) },
      { status: 500 },
    );
  }
}
