/**
 * SESSION API
 * 
 * Returns the current authenticated user's information based on the auth_token cookie.
 * This endpoint is used by the frontend to determine the current user's role and permissions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { createServiceClient } from '@/lib/supabase/server';

const JWT_SECRET = new TextEncoder().encode(
  process.env.SUPABASE_JWT_SECRET || 'your-secret-key-at-least-32-chars'
);

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      
      // Get full user profile from database
      const supabase = await createServiceClient();
      const userId = payload.user_id as string;
      
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, full_name, role, phone, is_active, last_login, created_at, must_change_password')
        .eq('id', userId)
        .single();

      if (!user) {
        return NextResponse.json(
          { success: false, error: 'User not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            phone: user.phone,
            is_active: user.is_active,
            must_change_password: user.must_change_password || false,
          },
          isSuperAdmin: user.role === 'super_admin',
          isAdmin: ['super_admin', 'admin'].includes(user.role),
        },
      });
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get session' },
      { status: 500 }
    );
  }
}
