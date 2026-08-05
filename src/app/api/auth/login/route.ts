import { NextRequest, NextResponse } from 'next/server';
import { authService, DeviceInfo, parseDeviceInfo } from '@/lib/services/auth.service';
import { authNotificationService } from '@/lib/services/notifications/auth-notification.service';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Extract client information
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                      request.headers.get('x-real-ip') || 
                      'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const deviceInfo: DeviceInfo = parseDeviceInfo(userAgent);

    // Attempt login
    const result = await authService.login(email, password, ipAddress, userAgent, deviceInfo);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.error_code === 'ACCOUNT_LOCKED' ? 423 : 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      data: {
        user: result.user,
      },
      token: result.token,
    });

    // Set auth cookie
    response.cookies.set('auth_token', result.token!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    // Send notifications asynchronously (don't block response)
    const timestamp = new Date();
    
    // Notify the user
    authNotificationService.notifyUserLogin({
      userId: result.user!.id,
      userEmail: result.user!.email,
      userName: result.user!.full_name,
      userRole: result.user!.role,
      eventType: 'login',
      ipAddress,
      deviceInfo,
      timestamp,
    }).catch(err => console.error('Failed to send login notification to user:', err));

    // Notify super admins
    authNotificationService.notifySuperAdminLogin({
      userId: result.user!.id,
      userEmail: result.user!.email,
      userName: result.user!.full_name,
      userRole: result.user!.role,
      eventType: 'login',
      ipAddress,
      deviceInfo,
      timestamp,
    }).catch(err => console.error('Failed to notify super admins:', err));

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: 'Login failed' },
      { status: 500 }
    );
  }
}
