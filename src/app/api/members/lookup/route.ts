import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { transactionEngine } from '@/lib/services';

export const dynamic = 'force-dynamic';

/**
 * GET /api/members/lookup
 * 
 * Read-only lookup for verifying member data.
 * Used to verify system functionality before public portal.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const memberNumber = searchParams.get('member_number');
    const phone = searchParams.get('phone');

    if (!memberNumber && !phone) {
      return NextResponse.json(
        { success: false, error: 'Please provide member_number or phone' },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    // Search for member
    let query = supabase.from('members').select('*');
    
    if (memberNumber) {
      query = query.eq('member_number', memberNumber);
    } else if (phone) {
      query = query.eq('phone', phone);
    }

    const { data: member, error: memberError } = await query.single();

    if (memberError || !member) {
      return NextResponse.json(
        { success: false, error: 'Member not found' },
        { status: 404 }
      );
    }

    // Get all related data in parallel
    const [
      { data: transactions },
      { data: loans },
      { data: fines },
      { data: documents },
      { data: compliance },
    ] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('member_id', member.id)
        .eq('reversed', false)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('loans')
        .select('*')
        .eq('member_id', member.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('fines')
        .select('*')
        .eq('member_id', member.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('documents')
        .select('*')
        .eq('member_id', member.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('compliance_records')
        .select('*')
        .eq('member_id', member.id)
        .order('created_at', { ascending: false }),
    ]);

    // Calculate all balances
    const balances = await transactionEngine.calculateAllBalances(member.id);

    return NextResponse.json({
      success: true,
      data: {
        member,
        balances,
        transactions: transactions || [],
        loans: loans || [],
        fines: fines || [],
        documents: documents || [],
        compliance: compliance || [],
      },
    });
  } catch (error) {
    console.error('Lookup error:', error);
    return NextResponse.json(
      { success: false, error: 'Lookup failed' },
      { status: 500 }
    );
  }
}
