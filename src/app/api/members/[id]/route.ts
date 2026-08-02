import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { transactionEngine } from '@/lib/services/transaction.engine';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServiceClient();

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

    // Fetch recent transactions (excluding reversals)
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('member_id', id)
      .eq('reversed', false)
      .order('created_at', { ascending: false })
      .limit(20);

    // Fetch active loans
    const { data: loans } = await supabase
      .from('loans')
      .select('*')
      .eq('member_id', id)
      .in('status', ['pending', 'approved', 'disbursed', 'active']);

    // Fetch pending/partial fines
    const { data: fines } = await supabase
      .from('fines')
      .select('*')
      .eq('member_id', id)
      .in('status', ['pending', 'partial']);

    // Calculate balances using TransactionEngine
    const balances = await transactionEngine.calculateAllBalances(id);

    // Calculate contributions from transactions
    const contributions = transactions
      ?.filter(t => t.transaction_type.startsWith('contribution_'))
      .reduce((sum, t) => sum + Number(t.amount), 0) || 0;

    return NextResponse.json({
      success: true,
      data: {
        member,
        accounts: accounts || [],
        transactions: transactions || [],
        loans: loans || [],
        fines: fines || [],
        balances: {
          ...balances,
          contributions,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching member:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch member' }, { status: 500 });
  }
}
