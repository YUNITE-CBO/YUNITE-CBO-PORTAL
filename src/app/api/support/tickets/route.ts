import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/services/auth.service';
import { supportTicketService } from '@/lib/services/support-ticket.service';
export const dynamic = 'force-dynamic';

/**
 * Admin Support Tickets API (session-authenticated)
 *
 *   GET /api/support/tickets?status=&category=  - list all tickets (staff+)
 */

const STAFF_ROLES = ['staff', 'admin', 'super_admin'];

export async function GET(request: NextRequest) {
  try {
    const session = await authService.getSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!STAFF_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden: staff access required' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const tickets = await supportTicketService.listAll({
      status: searchParams.get('status') || undefined,
      category: searchParams.get('category') || undefined,
    });
    return NextResponse.json({ success: true, data: tickets });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Failed to list support tickets', message: error?.message || String(error) },
      { status: 500 }
    );
  }
}
