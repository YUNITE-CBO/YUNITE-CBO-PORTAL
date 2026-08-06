/**
 * CENTRALIZED AUTHORIZATION FRAMEWORK
 * 
 * This module provides a unified authorization system for the YUNITE Enterprise OS.
 * All permission checks should go through this framework to ensure consistency.
 * 
 * Roles (hierarchical):
 * - super_admin: Full system access, cannot be modified, bypasses all permission checks
 * - admin: Administrative access, can manage members and view reports
 * - staff: Standard operational access
 * - viewer: Read-only access
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { createServiceClient } from '@/lib/supabase/server';

const JWT_SECRET = new TextEncoder().encode(
  process.env.SUPABASE_JWT_SECRET || 'your-secret-key-at-least-32-chars'
);

// Role hierarchy (higher number = more privileges)
const ROLE_HIERARCHY: Record<string, number> = {
  'super_admin': 100,
  'admin': 75,
  'staff': 50,
  'viewer': 25,
};

// Permissions by module and action
const PERMISSIONS: Record<string, Record<string, string[]>> = {
  // Admin module - requires super_admin
  admin: {
    user_management: ['super_admin'],
    login_activity: ['super_admin'],
    database_reset: ['super_admin'],
    system_settings: ['super_admin', 'admin'],
  },
  // Members module
  members: {
    create: ['super_admin', 'admin', 'staff'],
    read: ['super_admin', 'admin', 'staff', 'viewer'],
    update: ['super_admin', 'admin', 'staff'],
    delete: ['super_admin', 'admin'],
    lookup: ['super_admin', 'admin', 'staff', 'viewer'],
  },
  // Transactions module
  transactions: {
    create: ['super_admin', 'admin', 'staff'],
    read: ['super_admin', 'admin', 'staff', 'viewer'],
    update: ['super_admin', 'admin'],
    delete: ['super_admin', 'admin'], // Deletion = reversal
    reverse: ['super_admin', 'admin'],
  },
  // Loans module
  loans: {
    apply: ['super_admin', 'admin', 'staff', 'viewer'],
    approve: ['super_admin', 'admin'],
    reject: ['super_admin', 'admin'],
    disburse: ['super_admin', 'admin'],
    repay: ['super_admin', 'admin', 'staff'],
    read: ['super_admin', 'admin', 'staff', 'viewer'],
  },
  // Fines module
  fines: {
    create: ['super_admin', 'admin', 'staff'],
    read: ['super_admin', 'admin', 'staff', 'viewer'],
    update: ['super_admin', 'admin'],
    pay: ['super_admin', 'admin', 'staff'],
    delete: ['super_admin', 'admin'],
  },
  // Documents module
  documents: {
    upload: ['super_admin', 'admin', 'staff'],
    read: ['super_admin', 'admin', 'staff', 'viewer'],
    update: ['super_admin', 'admin'],
    delete: ['super_admin', 'admin'],
    verify: ['super_admin', 'admin'],
    download: ['super_admin', 'admin', 'staff', 'viewer'],
  },
  // Notifications module
  notifications: {
    create: ['super_admin', 'admin', 'staff'],
    read: ['super_admin', 'admin', 'staff', 'viewer'],
    update: ['super_admin', 'admin', 'staff'], // Mark as read
    delete: ['super_admin', 'admin'],
    send_email: ['super_admin', 'admin'],
  },
  // Settings module
  settings: {
    read: ['super_admin', 'admin', 'staff', 'viewer'],
    update: ['super_admin', 'admin'],
  },
  // Audit logs
  audit: {
    read: ['super_admin', 'admin'],
  },
  // Reports
  reports: {
    read: ['super_admin', 'admin', 'staff', 'viewer'],
    generate: ['super_admin', 'admin', 'staff'],
  },
  // Contributions
  contributions: {
    create: ['super_admin', 'admin', 'staff'],
    read: ['super_admin', 'admin', 'staff', 'viewer'],
    update: ['super_admin', 'admin', 'staff'],
    delete: ['super_admin', 'admin'],
  },
  // Welfare
  welfare: {
    create: ['super_admin', 'admin', 'staff'],
    read: ['super_admin', 'admin', 'staff', 'viewer'],
    update: ['super_admin', 'admin', 'staff'],
    delete: ['super_admin', 'admin'],
    approve_claim: ['super_admin', 'admin'],
  },
};

export interface AuthenticatedUser {
  user_id: string;
  email: string;
  role: string;
  session_id?: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
}

export interface AuthResult {
  success: boolean;
  user?: AuthenticatedUser;
  error?: string;
  status?: number;
}

/**
 * Get authenticated user from request
 */
