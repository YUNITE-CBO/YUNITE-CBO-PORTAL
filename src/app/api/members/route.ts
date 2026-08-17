import { NextRequest, NextResponse } from 'next/server';
import { memberRegistrationService } from '@/lib/services';
import { requirePermission, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { z } from 'zod';
export const dynamic = 'force-dynamic';

const registrationSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(1),
  alt_phone: z.string().optional(),
  alt_email: z.string().email().optional(),
  id_number: z.string().optional(),
  kra_pin: z.string().optional(),
  date_of_birth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  marital_status: z.enum(['single', 'married', 'divorced', 'widowed']).optional(),
  nationality: z.string().optional(),
  physical_address: z.string().optional(),
  postal_address: z.string().optional(),
  occupation: z.string().optional(),
  employer: z.string().optional(),
  employer_address: z.string().optional(),
  next_of_kin_name: z.string().optional(),
  next_of_kin_phone: z.string().optional(),
  next_of_kin_relationship: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  emergency_contact_relationship: z.string().optional(),
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

    // Optional: if an admin is registering FROM a pre-registration submission
    // (auto-fill flow), the client sends `_submission_id`. After the existing
    // registration engine succeeds we mark that submission REGISTERED and link
    // it to the new member — this is what prevents double-registration from
    // the same submission. The field is stripped before validation so it never
    // reaches the registration schema.
    const submissionId = typeof body._submission_id === 'string' ? body._submission_id : undefined;
    delete body._submission_id;

    // Strip empty strings from optional fields so `.email().optional()` etc.
    // don't reject blank inputs from the registration form (which always sends
    // every field as a string, including '').
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === '' || value === null) continue;
      cleaned[key] = value;
    }
    const validated = registrationSchema.parse(cleaned);

    // Use authenticated user's ID
    const userId = authResult.user!.user_id;

    try {
      const result = await memberRegistrationService.register(validated, userId);

      // If this registration came from a pre-registration submission, link it.
      // Best-effort: a failure to link must NOT undo the successful member
      // registration. The submission can be linked later if this fails.
      if (submissionId) {
        try {
          const { memberRegistrationSubmissionService } = await import(
            '@/lib/services/member-registration-submission.service'
          );
          const linkResult = await memberRegistrationSubmissionService.markRegistered(
            submissionId,
            result.member.id,
            result.member.member_number,
            userId
          );
          if (!linkResult.success) {
            console.warn(`Member registered (${result.member.member_number}) but submission ${submissionId} link failed: ${linkResult.error}`);
          }
        } catch (linkError) {
          console.warn('Failed to link submission after registration:', linkError);
        }
      }

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
      // The dashboard member search sends `search`; the service expects `query`.
      // Accept either so the search term is actually applied instead of being
      // silently dropped (which caused the wrong member to be returned).
      query: searchParams.get('query') || searchParams.get('search') || undefined,
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
