import { NextRequest, NextResponse } from 'next/server';
import { memberService } from '@/lib/services';
import { z } from 'zod';

const registrationSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().min(1).max(50),
  id_number: z.string().optional(),
  date_of_birth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  physical_address: z.string().optional(),
  postal_address: z.string().optional(),
  occupation: z.string().optional(),
  employer: z.string().optional(),
  employer_address: z.string().optional(),
  next_of_kin_name: z.string().optional(),
  next_of_kin_phone: z.string().optional(),
  next_of_kin_relationship: z.string().optional(),
});

// GET /api/members - Search or list members
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || undefined;
    const member_number = searchParams.get('member_number') || undefined;
    const phone = searchParams.get('phone') || undefined;
    const status = searchParams.get('status') as any || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const result = await memberService.search({
      query,
      member_number,
      phone,
      status,
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: result.members,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching members:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch members' },
      { status: 500 }
    );
  }
}

// POST /api/members - Register new member
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = registrationSchema.parse(body);

    // TODO: Get actual user_id from session
    const userId = 'system';

    const { member, accounts } = await memberService.register(validated, userId);

    return NextResponse.json({
      success: true,
      message: 'Member registered successfully',
      data: { member, accounts },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error registering member:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to register member' },
      { status: 500 }
    );
  }
}
