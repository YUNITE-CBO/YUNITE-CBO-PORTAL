import { NextResponse } from 'next/server';
import { createHandler } from '@/lib/api/handler';
import { success } from '@/lib/api/response';
import { authService, parseDeviceInfo, type DeviceInfo } from '@/lib/services/auth.service';
import { authNotificationService } from '@/lib/services/notifications/auth-notification.service';
import { ApiError } from '@/lib/api/error';
export const dynamic = 'force-dynamic';

export const POST = createHandler('auth.login', async (ctx) => {
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const email = body.email;
  const password = body.password;
  if (!email || !password) throw ApiError.validation('email and password are required');

  const ipAddress = ctx.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || ctx.request.headers.get('x-real-ip') || 'unknown';
  const userAgent = ctx.request.headers.get('user-agent') || 'unknown';
  const deviceInfo: DeviceInfo = parseDeviceInfo(userAgent);

  // Login delegated to the authoritative Auth Service.
  const result = await authService.login(String(email), String(password), ipAddress, userAgent, deviceInfo);
  if (!result.success || !result.token) {
    throw new ApiError(result.error_code === 'ACCOUNT_LOCKED' ? 'forbidden' : 'unauthorized', result.error ?? 'Login failed');
  }

  const res = success(ctx.requestId, { user: result.user }, 200);
  res.cookies.set('auth_token', result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  });

  // Best-effort login notifications (must never block the response).
  const timestamp = new Date();
  authNotificationService.notifyUserLogin({
    userId: result.user!.id, userEmail: result.user!.email, userName: result.user!.full_name,
    userRole: result.user!.role, eventType: 'login', ipAddress, deviceInfo, timestamp,
  }).catch((err) => console.error('login notification failed:', err));
  authNotificationService.notifySuperAdminLogin({
    userId: result.user!.id, userEmail: result.user!.email, userName: result.user!.full_name,
    userRole: result.user!.role, eventType: 'login', ipAddress, deviceInfo, timestamp,
  }).catch((err) => console.error('admin notification failed:', err));

  return res;
});
