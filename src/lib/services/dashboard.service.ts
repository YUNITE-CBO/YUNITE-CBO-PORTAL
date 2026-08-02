import { createClient } from '@/lib/supabase/server';

export class DashboardService {
  async getStats() {
    const supabase = await createClient();
    const { count: totalMembers } = await supabase.from('members').select('*', {count: 'exact', head: true});
    const { count: activeMembers } = await supabase.from('members').select('*', {count: 'exact', head: true}).eq('status', 'active');
    const startOfMonth = new Date(); startOfMonth.setDate(1);
    const { count: newRegs } = await supabase.from('members').select('*', {count: 'exact', head: true}).gte('registration_date', startOfMonth.toISOString().split('T')[0]);
    
    const { data: savingsData } = await supabase.from('accounts').select('balance').eq('account_type', 'savings').eq('status', 'active');
    const { data: sharesData } = await supabase.from('accounts').select('balance').eq('account_type', 'shares').eq('status', 'active');
    const { data: disbursedLoans } = await supabase.from('loans').select('principal_amount').in('status', ['disbursed', 'active', 'completed']);
    const { data: outstandingLoans } = await supabase.from('loans').select('amount_due').in('status', ['disbursed', 'active']);
    
    return {
      total_members: totalMembers || 0, active_members: activeMembers || 0, new_registrations: newRegs || 0,
      total_savings: savingsData?.reduce((s: number, a: any) => s + Number(a.balance), 0) || 0,
      total_shares: sharesData?.reduce((s: number, a: any) => s + Number(a.balance), 0) || 0,
      total_loans_disbursed: disbursedLoans?.reduce((s: number, l: any) => s + Number(l.principal_amount), 0) || 0,
      total_loans_outstanding: outstandingLoans?.reduce((s: number, l: any) => s + Number(l.amount_due), 0) || 0,
      total_fines_pending: 0, total_contributions: 0
    };
  }

  async getRecentActivity(limit: number = 20) {
    const supabase = await createClient();
    const activities: any[] = [];
    const { data: members } = await supabase.from('members').select('id,first_name,last_name,created_at').order('created_at', {ascending: false}).limit(limit);
    (members || []).forEach((m: any) => activities.push({id: `m-${m.id}`, type: 'member_registration', description: 'New member', member_name: `${m.first_name} ${m.last_name}`, created_at: m.created_at}));
    const { data: txns } = await supabase.from('transactions').select('*').eq('reversed', false).order('created_at', {ascending: false}).limit(limit);
    (txns || []).forEach((t: any) => activities.push({id: `t-${t.id}`, type: t.transaction_type, description: t.transaction_type, amount: Number(t.amount), created_at: t.created_at}));
    return activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
  }

  async getAlerts() {
    const supabase = await createClient();
    const alerts: any[] = [];
    const { count: pendingLoans } = await supabase.from('loans').select('*', {count: 'exact', head: true}).eq('status', 'pending');
    if (pendingLoans) alerts.push({type: 'info', title: 'Pending Loans', message: `${pendingLoans} application(s) awaiting approval`});
    return alerts;
  }
}
export const dashboardService = new DashboardService();
