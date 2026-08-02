import { NextRequest, NextResponse } from 'next/server';
import { transactionService } from '@/lib/services';

// GET /api/transactions/member/[memberId] - Get member transaction history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const { memberId } = await params;
    const searchParams = request.nextUrl.searchParams;
    
    const account_type = searchParams.get('account_type') || undefined;
    const transaction_type = searchParams.get('type') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const result = await transactionService.getHistory({
      member_id: memberId,
      account_type,
      transaction_type,
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: result.transactions,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transaction history' },
      { status: 500 }
    );
  }
}
