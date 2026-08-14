/**
 * Auth guard for AI Intelligence routes (session-authenticated admin+).
 *
 * The AI dashboard surfaces findings about the whole organization, including
 * financial inconsistencies, so access is restricted to admin+. Super_admin
 * is allowed (and required for destructive schedule edits). This mirrors the
 * automation/trigger + automation/runs pattern.
 */

import { NextResponse } from 'next/server';
import { authService } from '@/lib/services/auth.service';

export interface AdminAuthResult {
  ok: boolean;
  response?: NextResponse;
  userId?: string;
  role?: string;
  isSuperAdmin?: boolean;
}

export async function requireAdminAuth(): Promise<AdminAuthResult> {
  const session = await authService.getSession();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }
  const role = session.user.role;
  if (role !== 'admin' && role !== 'super_admin') {
    return { ok: false, response: NextResponse.json({ success: false, error: 'Forbidden: admin access required' }, { status: 403 }) };
  }
  return { ok: true, userId: session.user.id, role, isSuperAdmin: role === 'super_admin' };
}

export function requireSuperAdmin(result: AdminAuthResult): NextResponse | null {
  if (!result.ok || !result.isSuperAdmin) {
    return NextResponse.json({ success: false, error: 'Forbidden: super admin access required' }, { status: 403 });
  }
  return null;
}
