/**
 * PROFILE API
 * 
 * GET: Get current user profile
 * PUT: Update current user profile (non-sensitive fields)
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { jwtVerify } from 'jose';
import { createServiceClient } from '@/lib/supabase/server';

import { getJwtSecret } from '@/lib/auth/jwt-secret';

// GET /api/auth/profile - Get current user profile
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    let userId: string;
    try {
      const { payload } = await jwtVerify(token, getJwtSecret());
      userId = payload.user_id as string;
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }

    const supabase = await createServiceClient();
    
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        id, email, full_name, role, phone, avatar_url, address,
        emergency_contact_name, emergency_contact_phone, date_joined,
        last_login, is_active, must_change_password, created_at
      `)
      .eq('id', userId)
      .single();

    if (error || !user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        isSuperAdmin: user.role === 'super_admin',
        isAdmin: ['super_admin', 'admin'].includes(user.role),
      },
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

// PUT /api/auth/profile - Update current user profile
export async function PUT(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    let userId: string;
    try {
      const { payload } = await jwtVerify(token, getJwtSecret());
      userId = payload.user_id as string;
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { full_name, phone, address, emergency_contact_name, emergency_contact_phone, avatar_url } = body;

    // Validate inputs
    if (full_name !== undefined) {
      if (typeof full_name !== 'string' || full_name.trim().length < 2) {
        return NextResponse.json(
          { success: false, error: 'Full name must be at least 2 characters' },
          { status: 400 }
        );
      }
    }

    if (phone !== undefined && phone !== null && phone !== '') {
      if (!/^[\d\s\-+()]{7,20}$/.test(phone)) {
        return NextResponse.json(
          { success: false, error: 'Invalid phone number format' },
          { status: 400 }
        );
      }
    }

    // Build update object (only allowed fields)
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (full_name !== undefined) updates.full_name = full_name.trim();
    if (phone !== undefined) updates.phone = phone || null;
    if (address !== undefined) updates.address = address || null;
    if (emergency_contact_name !== undefined) updates.emergency_contact_name = emergency_contact_name || null;
    if (emergency_contact_phone !== undefined) updates.emergency_contact_phone = emergency_contact_phone || null;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url || null;

    const supabase = await createServiceClient();

    // Get current user data for audit log
    const { data: currentUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    // Update profile
    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select(`
        id, email, full_name, role, phone, avatar_url, address,
        emergency_contact_name, emergency_contact_phone, date_joined,
        last_login, is_active, must_change_password, created_at
      `)
      .single();

    if (error) {
      console.error('Profile update error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    // Log profile update in audit_logs
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'users.update_profile',
      table_name: 'users',
      record_id: userId,
      old_values: {
        full_name: currentUser?.full_name,
        phone: currentUser?.phone,
        address: currentUser?.address,
      },
      new_values: {
        full_name: updatedUser.full_name,
        phone: updatedUser.phone,
        address: updatedUser.address,
      },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
