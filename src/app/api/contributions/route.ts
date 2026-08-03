import { NextRequest, NextResponse } from 'next/server';

// Mock data for contributions
let contributions: any[] = [
  {
    id: '1',
    member_id: 'member-001',
    campaign_id: '1',
    amount: 5000,
    payment_method: 'mpesa',
    reference: 'STK123456',
    status: 'completed',
    created_at: '2024-06-15T10:30:00Z',
  },
  {
    id: '2',
    member_id: 'member-002',
    campaign_id: '1',
    amount: 3000,
    payment_method: 'cash',
    reference: null,
    status: 'completed',
    created_at: '2024-06-16T14:20:00Z',
  },
];

export async function GET() {
  return NextResponse.json({
    success: true,
    data: contributions,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { member_id, campaign_id, amount, payment_method, reference } = body;

    if (!member_id || !campaign_id || !amount) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: member_id, campaign_id, amount' },
        { status: 400 }
      );
    }

    const newContribution = {
      id: Date.now().toString(),
      member_id,
      campaign_id,
      amount: parseFloat(amount),
      payment_method: payment_method || 'cash',
      reference: reference || null,
      status: 'completed',
      created_at: new Date().toISOString(),
    };
    
    contributions.push(newContribution);
    
    return NextResponse.json({
      success: true,
      data: newContribution,
      message: 'Contribution recorded successfully',
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );
  }
}
