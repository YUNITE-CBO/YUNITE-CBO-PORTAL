/**
 * Fine Service — thin orchestration over the Transaction Engine.
 *
 * The Transaction Engine remains the source of truth for the fines ledger
 * balance; this service only manages the `fines` domain record lifecycle
 * (issue / pay / waive) and delegates the ledger movement to the engine.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { transactionEngine } from './transaction.engine';
import { v4 as uuidv4 } from 'uuid';

export type FineType =
  | 'late_payment' | 'missing_meeting' | 'non_compliance' | 'documentation'
  | 'misconduct' | 'share_shortfall' | 'loan_default' | 'other' | 'penalty' | 'manual';

export interface FineIssueInput {
  member_id: string;
  fine_type: FineType;
  amount: number;
  reason: string;
  due_date?: string;
}

export class FineService {
  async list(memberId?: string) {
    const supabase = await createServiceClient();
    let q = supabase.from('fines').select('*, member:members(first_name, last_name, member_number)');
    if (memberId) q = q.eq('member_id', memberId);
    const { data, error } = await q.order('issued_date', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async get(fineId: string) {
    const supabase = await createServiceClient();
    const { data, error } = await supabase.from('fines').select('*').eq('id', fineId).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  async issue(input: FineIssueInput, userId: string) {
    const supabase = await createServiceClient();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { count } = await supabase.from('fines').select('*', { count: 'exact', head: true });
    const fineNumber = `FINE-${date}-${String((count ?? 0) + 1).padStart(4, '0')}`;

    const { data: fine, error } = await supabase
      .from('fines')
      .insert({
        id: uuidv4(),
        fine_number: fineNumber,
        member_id: input.member_id,
        fine_type: input.fine_type,
        amount: input.amount,
        amount_paid: 0,
        reason: input.reason,
        due_date: input.due_date ?? null,
        issued_by: userId,
        status: 'pending',
      })
      .select()
      .single();
    if (error || !fine) throw new Error(`Failed to create fine: ${error?.message}`);

    // Ledger movement delegated to the authoritative Transaction Engine.
    await transactionEngine.execute({
      member_id: input.member_id,
      account_type: 'fines',
      transaction_type: 'fine_posting',
      amount: input.amount,
      description: `Fine: ${input.reason}`,
      user_id: userId,
      metadata: { fine_id: fine.id, fine_number: fineNumber },
    });

    await this.audit('fines.create', fine.id, userId, { fine_number: fineNumber, amount: input.amount });
    return fine;
  }

  async pay(fineId: string, amount: number, userId: string) {
    const supabase = await createServiceClient();
    const { data: fine, error } = await supabase.from('fines').select('*').eq('id', fineId).single();
    if (error || !fine) throw new Error('Fine not found');

    const remaining = Number(fine.amount) - Number(fine.amount_paid);
    if (amount > remaining) throw new Error(`Amount exceeds remaining fine balance of ${remaining}`);

    // Ledger movement delegated to the authoritative Transaction Engine.
    const result = await transactionEngine.execute({
      member_id: fine.member_id,
      account_type: 'fines',
      transaction_type: 'fine_payment',
      amount,
      description: `Fine payment: ${fine.fine_number}`,
      user_id: userId,
      metadata: { fine_id: fine.id, fine_number: fine.fine_number },
    });

    const newAmountPaid = Number(fine.amount_paid) + amount;
    const newStatus = newAmountPaid >= Number(fine.amount) ? 'paid' : 'partial';
    const { data: updated } = await supabase
      .from('fines')
      .update({
        amount_paid: newAmountPaid,
        status: newStatus,
        paid_date: newStatus === 'paid' ? new Date().toISOString() : null,
      })
      .eq('id', fineId)
      .select()
      .single();

    await this.audit('fines.payment', fineId, userId, { amount, total_paid: newAmountPaid });
    return { fine: updated, transaction: (result as { transaction?: unknown }).transaction ?? result, balances: (result as { balances?: unknown }).balances };
  }

  async waive(fineId: string, reason: string, userId: string) {
    const supabase = await createServiceClient();
    const { data: fine, error } = await supabase.from('fines').select('*').eq('id', fineId).single();
    if (error || !fine) throw new Error('Fine not found');
    if (fine.status === 'paid') throw new Error('Cannot waive a fully paid fine');

    const { data: updated } = await supabase
      .from('fines')
      .update({ status: 'waived', waived_at: new Date().toISOString(), waived_by: userId, waive_reason: reason })
      .eq('id', fineId)
      .select()
      .single();

    await this.audit('fines.waive', fineId, userId, { reason });
    return updated;
  }

  private async audit(action: string, recordId: string, userId: string, after: Record<string, unknown>) {
    try {
      const supabase = await createServiceClient();
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        action,
        record_id: recordId,
        user_id: userId,
        after_value: after,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[fine-service] audit insert failed:', e instanceof Error ? e.message : e);
    }
  }
}

export const fineService = new FineService();
