import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/services/auth.service';
import { supportTicketService, SUPPORT_TICKET_STATUSES } from '@/lib/services/support-ticket.service';
export const dynamic = 'force-dynamic';

/**
 *   PATCH /api/support/tickets/[id]  - update status / admin response (staff+)
 *                                      Member is notified on status change.
 */

const STAFF_ROLES = ['staff', 'admin', 'super_admin'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authService.getSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!STAFF_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden: staff access required' }, { status: 403 });
    }

    const body = (await request.json()) as { status?: string; admin_response?: string | null };
    if (!body.status || !(SUPPORT_TICKET_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json(
        { success: false, error: `status must be one of: ${SUPPORT_TICKET_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const ticket = await supportTicketService.updateStatus(
      params.id,
      { status: body.status, admin_response: body.admin_response },
      session.user.id
    );
    return NextResponse.json({ success: true, data: ticket });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Failed to update support ticket', message: error?.message || String(error) },
      { status: 500 }
    );
  }
}
