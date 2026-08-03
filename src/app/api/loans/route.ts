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

// GET /api/loans - Get all loans or filter by status/member
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const memberId = searchParams.get('member_id');
    const status = searchParams.get('status');

    if (memberId) {
      const loans = await loanService.getByMember(memberId);
      return NextResponse.json({ success: true, data: loans });
    }

    if (status) {
      const loans = await loanService.getByStatus(status);
      return NextResponse.json({ success: true, data: loans });
    }

    // Get all loans for dashboard
    const loans = await loanService.getAll();
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

// PUT /api/loans - Approve or reject loan
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { loan_id, action, disbursement_date } = body;

    if (!loan_id || !action) {
      return NextResponse.json(
        { success: false, error: 'loan_id and action are required' },
        { status: 400 }
      );
    }

    const userId = body.user_id || '00000000-0000-0000-0000-000000000000';

    let result;
    if (action === 'approve') {
      result = await loanService.approve(loan_id, userId, disbursement_date);
      return NextResponse.json({
        success: true,
        message: 'Loan approved successfully',
        data: result,
      });
    } else if (action === 'reject') {
      result = await loanService.reject(loan_id, userId, body.reason);
      return NextResponse.json({
        success: true,
        message: 'Loan rejected',
        data: result,
      });
    } else if (action === 'disburse') {
      result = await loanService.disburse(loan_id, userId, disbursement_date);
      return NextResponse.json({
        success: true,
        message: 'Loan disbursed successfully',
        data: result,
      });
    } else if (action === 'repay') {
      const repayAmount = parseFloat(body.amount);
      if (isNaN(repayAmount) || repayAmount <= 0) {
        return NextResponse.json(
          { success: false, error: 'Valid repayment amount is required' },
          { status: 400 }
        );
      }
      result = await loanService.repay(loan_id, userId, repayAmount);
      return NextResponse.json({
        success: true,
        message: 'Loan repayment recorded successfully',
        data: result,
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Use: approve, reject, disburse, or repay' },
        { status: 400 }
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Loan operation failed';
    console.error('Loan operation error:', error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
