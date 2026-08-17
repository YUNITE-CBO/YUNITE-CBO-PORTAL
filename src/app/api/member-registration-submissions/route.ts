import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRegistrationSubmissionService } from '@/lib/services/member-registration-submission.service';
import { getClientIP, getUserAgent, requirePermission, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';

// PUBLIC submission schema — mirrors src/app/api/members/route.ts
// registrationSchema EXACTLY (same fields, same required/optional flags, same
// validation rules). Empty strings are stripped just like the members route
// so optional .email() fields left blank by the form don't 400.
const submissionSchema = z.object({
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

/**
 * PUBLIC endpoint: a prospective member submits their information.
 *
 * This does NOT create a member, account, workspace, or any financial record.
 * It only stores a pending pre-registration submission awaiting administrator
 * processing. An applicant can only submit their OWN information — this route
 * exposes no list/read surface to the public.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Strip empty strings / nulls (mirrors /api/members route handling).
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === '' || value === null) continue;
      cleaned[key] = value;
    }

    const validated = submissionSchema.parse(cleaned);

    const { submission, duplicates } =
      await memberRegistrationSubmissionService.create(validated, {
        ipAddress: getClientIP(request),
        userAgent: getUserAgent(request),
        source: 'public_form',
      });

    return NextResponse.json(
      {
        success: true,
        message:
          'Your information has been submitted successfully. Your application is awaiting processing by YUNITE PAMOJA CBO. This submission does not automatically make you a registered member.',
        data: {
          submission_reference: submission.submission_reference,
          status: submission.status,
          duplicate_flagged: duplicates.flagged,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    const errorMessage = error instanceof Error ? error.message : 'Submission failed';
    console.error('Member registration submission error:', error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * ADMIN endpoint: list/search the applicant queue. Requires members.read.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'members', 'read');
    if (!authResult.success) {
      return authResult.status === 401
        ? unauthorizedResponse(authResult.error)
        : forbiddenResponse(authResult.error);
    }

    const sp = request.nextUrl.searchParams;
    const result = await memberRegistrationSubmissionService.list({
      query: sp.get('query') || undefined,
      status: (sp.get('status') as 'submitted' | 'reviewing' | 'registered' | 'rejected' | 'archived' | 'all') || undefined,
      includeRegistered: sp.get('includeRegistered') === 'true',
      page: parseInt(sp.get('page') || '1'),
      limit: parseInt(sp.get('limit') || '50'),
    });

    return NextResponse.json({
      success: true,
      data: result.submissions,
      pagination: { page: result.page, limit: result.limit, total: result.total },
    });
  } catch (error) {
    console.error('Error listing submissions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list submissions' },
      { status: 500 }
    );
  }
}
