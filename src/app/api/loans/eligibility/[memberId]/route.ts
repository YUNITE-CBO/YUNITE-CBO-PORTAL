import { NextRequest, NextResponse } from 'next/server';
import { loanService } from '@/lib/services';

// GET /api/loans/eligibility/[memberId] - Calculate loan eligibility
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const { memberId } = await params;

    const eligibility = await loanService.calculateEligibility(memberId);

    return NextResponse.json({
      success: true,
      data: eligibility,
    });
  } catch (error) {
    console.error('Loan eligibility error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to calculate eligibility' },
      { status: 500 }
    );
  }
}
