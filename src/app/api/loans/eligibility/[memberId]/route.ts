import { NextRequest, NextResponse } from 'next/server';
import { loanService } from '@/lib/services';

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
    console.error('Error calculating eligibility:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to calculate loan eligibility' },
      { status: 500 }
    );
  }
}
