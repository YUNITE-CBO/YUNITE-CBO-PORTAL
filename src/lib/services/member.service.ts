import { createClient } from '@/lib/supabase/server';

export class MemberService {
  async register(data: any, userId: string) {
    const supabase = await createClient();
    const { data: member, error } = await supabase.from('members').insert({...data, status: 'pending', registration_date: new Date().toISOString().split('T')[0]}).select().single();
    if (error) throw new Error(`Failed: ${error.message}`);
    
    const accounts = ['savings', 'shares', 'contributions', 'welfare', 'fines'];
    await supabase.from('accounts').insert(accounts.map(t => ({member_id: member.id, account_type: t, balance: 0, status: 'active'})));
    await supabase.from('compliance_records').insert(['id_verification', 'photo', 'kyc_complete'].map(t => ({member_id: member.id, compliance_type: t, status: 'pending', created_by: userId})));
    
    return member;
  }

  async getProfile(memberId: string) {
    const supabase = await createClient();
    const { data: member } = await supabase.from('members').select('*').eq('id', memberId).single();
    if (!member) return null;
    const { data: accounts } = await supabase.from('accounts').select('*').eq('member_id', memberId).eq('status', 'active');
    const { data: loans } = await supabase.from('loans').select('*').eq('member_id', memberId).in('status', ['approved', 'disbursed', 'active']);
    const { data: fines } = await supabase.from('fines').select('*').eq('member_id', memberId).in('status', ['pending', 'partial']);
    const { data: transactions } = await supabase.from('transactions').select('*').eq('member_id', memberId).order('posted_at', {ascending: false}).limit(10);
    return { member, accounts: accounts||[], activeLoans: loans||[], pendingFines: fines||[], recentTransactions: transactions||[] };
  }

  async search(params: any) {
    const supabase = await createClient();
    const page = params.page || 1, limit = params.limit || 20, offset = (page - 1) * limit;
    let query = supabase.from('members').select('*', {count: 'exact'});
    if (params.query) query = query.or(`first_name.ilike.%${params.query}%,last_name.ilike.%${params.query}%`);
    if (params.status) query = query.eq('status', params.status);
    if (params.phone) query = query.eq('phone', params.phone);
    const { data, count, error } = await query.order('created_at', {ascending: false}).range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    return { members: data || [], total: count || 0 };
  }
}
export const memberService = new MemberService();
