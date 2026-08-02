import { createClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export class LoanService {
  async apply(params: any) {
    const supabase = await createClient();
    const { data: savings } = await supabase.from('accounts').select('balance').eq('member_id', params.member_id).eq('account_type', 'savings').single();
    const { data: rate } = await supabase.from('settings').select('value').eq('key', 'loan.max_eligibility_percentage').single();
    const maxPercentage = rate ? parseFloat(rate.value) : 200;
    const maxAmount = savings ? (Number(savings.balance) * maxPercentage) / 100 : 0;
    if (params.principal_amount > maxAmount) throw new Error(`Exceeds max ${maxAmount}`);
    
    const interestAmount = (params.principal_amount * 10) / 100;
    const { data, error } = await supabase.from('loans').insert({
      id: uuidv4(), member_id: params.member_id, loan_type: params.loan_type,
      principal_amount: params.principal_amount, interest_rate: 10, interest_amount: interestAmount,
      total_amount: params.principal_amount + interestAmount, amount_paid: 0, amount_due: params.principal_amount + interestAmount,
      repayment_period_months: params.repayment_period_months || 12, monthly_repayment: (params.principal_amount + interestAmount) / (params.repayment_period_months || 12),
      purpose: params.purpose, status: 'pending'
    }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async getPending() {
    const supabase = await createClient();
    const { data } = await supabase.from('loans').select('*,member:members(first_name,last_name,member_number)').eq('status', 'pending').order('created_at', {ascending: false});
    return data || [];
  }

  async getByMember(memberId: string) {
    const supabase = await createClient();
    const { data } = await supabase.from('loans').select('*').eq('member_id', memberId).order('created_at', {ascending: false});
    return data || [];
  }

  async calculateEligibility(memberId: string) {
    const supabase = await createClient();
    const { data: savings } = await supabase.from('accounts').select('balance').eq('member_id', memberId).eq('account_type', 'savings').single();
    const { data: rate } = await supabase.from('settings').select('value').eq('key', 'loan.max_eligibility_percentage').single();
    const maxPercentage = rate ? parseFloat(rate.value) : 200;
    return { savingsBalance: Number(savings?.balance || 0), maxEligibilityPercentage: maxPercentage, maxLoanAmount: (Number(savings?.balance || 0) * maxPercentage) / 100 };
  }
}
export const loanService = new LoanService();
