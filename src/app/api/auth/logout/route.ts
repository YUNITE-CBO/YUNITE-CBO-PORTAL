import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { jwtVerify } from 'jose';
import { authService } from '@/lib/services/auth.service';
import { authNotificationService } from '@/lib/services/notifications/auth-notification.service';
import { createServiceClient } from '@/lib/supabase/server';

const JWT_SECRET = new TextEncoder().encode(
  process.env.SUPABASE_JWT_SECRET || 'your-secret-key-at-least-32-chars'
);

export async function POST(request: NextRequest) {
  try {
    // Extract token and user info
    const token = request.cookies.get('auth_token')?.value;
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                      request.headers.get('x-real-ip') || 
                      'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    let userId: string | null = null;
    let userEmail: string | null = null;
    let userName: string | null = null;
    let userRole: string | null = null;

    if (token) {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        userId = payload.user_id as string;
        userEmail = payload.email as string;
        userRole = payload.role as string;
        
        // Get full name
        const supabase = await createServiceClient();
        const { data: user } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', userId)
          .single();
        
        userName = user?.full_name || null;
      } catch {
        // Invalid token, proceed with logout
      }
    }

    // Perform logout
    if (userId && token) {
      await authService.logout(userId, token, ipAddress, userAgent);
    }

    const timestamp = new Date();

    // Send notifications asynchronously
    if (userId && userEmail && userName && userRole) {
      // Notify the user
      authNotificationService.notifyUserLogout({
        userId,
        userEmail,
        userName,
        userRole,
        eventType: 'logout',
        ipAddress,
        timestamp,
      }).catch(err => console.error('Failed to send logout notification:', err));

      // Notify super admins
      authNotificationService.notifySuperAdminLogout({
        userId,
        userEmail,
        userName,
        userRole,
        eventType: 'logout',
        ipAddress,
        timestamp,
      }).catch(err => console.error('Failed to notify super admins:', err));
    }

    const response = NextResponse.json({
      success: true,
      message: 'Logout successful',
    });

    // Clear auth cookie
    response.cookies.set('auth_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    
    const response = NextResponse.json({
      success: true,
      message: 'Logout successful',
    });

    // Still clear cookie even on error
    response.cookies.set('auth_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    return response;
  }
}
