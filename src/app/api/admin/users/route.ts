/**
 * ADMIN USERS API
 * 
 * Super Admin only endpoints for user management.
 * GET: List all users
 * POST: Create new user
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { createServiceClient } from '@/lib/supabase/server';

const JWT_SECRET = new TextEncoder().encode(
  process.env.SUPABASE_JWT_SECRET || 'your-secret-key-at-least-32-chars'
);

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
    const { payload } = await jwtVerify(token, JWT_SECRET);
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

// GET /api/admin/users - List all users
export async function GET(request: NextRequest) {
  try {
    const { isSuperAdmin, userId } = await verifySuperAdmin(request);

    if (!isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: 'Super Admin access required' },
        { status: 403 }
      );
    }

    const supabase = await createServiceClient();
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');
    const role = searchParams.get('role');
    const isActive = searchParams.get('is_active');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let dbQuery = supabase
      .from('users')
      .select(`
        id, email, full_name, role, phone, avatar_url, is_active,
        last_login, created_at, date_joined, must_change_password
      `, { count: 'exact' });

    // Apply filters
    if (query && query.length >= 2) {
      dbQuery = dbQuery.or(
        `email.ilike.%${query}%,full_name.ilike.%${query}%`
      );
    }

    if (role) {
      dbQuery = dbQuery.eq('role', role);
    }

    if (isActive !== null) {
      dbQuery = dbQuery.eq('is_active', isActive === 'true');
    }

    const { data: users, count, error } = await dbQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching users:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch users' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: users || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('Users list error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// POST /api/admin/users - Create new user
export async function POST(request: NextRequest) {
  try {
    const { isSuperAdmin, userId: adminId, ipAddress } = await verifySuperAdmin(request);

    if (!isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: 'Super Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, password, full_name, phone, role } = body;

    // Validate required fields
    if (!email || !password || !full_name) {
      return NextResponse.json(
        { success: false, error: 'Email, password, and full name are required' },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ['admin', 'staff', 'viewer'];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Invalid role. Must be admin, staff, or viewer' },
        { status: 400 }
      );
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { success: false, error: passwordValidation.error },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // Create user
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        id: uuidv4(),
        email: email.toLowerCase().trim(),
        password_hash,
        full_name: full_name.trim(),
        phone: phone?.trim() || null,
        role: role || 'staff',
        is_active: true,
        date_joined: new Date().toISOString(),
      })
      .select(`
        id, email, full_name, role, phone, avatar_url, is_active,
        created_at, date_joined
      `)
      .single();

    if (error) {
      console.error('Error creating user:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to create user' },
        { status: 500 }
      );
    }

    // Create default notification preferences
    await supabase.from('notification_preferences').insert({
      id: uuidv4(),
      user_id: newUser.id,
      notify_on_login: true,
      notify_on_logout: true,
      notify_on_password_change: true,
      notify_on_profile_update: true,
      email_notifications: true,
      in_app_notifications: true,
    });

    // Log in user management audit
    await supabase.from('user_management_audit').insert({
      id: uuidv4(),
      admin_user_id: adminId!,
      target_user_id: newUser.id,
      action: 'user_created',
      new_values: {
        email: newUser.email,
        full_name: newUser.full_name,
        role: newUser.role,
      },
      ip_address: ipAddress,
    });

    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      data: newUser,
    }, { status: 201 });
  } catch (error) {
    console.error('User creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create user' },
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
