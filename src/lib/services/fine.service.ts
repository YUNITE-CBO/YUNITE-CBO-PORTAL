import { createClient } from '@/lib/supabase/server';

export class FineService {
  async create(params: any) {
    const supabase = await createClient();
    const { data, error } = await supabase.from('fines').insert({
      member_id: params.member_id, fine_type: params.fine_type, amount: params.amount,
      reason: params.reason, due_date: params.due_date, issued_by: params.user_id, status: 'pending'
    }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async getPending() {
    const supabase = await createClient();
    const { data } = await supabase.from('fines').select('*,member:members(first_name,last_name,member_number,phone)').in('status', ['pending', 'partial']).order('issued_date', {ascending: false});
    return data || [];
  }

  async getByMember(memberId: string) {
    const supabase = await createClient();
    const { data } = await supabase.from('fines').select('*').eq('member_id', memberId).order('issued_date', {ascending: false});
    return data || [];
  }
}
export const fineService = new FineService();