export async function getAuthUser(request: NextRequest): Promise<AuthResult> {
  const token = request.cookies.get('auth_token')?.value;
  
  if (!token) {
    return { success: false, error: 'Authentication required', status: 401 };
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    
    const user: AuthenticatedUser = {
      user_id: payload.user_id as string,
      email: payload.email as string,
      role: payload.role as string,
      session_id: payload.session_id as string | undefined,
      isSuperAdmin: payload.role === 'super_admin',
      isAdmin: ['super_admin', 'admin'].includes(payload.role as string),
    };

    return { success: true, user };
  } catch {
    return { success: false, error: 'Invalid or expired token', status: 401 };
  }
}

/**
 * Require authentication - returns 401 if not authenticated
 */
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  const result = await getAuthUser(request);
  
  if (!result.success) {
    return result;
  }
  
  return result;
}

/**
 * Check if user has permission for a specific action
 * Super Admin always has permission (unless explicitly denied)
 */
export function hasPermission(role: string, module: string, action: string): boolean {
  // Super admin has all permissions
  if (role === 'super_admin') {
    return true;
  }

  const modulePermissions = PERMISSIONS[module];
  if (!modulePermissions) {
    // Unknown module - default to no access unless super_admin
    return false;
  }

  const actionPermissions = modulePermissions[action];
  if (!actionPermissions) {
    // Unknown action - default to no access unless super_admin
    return false;
  }

  return actionPermissions.includes(role);
}

/**
 * Require specific permission - returns 403 if not authorized
 */
export async function requirePermission(
  request: NextRequest,
  module: string,
  action: string
): Promise<AuthResult> {
  const authResult = await getAuthUser(request);
  
  if (!authResult.success) {
    return authResult;
  }

  const { user } = authResult;
  
  if (!user) {
    return { success: false, error: 'Authentication required', status: 401 };
  }

  if (hasPermission(user.role, module, action)) {
    return { success: true, user };
  }

  return {
    success: false,
    error: `Insufficient permissions for ${module}.${action}`,
    status: 403,
  };
}

/**
 * Require specific role or higher
 */
export async function requireRole(
  request: NextRequest,
  requiredRole: string
): Promise<AuthResult> {
  const authResult = await getAuthUser(request);
  
  if (!authResult.success) {
    return authResult;
  }

  const { user } = authResult;
  
  if (!user) {
    return { success: false, error: 'Authentication required', status: 401 };
  }

  const userLevel = ROLE_HIERARCHY[user.role] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;

  if (userLevel >= requiredLevel) {
    return { success: true, user };
  }

  return {
    success: false,
    error: `Requires ${requiredRole} role or higher`,
    status: 403,
  };
}

/**
 * Require super admin role
 */
export async function requireSuperAdmin(request: NextRequest): Promise<AuthResult> {
  return requireRole(request, 'super_admin');
}

/**
 * Require admin role or higher
 */
export async function requireAdmin(request: NextRequest): Promise<AuthResult> {
  return requireRole(request, 'admin');
}

/**
 * Create authorization response helper
 */
export function unauthorizedResponse(message: string = 'Authentication required') {
  return NextResponse.json(
    { success: false, error: message },
    { status: 401 }
  );
}

export function forbiddenResponse(message: string = 'Access denied') {
  return NextResponse.json(
    { success: false, error: message },
    { status: 403 }
  );
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: string): string {
  const names: Record<string, string> = {
    super_admin: 'Super Administrator',
    admin: 'Administrator',
    staff: 'Staff Member',
    viewer: 'Viewer',
  };
  return names[role] || role;
}

/**
 * Check if role is valid
 */
export function isValidRole(role: string): boolean {
  return Object.keys(ROLE_HIERARCHY).includes(role);
}

/**
 * Get role hierarchy level
 */
export function getRoleLevel(role: string): number {
  return ROLE_HIERARCHY[role] || 0;
}
