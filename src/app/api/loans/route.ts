import { NextRequest, NextResponse } from 'next/server';
import { loanService } from '@/lib/services';
import { z } from 'zod';

const applicationSchema = z.object({
  member_id: z.string().uuid(),
  loan_type: z.string().min(1),
  principal_amount: z.number().positive(),
  repayment_period_months: z.number().positive().optional(),
  purpose: z.string().optional(),
  collateral_description: z.string().optional(),
  guarantor_id: z.string().uuid().optional(),
});

const approvalSchema = z.object({
  loan_id: z.string().uuid(),
  approved_amount: z.number().positive().optional(),
  interest_rate: z.number().positive().optional(),
  repayment_period_months: z.number().positive().optional(),
  notes: z.string().optional(),
});

const disbursementSchema = z.object({
  loan_id: z.string().uuid(),
  notes: z.string().optional(),
});

const repaymentSchema = z.object({
  loan_id: z.string().uuid(),
  amount: z.number().positive(),
  notes: z.string().optional(),
});

// GET /api/loans - Get pending loans
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const memberId = searchParams.get('member_id');

    let loans;

    if (memberId) {
      loans = await loanService.getByMember(memberId);
    } else if (status === 'pending') {
      loans = await loanService.getPending();
    } else {
      loans = [];
    }

    return NextResponse.json({
      success: true,
      data: loans,
    });
  } catch (error) {
    console.error('Error fetching loans:', error);
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

    const userId = '00000000-0000-0000-0000-000000000000';

    const loan = await loanService.apply({
      ...validated,
      user_id: userId,
    });

    return NextResponse.json({
      success: true,
      message: 'Loan application submitted successfully',
      data: loan,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Failed to submit loan application';
    console.error('Error applying for loan:', error);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
