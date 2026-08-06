import { NextRequest, NextResponse } from 'next/server';
import { memberRegistrationService } from '@/lib/services';
import { requirePermission, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { z } from 'zod';

const registrationSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(1),
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

// POST /api/members - Register new member
export async function POST(request: NextRequest) {
  try {
    // Require permission to create members
    const authResult = await requirePermission(request, 'members', 'create');
    if (!authResult.success) {
      return authResult.status === 401 
        ? unauthorizedResponse(authResult.error)
        : forbiddenResponse(authResult.error);
    }

    const body = await request.json();
    const validated = registrationSchema.parse(body);

    // Use authenticated user's ID
    const userId = authResult.user!.user_id;

    try {
      const result = await memberRegistrationService.register(validated, userId);

      return NextResponse.json({
        success: true,
        message: 'Member registered successfully',
        data: {
          member: result.member,
          accounts: result.accounts,
        },
      }, { status: 201 });
    } catch (error) {
      throw error; // Let the outer catch handle it
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Registration failed';
    console.error('Registration error:', error);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// GET /api/members - Search members
export async function GET(request: NextRequest) {
  try {
    // Require authentication for member reads
    const authResult = await requirePermission(request, 'members', 'read');
    if (!authResult.success) {
      return authResult.status === 401 
        ? unauthorizedResponse(authResult.error)
        : forbiddenResponse(authResult.error);
    }

    const searchParams = request.nextUrl.searchParams;

    const result = await memberRegistrationService.search({
      query: searchParams.get('query') || undefined,
      status: searchParams.get('status') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '20'),
    });

    return NextResponse.json({
      success: true,
      data: result.members,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    });
  } catch (error) {
    console.error('Error searching members:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to search members' },
      { status: 500 }
    );
  }
}
