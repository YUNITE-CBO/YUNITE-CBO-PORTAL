import { NextRequest, NextResponse } from 'next/server';
import { loanService } from '@/lib/services';
import { z } from 'zod';

const applicationSchema = z.object({
  member_id: z.string().uuid(),
  loan_type: z.string().min(1),
  principal_amount: z.number().positive(),
  repayment_period_months: z.number().positive().optional(),
  purpose: z.string().optional(),
});

// GET /api/loans - Get pending loans or member loans
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const memberId = searchParams.get('member_id');

    if (memberId) {
      const loans = await loanService.getByMember(memberId);
      return NextResponse.json({ success: true, data: loans });
    }

    const loans = await loanService.getPending();
    return NextResponse.json({ success: true, data: loans });
  } catch (error) {
    console.error('Loans error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch loans' },
      { status: 500 }
    );
  }
}

// POST /api/loans - Apply for loan
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = applicationSchema.parse(body);

    const userId = body.user_id || '00000000-0000-0000-0000-000000000000';

    const loan = await loanService.apply({
      ...validated,
      user_id: userId,
    });

    return NextResponse.json({
      success: true,
      message: 'Loan application submitted',
      data: loan,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Loan application failed';
    console.error('Loan application error:', error);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
