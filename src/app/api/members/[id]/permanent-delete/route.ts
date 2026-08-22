/**
 * PERMANENT MEMBER DELETION — Super Admin only.
 *
 * GET  /api/members/[id]/permanent-delete
 *   Read-only dependency scan: every record connected to the member across
 *   the database + the member's live financial state. Powers the admin
 *   confirmation screen.
 *
 * POST /api/members/[id]/permanent-delete
 *   Executes the atomic permanent deletion. Body:
 *     { confirm_text: "DELETE MEMBER", reason?: string }
 *   The entire deletion runs inside ONE Postgres transaction
 *   (permanently_delete_member(), migration 045): any failure rolls back
 *   EVERYTHING. Post-deletion verification + org-total recalculation are
 *   included in the completion report.
 *
 * The reversible alternative is DELETE /api/members/[id] (archive →
 * status 'withdrawn'). This route is the IRREVERSIBLE level.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/authorization';
import { getClientIP, getUserAgent } from '@/lib/auth';
import {
  memberDeletionService,
  PermanentDeletionError,
  PERMANENT_DELETE_CONFIRMATION_TEXT,
} from '@/lib/services/member-deletion.service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSuperAdmin(request);
  if (!authResult.success) {
    return authResult.status === 401
      ? unauthorizedResponse(authResult.error)
      : forbiddenResponse(authResult.error);
  }

  try {
    const { id } = await params;
    const scan = await memberDeletionService.scanMemberDependencies(id);
    if (!scan) {
      return NextResponse.json({ success: false, error: 'Member not found' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      data: scan,
      confirmation_required: PERMANENT_DELETE_CONFIRMATION_TEXT,
    });
  } catch (error) {
    console.error('Error scanning member dependencies:', error);
    return NextResponse.json({ success: false, error: 'Failed to scan member dependencies' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSuperAdmin(request);
  if (!authResult.success) {
    return authResult.status === 401
      ? unauthorizedResponse(authResult.error)
      : forbiddenResponse(authResult.error);
  }
  const user = authResult.user!;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const report = await memberDeletionService.executePermanentDeletion(
      id,
      user.user_id,
      body.confirm_text || '',
      {
        reason: body.reason,
        ipAddress: getClientIP(request),
        userAgent: getUserAgent(request),
      }
    );

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    if (error instanceof PermanentDeletionError) {
      const status =
        error.code === 'NOT_FOUND' ? 404 :
        error.code === 'CONFIRMATION_REQUIRED' ? 400 :
        error.code === 'VERIFICATION_FAILED' ? 409 : 500;
      return NextResponse.json(
        { success: false, error: error.message, code: error.code, details: error.details ?? null },
        { status }
      );
    }
    console.error('Error permanently deleting member:', error);
    return NextResponse.json({ success: false, error: 'Failed to permanently delete member' }, { status: 500 });
  }
}
