/**
 * USER API - Individual User Operations
 * 
 * This API handles operations on individual users:
 * - GET: Get user details
 * - PUT: Update user
 * - DELETE: Deactivate user
 * - Additional actions: suspend, reactivate, reset-password
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { jwtVerify } from 'jose';
import { userManagementService, type UserRole, type UpdateUserData } from '@/lib/services';

const JWT_SECRET = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);

interface AuthUser {
  user_id: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Extract authenticated user from request
 */
async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  const token = request.cookies.get('auth_token')?.value;
  
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      user_id: payload.user_id as string,
      email: payload.email as string,
      role: payload.role as string,
      isSuperAdmin: payload.role === 'super_admin',
    };
  } catch {
    return null;
  }
}

/**
 * Get IP address from request
 */
function getIpAddress(request: NextRequest): string | undefined {
  return request.headers.get('x-forwarded-for')?.split(',')[0] || 
         request.headers.get('x-real-ip') || undefined;
}

/**
 * GET /api/users/[id] - Get user details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authUser = await getAuthUser(request);
    
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only admins can view user details
    if (!['super_admin', 'admin'].includes(authUser.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const user = await userManagementService.getUserById(id);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get user' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/[id] - Update user
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const authUser = await getAuthUser(request);
    
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only admins can update users
    if (!['super_admin', 'admin'].includes(authUser.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    
    const updateData: UpdateUserData = {};
    
    if (body.full_name !== undefined) updateData.fullName = body.full_name;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.role !== undefined) updateData.role = body.role as UserRole;
    if (body.department !== undefined) updateData.department = body.department;
    if (body.job_title !== undefined) updateData.jobTitle = body.job_title;
    if (body.employee_id !== undefined) updateData.employeeId = body.employee_id;
    if (body.admin_notes !== undefined) updateData.adminNotes = body.admin_notes;

    // Regular admins cannot promote users to admin
    if (authUser.role === 'admin' && body.role === 'admin') {
      return NextResponse.json(
        { success: false, error: 'Only Super Admin can assign admin role' },
        { status: 403 }
      );
    }

    const result = await userManagementService.updateUser(
      authUser.user_id,
      id,
      updateData,
      {
        ipAddress: getIpAddress(request),
        userAgent: request.headers.get('user-agent') || undefined,
        reason: body.reason,
      }
    );

    if (!result.success) {
      const statusCode = result.errorCode === 'USER_NOT_FOUND' ? 404 :
                        result.errorCode === 'EMAIL_EXISTS' ? 409 :
                        result.errorCode === 'SUPER_ADMIN_PROTECTED' ? 403 :
                        result.errorCode === 'PROTECTED_ACCOUNT' ? 403 : 400;
      
      return NextResponse.json(
        { success: false, error: result.message, errorCode: result.errorCode },
        { status: statusCode }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/[id] - Deactivate user
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authUser = await getAuthUser(request);
    
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only admins can deactivate users
    if (!['super_admin', 'admin'].includes(authUser.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const result = await userManagementService.deactivateUser(
      authUser.user_id,
      id,
      {
        ipAddress: getIpAddress(request),
        userAgent: request.headers.get('user-agent') || undefined,
        reason: body.reason,
      }
    );

    if (!result.success) {
      const statusCode = result.errorCode === 'USER_NOT_FOUND' ? 404 :
                        result.errorCode === 'SUPER_ADMIN_PROTECTED' ? 403 :
                        result.errorCode === 'PROTECTED_ACCOUNT' ? 403 :
                        result.errorCode === 'SELF_DEACTIVATION' ? 400 :
                        result.errorCode === 'LAST_ADMIN' ? 400 : 400;
      
      return NextResponse.json(
        { success: false, error: result.message, errorCode: result.errorCode },
        { status: statusCode }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('Deactivate user error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to deactivate user' },
      { status: 500 }
    );
  }
}
