/**
 * BOOTSTRAP API - Super Admin Bootstrap Management
 * 
 * This API provides endpoints for:
 * - GET: Get bootstrap status
 * - POST: Trigger bootstrap manually (super_admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { superAdminBootstrapService, getOrCreateInitialization } from '@/lib/services';

const JWT_SECRET = new TextEncoder().encode(
  process.env.SUPABASE_JWT_SECRET || 'your-secret-key-at-least-32-chars'
);

/**
 * Extract authenticated user from request
 */
async function getAuthUser(request: NextRequest): Promise<{
  user_id: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
} | null> {
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
 * GET /api/bootstrap - Get bootstrap status
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    
    // Anyone authenticated can check bootstrap status
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const status = await superAdminBootstrapService.getBootstrapStatus();

    // Get recent bootstrap logs
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = await createServiceClient();
    
    const { data: recentLogs } = await supabase
      .from('bootstrap_logs')
      .select('*')
      .eq('operation_type', 'super_admin_bootstrap')
      .order('created_at', { ascending: false })
      .limit(5);

    return NextResponse.json({
      success: true,
      data: {
        ...status,
        environment: process.env.NODE_ENV || 'development',
        required_env_vars: {
          SUPER_ADMIN_EMAIL: !!process.env.SUPER_ADMIN_EMAIL,
          SUPER_ADMIN_PASSWORD: !!process.env.SUPER_ADMIN_PASSWORD,
          SUPER_ADMIN_NAME: !!process.env.SUPER_ADMIN_NAME,
        },
        recent_logs: recentLogs || [],
      },
    });
  } catch (error) {
    console.error('Bootstrap status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get bootstrap status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bootstrap - Trigger bootstrap manually (Super Admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    
    // Only super admin can trigger bootstrap manually
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (!authUser.isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: 'Super Admin access required' },
        { status: 403 }
      );
    }

    const result = await superAdminBootstrapService.bootstrap();

    return NextResponse.json({
      success: result.success,
      data: {
        action: result.action,
        message: result.message,
        userId: result.userId,
        timestamp: result.timestamp,
        details: result.details,
      },
    });
  } catch (error) {
    console.error('Bootstrap trigger error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to trigger bootstrap' },
      { status: 500 }
    );
  }
}
