import { NextRequest, NextResponse } from 'next/server';

// Mock data for contribution campaigns
let campaigns: any[] = [
  {
    id: '1',
    campaign_name: 'Annual Welfare Fund 2024',
    description: 'Annual welfare fund for member support',
    target_amount: 500000,
    collected_amount: 125000,
    start_date: '2024-01-01',
    end_date: '2024-12-31',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    campaign_name: 'Emergency Relief Fund',
    description: 'Emergency relief fund for members in need',
    target_amount: 200000,
    collected_amount: 75000,
    start_date: '2024-03-01',
    end_date: null,
    is_active: true,
    created_at: '2024-03-01T00:00:00Z',
  },
];

export async function GET() {
  return NextResponse.json({
    success: true,
    data: campaigns,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const newCampaign = {
      id: Date.now().toString(),
      campaign_name: body.campaign_name,
      description: body.description || null,
      target_amount: body.target_amount || null,
      collected_amount: 0,
      start_date: body.start_date,
      end_date: body.end_date || null,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    
    campaigns.push(newCampaign);
    
    return NextResponse.json({
      success: true,
      data: newCampaign,
      message: 'Campaign created successfully',
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );
  }
}
