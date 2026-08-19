import { NextRequest, NextResponse } from 'next/server';
import { memberRegistrationSubmissionService } from '@/lib/services/member-registration-submission.service';
import { requirePermission, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';

/**
 * GET /api/member-registration-submissions/:id
 * Admin: fetch a single submission + refresh its duplicate status against
 * the current member set (the member set may have changed since submission).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requirePermission(request, 'members', 'read');
    if (!authResult.success) {
      return authResult.status === 401
        ? unauthorizedResponse(authResult.error)
        : forbiddenResponse(authResult.error);
    }

    const submission = await memberRegistrationSubmissionService.getById(params.id);
    if (!submission) {
      return NextResponse.json(
        { success: false, error: 'Submission not found' },
        { status: 404 }
      );
    }

    const duplicates = await memberRegistrationSubmissionService.refreshDuplicates(params.id);

    return NextResponse.json({
      success: true,
      data: { ...submission, duplicate_match: duplicates.match, duplicate_flagged: duplicates.flagged },
    });
  } catch (error) {
    console.error('Error fetching submission:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch submission' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/member-registration-submissions/:id
 * Admin lifecycle transitions. `status` in body selects the action:
 *   reviewing -> markReviewing(admin)
 *   rejected  -> reject(admin, reason)
 *   archived  -> archive(admin)
 *
 * NOTE: `registered` is NOT settable here. A submission becomes registered
 * ONLY through the existing Register Member flow (which calls
 * markRegistered after the real engine creates the member) — preventing a
 * second registration engine from existing.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requirePermission(request, 'members', 'create');
    if (!authResult.success) {
      return authResult.status === 401
        ? unauthorizedResponse(authResult.error)
        : forbiddenResponse(authResult.error);
    }

    const body = await request.json();
    const { status, reason } = body as { status: string; reason?: string };
    const adminUserId = authResult.user!.user_id;

    let result;
    if (status === 'applied') {
      // Apply an update-intent submission to its linked existing member.
      // Mutates a member record, so require members.update on top of the
      // general create permission checked above.
      const updAuth = await requirePermission(request, 'members', 'update');
      if (!updAuth.success) {
        return updAuth.status === 401
          ? unauthorizedResponse(updAuth.error)
          : forbiddenResponse(updAuth.error);
      }
      result = await memberRegistrationSubmissionService.applyUpdate(params.id, updAuth.user!.user_id);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, data: result.member });
    } else if (status === 'reviewing') {
      await memberRegistrationSubmissionService.markReviewing(params.id, adminUserId);
      result = { success: true };
    } else if (status === 'rejected') {
      result = await memberRegistrationSubmissionService.reject(
        params.id,
        adminUserId,
        reason || 'Rejected by administrator'
      );
    } else if (status === 'archived') {
      result = await memberRegistrationSubmissionService.archive(params.id, adminUserId);
    } else if (status === 'registered') {
      return NextResponse.json(
        {
          success: false,
          error:
            'A submission can only be marked registered through the Register Member flow (which runs the existing registration engine).',
        },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { success: false, error: `Unknown status transition: ${status}` },
        { status: 400 }
      );
    }

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating submission:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update submission' },
      { status: 500 }
    );
  }
}
