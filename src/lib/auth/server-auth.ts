/**
 * SERVER-SIDE AUTH UTILITIES
 * 
 * Helper functions for API routes to get authenticated user information.
 * This ensures consistent user tracking across all API routes.
 */

import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

import { getJwtSecret } from '@/lib/auth/jwt-secret';

export interface AuthenticatedUser {
  user_id: string;
  email: string;
  role: string;
  session_id?: string;
}

/**
 * Get authenticated user from request cookies
 * Returns null if not authenticated
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUser | null> {
  try {
    const token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      return null;
    }

    const { payload } = await jwtVerify(token, getJwtSecret());
    
    return {
      user_id: payload.user_id as string,
      email: payload.email as string,
      role: payload.role as string,
      session_id: payload.session_id as string | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Get authenticated user or throw an error
 */
export async function requireAuth(request: NextRequest): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser(request);
  
  if (!user) {
    throw new Error('Authentication required');
  }
  
  return user;
}

/**
 * Check if authenticated user has required role
 */
export async function hasRole(request: NextRequest, requiredRole: string): Promise<boolean> {
  const user = await getAuthenticatedUser(request);
  
  if (!user) {
    return false;
  }

  const roleHierarchy: Record<string, number> = {
    'super_admin': 4,
    'admin': 3,
    'staff': 2,
    'viewer': 1,
  };

  const userLevel = roleHierarchy[user.role] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;

  return userLevel >= requiredLevel;
}

/**
 * Check if user is Super Admin
 */
export function isSuperAdmin(role: string): boolean {
  return role === 'super_admin';
}

/**
 * Check if user is Admin or higher
 */
export function isAdmin(role: string): boolean {
  return role === 'super_admin' || role === 'admin';
}

/**
 * Get client IP address from request
 */
export function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

/**
 * Get user agent from request
 */
export function getUserAgent(request: NextRequest): string {
  return request.headers.get('user-agent') || 'unknown';
}
