/**
 * USERS API - Enterprise User Management
 * 
 * This API provides comprehensive user management capabilities:
 * - User search and listing
 * - User creation (admin only)
 * - Department listing
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { jwtVerify } from 'jose';
import { userManagementService, type UserRole, type UserQueryOptions } from '@/lib/services';

import { getJwtSecret } from '@/lib/auth/jwt-secret';

interface AuthUser {
  user_id: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
}

/**
 * Extract authenticated user from request
 */
async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  const token = request.cookies.get('auth_token')?.value;
  
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
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
 * GET /api/users - List users with filtering
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only admins can list all users
    if (!['super_admin', 'admin'].includes(authUser.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    
    const options: UserQueryOptions = {
      query: searchParams.get('query') || undefined,
      role: (searchParams.get('role') as UserRole) || undefined,
      isActive: searchParams.get('is_active') === 'true' ? true : 
                searchParams.get('is_active') === 'false' ? false : undefined,
      department: searchParams.get('department') || undefined,
      limit: parseInt(searchParams.get('limit') || '20'),
      offset: parseInt(searchParams.get('offset') || '0'),
      sortBy: (searchParams.get('sort_by') as UserQueryOptions['sortBy']) || 'created_at',
      sortOrder: (searchParams.get('sort_order') as 'asc' | 'desc') || 'desc',
    };

    const result = await userManagementService.listUsers(options);

    return NextResponse.json({
      success: true,
      data: result.users,
      pagination: result.pagination,
      total: result.total,
    });
  } catch (error) {
    console.error('Users list error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list users' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users - Create new user
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only admins can create users
    if (!['super_admin', 'admin'].includes(authUser.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { 
      email, 
      password, 
      full_name, 
      phone, 
      role,
      department,
      job_title,
      employee_id,
      send_welcome_email 
    } = body;

    // Validate required fields
    if (!email || !password || !full_name) {
      return NextResponse.json(
        { success: false, error: 'Email, password, and full name are required' },
        { status: 400 }
      );
    }

    // Regular admins cannot create other admins or super_admins
    if (authUser.role === 'admin' && role === 'admin') {
      return NextResponse.json(
        { success: false, error: 'Only Super Admin can create admin accounts' },
        { status: 403 }
      );
    }

    const result = await userManagementService.createUser(
      authUser.user_id,
      {
        email,
        password,
        fullName: full_name,
        phone,
        role: role || 'staff',
        department,
        jobTitle: job_title,
        employeeId: employee_id,
        sendWelcomeEmail: send_welcome_email !== false,
      },
      {
        ipAddress: getIpAddress(request),
        userAgent: request.headers.get('user-agent') || undefined,
        reason: body.reason,
      }
    );

    if (!result.success) {
      const statusCode = result.errorCode === 'EMAIL_EXISTS' ? 409 : 
                        result.errorCode === 'INVALID_EMAIL' ? 400 :
                        result.errorCode === 'WEAK_PASSWORD' ? 400 :
                        result.errorCode === 'INVALID_ROLE' ? 400 : 500;
      
      return NextResponse.json(
        { success: false, error: result.message, errorCode: result.errorCode },
        { status: statusCode }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        data: result.data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('User creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
