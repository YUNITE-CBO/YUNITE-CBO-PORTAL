import { NextRequest, NextResponse } from 'next/server';
import { fineService } from '@/lib/services';
import { z } from 'zod';

const fineSchema = z.object({
  member_id: z.string().uuid(),
  fine_type: z.string().min(1),
  amount: z.number().positive(),
  reason: z.string().min(1),
  due_date: z.string().optional(),
  notes: z.string().optional(),
});

// GET /api/fines - Get pending fines
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const memberId = searchParams.get('member_id');
    const status = searchParams.get('status');

    let fines;

    if (memberId) {
      fines = await fineService.getByMember(memberId);
    } else if (status === 'pending') {
      fines = await fineService.getPending();
    } else {
      fines = [];
    }

    return NextResponse.json({
      success: true,
      data: fines,
    });
  } catch (error) {
    console.error('Error fetching fines:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch fines' },
      { status: 500 }
    );
  }
}

// POST /api/fines - Issue new fine
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = fineSchema.parse(body);

    const userId = '00000000-0000-0000-0000-000000000000';

    const fine = await fineService.create({
      ...validated,
      user_id: userId,
    });

    return NextResponse.json({
      success: true,
      message: 'Fine issued successfully',
      data: fine,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Failed to issue fine';
    console.error('Error issuing fine:', error);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
