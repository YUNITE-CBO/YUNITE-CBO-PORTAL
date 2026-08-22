/**
 * PERMANENT MEMBER DELETION AUDIT — Super Admin only.
 *
 * GET /api/admin/member-deletions
 *   The minimal administrative audit trail of permanent member deletions
 *   (who authorized it, when, which member id/number). Contains NO deleted
 *   financial history by design (migration 045).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/authorization';
import { memberDeletionService } from '@/lib/services/member-deletion.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireSuperAdmin(request);
  if (!authResult.success) {
    return authResult.status === 401
      ? unauthorizedResponse(authResult.error)
      : forbiddenResponse(authResult.error);
  }

  try {
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 50, 200);
    const rows = await memberDeletionService.listDeletionAudit(limit);
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error listing member deletion audit:', error);
    return NextResponse.json({ success: false, error: 'Failed to list deletion audit' }, { status: 500 });
  }
}
