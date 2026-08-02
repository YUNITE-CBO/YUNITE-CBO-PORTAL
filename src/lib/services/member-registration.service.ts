/**
 * MEMBER REGISTRATION SERVICE
 * 
 * Atomic registration creates complete member workspace.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export interface MemberRegistrationData {
  first_name: string;
  last_name: string;
  email?: string;
  phone: string;
  id_number?: string;
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other';
  physical_address?: string;
  postal_address?: string;
  occupation?: string;
  employer?: string;
  employer_address?: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  next_of_kin_relationship?: string;
}

export class MemberRegistrationService {
  /**
   * Register member with complete workspace
   */
  async register(data: MemberRegistrationData, userId: string) {
    const supabase = await createServiceClient();
    const memberNumber = await this.generateMemberNumber();

    // 1. Create Member
    const { data: member, error: memberError } = await supabase
      .from('members')
      .insert({
        id: uuidv4(),
        member_number: memberNumber,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone,
        id_number: data.id_number,
        date_of_birth: data.date_of_birth,
        gender: data.gender,
        physical_address: data.physical_address,
        postal_address: data.postal_address,
        occupation: data.occupation,
        employer: data.employer,
        employer_address: data.employer_address,
        next_of_kin_name: data.next_of_kin_name,
        next_of_kin_phone: data.next_of_kin_phone,
        next_of_kin_relationship: data.next_of_kin_relationship,
        status: 'pending',
        registration_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (memberError || !member) {
      throw new Error(`Failed to create member: ${memberError?.message}`);
    }

    // 2. Create Accounts (savings, shares, contributions, welfare, fines)
    const accountTypes = ['savings', 'shares', 'contributions', 'welfare', 'fines'];
    const accounts = accountTypes.map(type => ({
      id: uuidv4(),
      member_id: member.id,
      account_type: type,
      status: 'active',
    }));

    const { error: accountsError } = await supabase
      .from('accounts')
      .insert(accounts);

    if (accountsError) {
      await supabase.from('members').delete().eq('id', member.id);
      throw new Error(`Failed to create accounts: ${accountsError.message}`);
    }

    // 3. Create Compliance Records
    const complianceTypes = ['id_verification', 'photo', 'kyc_complete'];
    const complianceRecords = complianceTypes.map(type => ({
      id: uuidv4(),
      member_id: member.id,
      compliance_type: type,
      status: 'pending',
    }));

    await supabase.from('compliance_records').insert(complianceRecords);

    // 4. Audit Log
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: 'members.register',
      record_id: member.id,
      user_id: userId,
      after_value: { member_number: memberNumber, name: `${data.first_name} ${data.last_name}` },
      description: `New member registered: ${memberNumber}`,
      created_at: new Date().toISOString(),
    });

    return { member, accounts };
  }

  /**
   * Generate unique member number
   */
  private async generateMemberNumber(): Promise<string> {
    const supabase = await createServiceClient();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    const { count } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${date}T00:00:00`)
      .lt('created_at', `${date}T23:59:59`);

    const sequence = String((count || 0) + 1).padStart(4, '0');
    return `YUN-${date}-${sequence}`;
  }

  /**
   * Get complete member workspace
   */
  async getWorkspace(memberId: string) {
    const supabase = await createServiceClient();

    const { data: member } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .single();

    if (!member) return null;

    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .eq('member_id', memberId);

    const { data: compliance } = await supabase
      .from('compliance_records')
      .select('*')
      .eq('member_id', memberId);

    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('member_id', memberId)
      .eq('reversed', false)
      .order('created_at', { ascending: false })
      .limit(20);

    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('member_id', memberId);

    const { data: loans } = await supabase
      .from('loans')
      .select('*')
      .eq('member_id', memberId);

    const { data: fines } = await supabase
      .from('fines')
      .select('*')
      .eq('member_id', memberId)
      .in('status', ['pending', 'partial']);

    return { member, accounts: accounts || [], compliance: compliance || [], transactions: transactions || [], documents: documents || [], loans: loans || [], fines: fines || [] };
  }

  /**
   * Search members
   */
  async search(params: { query?: string; status?: string; page?: number; limit?: number }) {
    const supabase = await createServiceClient();
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;

    let query = supabase.from('members').select('*', { count: 'exact' });

    if (params.query) {
      query = query.or(`first_name.ilike.%${params.query}%,last_name.ilike.%${params.query}%,member_number.ilike.%${params.query}%,phone.ilike.%${params.query}%`);
    }
    if (params.status) query = query.eq('status', params.status);

    const { data, count } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    return { members: data || [], total: count || 0, page, limit };
  }
}

export const memberRegistrationService = new MemberRegistrationService();
