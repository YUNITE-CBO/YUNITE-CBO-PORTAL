/**
 * ADMIN USER API
 * 
 * Super Admin only endpoints for managing individual users.
 * GET: Get user details
 * PUT: Update user
 * DELETE: Deactivate user
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { createServiceClient } from '@/lib/supabase/server';

import { getJwtSecret } from '@/lib/auth/jwt-secret';

// Helper to verify super admin
async function verifySuperAdmin(request: NextRequest): Promise<{
  isSuperAdmin: boolean;
  userId: string | null;
  ipAddress: string | null;
}> {
  const token = request.cookies.get('auth_token')?.value;
  
  if (!token) {
    return { isSuperAdmin: false, userId: null, ipAddress: null };
  }

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const isSuperAdmin = payload.role === 'super_admin';
    
    return {
      isSuperAdmin,
      userId: payload.user_id as string,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || 
                 request.headers.get('x-real-ip') || null,
    };
  } catch {
    return { isSuperAdmin: false, userId: null, ipAddress: null };
  }
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/admin/users/[id] - Get user details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { isSuperAdmin } = await verifySuperAdmin(request);

    if (!isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: 'Super Admin access required' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const supabase = await createServiceClient();

    const { data: user, error } = await supabase
      .from('users')
      .select(`
        id, email, full_name, role, phone, avatar_url, address,
        emergency_contact_name, emergency_contact_phone, is_active,
        last_login, created_at, date_joined, must_change_password,
        failed_login_attempts, locked_until, password_changed_at
      `)
      .eq('id', id)
      .single();

    if (error || !user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Get login activity
    const { data: recentActivity } = await supabase
      .from('login_activity')
      .select('id, event_type, ip_address, success, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Get active sessions count
    const { count: activeSessions } = await supabase
      .from('user_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', id)
      .eq('is_active', true);

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        recent_activity: recentActivity || [],
        active_sessions: activeSessions || 0,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get user' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/users/[id] - Update user
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { isSuperAdmin, userId: adminId, ipAddress } = await verifySuperAdmin(request);

    if (!isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: 'Super Admin access required' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { 
      full_name, phone, email, role, is_active, 
      password, address, emergency_contact_name, emergency_contact_phone 
    } = body;

    const supabase = await createServiceClient();

    // Get current user data
    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !currentUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Cannot modify super_admin role or email
    if (currentUser.role === 'super_admin' && (role || email)) {
      return NextResponse.json(
        { success: false, error: 'Cannot modify Super Admin role or email' },
        { status: 403 }
      );
    }

    // Cannot deactivate yourself
    if (currentUser.id === adminId && is_active === false) {
      return NextResponse.json(
        { success: false, error: 'Cannot deactivate your own account' },
        { status: 400 }
      );
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    const changedFields: Record<string, { old: unknown; new: unknown }> = {};

    if (full_name !== undefined && full_name !== currentUser.full_name) {
      updates.full_name = full_name.trim();
      changedFields.full_name = { old: currentUser.full_name, new: full_name };
    }

    if (phone !== undefined && phone !== currentUser.phone) {
      updates.phone = phone?.trim() || null;
      changedFields.phone = { old: currentUser.phone, new: phone };
    }

    if (email !== undefined && email !== currentUser.email) {
      // Check if new email already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email.toLowerCase())
        .neq('id', id)
        .single();

      if (existingUser) {
        return NextResponse.json(
          { success: false, error: 'Email already in use by another user' },
          { status: 409 }
        );
      }

      updates.email = email.toLowerCase().trim();
      changedFields.email = { old: currentUser.email, new: email };
    }

    if (role !== undefined && role !== currentUser.role) {
      const validRoles = ['admin', 'staff', 'viewer'];
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          { success: false, error: 'Invalid role' },
          { status: 400 }
        );
      }
      updates.role = role;
      changedFields.role = { old: currentUser.role, new: role };
    }

    if (is_active !== undefined && is_active !== currentUser.is_active) {
      updates.is_active = is_active;
      changedFields.is_active = { old: currentUser.is_active, new: is_active };
      
      if (!is_active) {
        updates.locked_until = null;
        updates.failed_login_attempts = 0;
      }
    }

    if (address !== undefined) {
      updates.address = address || null;
    }

    if (emergency_contact_name !== undefined) {
      updates.emergency_contact_name = emergency_contact_name || null;
    }

    if (emergency_contact_phone !== undefined) {
      updates.emergency_contact_phone = emergency_contact_phone || null;
    }

    // Handle password reset
    if (password) {
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.valid) {
        return NextResponse.json(
          { success: false, error: passwordValidation.error },
          { status: 400 }
        );
      }

      updates.password_hash = await bcrypt.hash(password, 12);
      updates.password_changed_at = new Date().toISOString();
      updates.must_change_password = true;
      changedFields.password = { old: '[HIDDEN]', new: '[RESET]' };
    }

    // Update user
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select(`
        id, email, full_name, role, phone, avatar_url, address,
        emergency_contact_name, emergency_contact_phone, is_active,
        last_login, created_at, date_joined, must_change_password
      `)
      .single();

    if (updateError) {
      console.error('Error updating user:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update user' },
        { status: 500 }
      );
    }

    // Log changes in audit
    if (Object.keys(changedFields).length > 0) {
      const action = changedFields.role || changedFields.is_active 
        ? 'user_updated' 
        : 'user_updated';

      await supabase.from('user_management_audit').insert({
        id: uuidv4(),
        admin_user_id: adminId!,
        target_user_id: id,
        action,
        old_values: changedFields,
        new_values: changedFields,
        ip_address: ipAddress,
      });

      // Terminate sessions if role or status changed
      if (changedFields.role || (changedFields.is_active && changedFields.is_active.old === true && changedFields.is_active.new === false)) {
        await supabase
          .from('user_sessions')
          .update({
            is_active: false,
            terminated_at: new Date().toISOString(),
            termination_reason: changedFields.role ? 'role_changed' : 'account_deactivated',
          })
          .eq('user_id', id)
          .eq('is_active', true);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    console.error('User update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users/[id] - Deactivate user
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { isSuperAdmin, userId: adminId, ipAddress } = await verifySuperAdmin(request);

    if (!isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: 'Super Admin access required' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const supabase = await createServiceClient();

    // Get current user
    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('id, email, full_name, role, is_active')
      .eq('id', id)
      .single();

    if (fetchError || !currentUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Cannot delete super admin
    if (currentUser.role === 'super_admin') {
      return NextResponse.json(
        { success: false, error: 'Cannot deactivate Super Admin account' },
        { status: 403 }
      );
    }

    // Cannot deactivate yourself
    if (currentUser.id === adminId) {
      return NextResponse.json(
        { success: false, error: 'Cannot deactivate your own account' },
        { status: 400 }
      );
    }

    // Deactivate user
    await supabase
      .from('users')
      .update({
        is_active: false,
        locked_until: null,
        failed_login_attempts: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Terminate all sessions
    await supabase
      .from('user_sessions')
      .update({
        is_active: false,
        terminated_at: new Date().toISOString(),
        termination_reason: 'account_deactivated',
      })
      .eq('user_id', id)
      .eq('is_active', true);

    // Log in audit
    await supabase.from('user_management_audit').insert({
      id: uuidv4(),
      admin_user_id: adminId!,
      target_user_id: id,
      action: 'status_changed',
      old_values: { is_active: true },
      new_values: { is_active: false },
      ip_address: ipAddress,
    });

    return NextResponse.json({
      success: true,
      message: 'User deactivated successfully',
    });
  } catch (error) {
    console.error('User deactivation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to deactivate user' },
      { status: 500 }
    );
  }
}

function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }

  return { valid: true };
}
