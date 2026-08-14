import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { createHandler } from '@/lib/api/handler';
import { success } from '@/lib/api/response';
import { authService } from '@/lib/services/auth.service';
import { ApiError } from '@/lib/api/error';

export const POST = createHandler('auth.logout', async (ctx) => {
  if (!ctx.principal.userId || !ctx.principal.role) throw ApiError.unauthorized('Not authenticated');
  const ipAddress = ctx.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const userAgent = ctx.request.headers.get('user-agent') || 'unknown';

  // The session id travels in the JWT; terminate it via the Auth Service.
  // resolvePrincipal already validated the session is active.
  const token = ctx.request.cookies.get('auth_token')?.value ?? '';
  await authService.logout(ctx.principal.userId, token, ipAddress, userAgent);

  const res = success(ctx.requestId, { logged_out: true });
  res.cookies.delete('auth_token');
  return res;
});
