import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Fetch member
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('*')
      .eq('id', id)
      .single();

    if (memberError || !member) {
      return NextResponse.json({ success: false, error: 'Member not found' }, { status: 404 });
    }

    // Fetch accounts
    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .eq('member_id', id);

    // Fetch recent transactions
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('member_id', id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Fetch loans
    const { data: loans } = await supabase
      .from('loans')
      .select('*')
      .eq('member_id', id)
      .order('application_date', { ascending: false });

    // Fetch fines
    const { data: fines } = await supabase
      .from('fines')
      .select('*')
      .eq('member_id', id)
      .order('issued_date', { ascending: false });

    // Calculate balances
    const savingsAccount = accounts?.find(a => a.account_type === 'savings');
    const sharesAccount = accounts?.find(a => a.account_type === 'shares');
    
    const savingsBalance = savingsAccount?.balance || 0;
    const sharesBalance = sharesAccount?.balance || 0;
    
    // Calculate shares from savings (assuming 1 share = 100 KES)
    const shareValue = 100;
    const calculatedShares = Math.floor(savingsBalance / shareValue);
    
    const totalLoans = loans?.reduce((sum, l) => sum + (l.amount_due || 0), 0) || 0;
    const totalContributions = transactions?.filter(t => t.transaction_type === 'contribution').reduce((sum, t) => sum + t.amount, 0) || 0;

    return NextResponse.json({
      success: true,
      data: {
        member,
        accounts: accounts || [],
        transactions: transactions || [],
        loans: loans || [],
        fines: fines || [],
        savingsBalance,
        sharesBalance: calculatedShares,
        totalContributions,
        totalLoans,
      },
    });
  } catch (error) {
    console.error('Error fetching member:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch member' }, { status: 500 });
  }
}
