/**
 * SESSION API
 * 
 * Returns the current authenticated user's information based on the auth_token cookie.
 * This endpoint is used by the frontend to determine the current user's role and permissions.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { jwtVerify } from 'jose';
import { createServiceClient } from '@/lib/supabase/server';

import { getJwtSecret } from '@/lib/auth/jwt-secret';

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
      const { payload } = await jwtVerify(token, getJwtSecret());
      
      // Get full user profile from database
      const supabase = await createServiceClient();
      const userId = payload.user_id as string;
      
      // Select the full profile shape. The profile page, the dashboard
      // sidebar avatar, and AuthContext all hydrate from THIS endpoint — a
      // minimal column list here silently drops avatar_url / address /
      // emergency contact on every page load and after every refreshSession
      // (e.g. right after uploading a profile photo), which is why the photo
      // + saved personal info appeared "set but not displayed".
      const { data: user, error: userError } = await supabase
        .from('users')
        .select(`
          id, email, full_name, role, phone, avatar_url, address,
          emergency_contact_name, emergency_contact_phone, is_active,
          last_login, created_at, must_change_password
        `)
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
            avatar_url: user.avatar_url,
            address: user.address,
            emergency_contact_name: user.emergency_contact_name,
            emergency_contact_phone: user.emergency_contact_phone,
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
