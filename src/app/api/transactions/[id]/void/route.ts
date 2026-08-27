import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
export const dynamic = 'force-dynamic';

/**
 * POST /api/transactions/[id]/void
 *
 * Void a transaction (admin+). Unlike reversal — which creates a mirror
 * reversal row and re-runs the ledger — voiding marks a transaction that
 * should NEVER have happened. Only transactions that are NOT posted (draft /
 * pending_review / failed status) may be voided; a posted transaction MUST be
 * reversed instead so the authoritative ledger stays intact. The original row
 * is NEVER deleted; it is marked voided with reason/author + an audit_logs row
 * (spec §10, §9).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { requirePermission } = await import('@/lib/auth/authorization');
    const auth = await requirePermission(request, 'transactions', 'void');
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Access denied' },
        { status: auth.status || 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const reason = typeof body.reason === 'string' && body.reason.trim().length >= 3
      ? body.reason.trim()
      : null;
    if (!reason) {
      return NextResponse.json(
        { success: false, error: 'A void reason (min 3 characters) is required.' },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();
    const { data: existing, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, status, reversed, transaction_ref, amount')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr || !existing) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }
    if (existing.reversed || existing.status === 'reversed') {
      return NextResponse.json({ success: false, error: 'Already reversed — cannot void.' }, { status: 400 });
    }
    if (existing.status === 'posted') {
      return NextResponse.json({
        success: false,
        error: 'A posted transaction cannot be voided — reverse it instead so the ledger stays consistent.',
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('transactions')
      .update({
        status: 'voided',
        voided_at: now,
        voided_by: auth.user.user_id,
        void_reason: reason,
      })
      .eq('id', id);
    if (error) throw error;

    // Audit.
    try {
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        action: 'transactions.void',
        record_id: id,
        user_id: auth.user.user_id,
        after_value: { reason, ref: existing.transaction_ref, amount: existing.amount },
        created_at: now,
      });
    } catch (err) {
      console.warn('Void audit insert failed (best-effort):', err);
    }

    return NextResponse.json({
      success: true,
      message: 'Transaction voided successfully.',
      data: { id, status: 'voided', voided_at: now },
    });
  } catch (error) {
    console.error('Void error:', error);
    return NextResponse.json({ success: false, error: 'Failed to void transaction' }, { status: 500 });
  }
}