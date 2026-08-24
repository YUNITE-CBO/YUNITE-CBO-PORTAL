/**
 * USER ACTIONS API - Administrative Actions on Users
 * 
 * This API handles administrative actions on users:
 * - POST /api/users/[id]/actions?suspend - Suspend user
 * - POST /api/users/[id]/actions?reactivate - Reactivate user
 * - POST /api/users/[id]/actions?reset-password - Reset user password
 * - GET /api/users/[id]/actions?audit-history - Get user audit history
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { userManagementService } from '@/lib/services';
export const dynamic = 'force-dynamic';

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
 * POST /api/users/[id]/actions - Perform administrative action
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authUser = await getAuthUser(request);
    
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only admins can perform administrative actions
    if (!['super_admin', 'admin'].includes(authUser.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { searchParams } = request.nextUrl;
    const action = searchParams.get('action');

    const body = await request.json();
    const options = {
      ipAddress: getIpAddress(request),
      userAgent: request.headers.get('user-agent') || undefined,
    };

    let result;

    switch (action) {
      case 'suspend':
        // Validate reason
        if (!body.reason) {
          return NextResponse.json(
            { success: false, error: 'Suspension reason is required' },
            { status: 400 }
          );
        }

        result = await userManagementService.suspendUser(
          authUser.user_id,
          id,
          body.reason,
          body.expires_at ? new Date(body.expires_at) : undefined,
          options
        );
        break;

      case 'reactivate':
        result = await userManagementService.reactivateUser(
          authUser.user_id,
          id,
          options
        );
        break;

      case 'reset-password':
        // Validate new password
        if (!body.new_password) {
          return NextResponse.json(
            { success: false, error: 'New password is required' },
            { status: 400 }
          );
        }

        result = await userManagementService.resetPassword(
          authUser.user_id,
          id,
          body.new_password,
          {
            ...options,
            forceChangeOnLogin: body.force_change_on_login ?? true,
          }
        );
        break;

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action. Valid actions: suspend, reactivate, reset-password' },
          { status: 400 }
        );
    }

    if (!result.success) {
      const statusCode = result.errorCode === 'USER_NOT_FOUND' ? 404 :
                        result.errorCode === 'SUPER_ADMIN_PROTECTED' ? 403 :
                        result.errorCode === 'PROTECTED_ACCOUNT' ? 403 :
                        result.errorCode === 'SELF_SUSPENSION' ? 400 :
                        result.errorCode === 'SELF_DEACTIVATION' ? 400 :
                        result.errorCode === 'WEAK_PASSWORD' ? 400 :
                        result.errorCode === 'PASSWORD_REUSED' ? 400 : 400;
      
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
    console.error('User action error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to perform action' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/users/[id]/actions - Get audit history
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

    // Only admins can view audit history
    if (!['super_admin', 'admin'].includes(authUser.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { searchParams } = request.nextUrl;
    const action = searchParams.get('action');

    if (action !== 'audit-history') {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Valid actions: audit-history' },
        { status: 400 }
      );
    }

    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const result = await userManagementService.getUserAuditHistory(id, { limit, offset });

    return NextResponse.json({
      success: true,
      data: result.audits,
      total: result.total,
      pagination: {
        limit,
        offset,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    console.error('Get audit history error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get audit history' },
      { status: 500 }
    );
  }
}
