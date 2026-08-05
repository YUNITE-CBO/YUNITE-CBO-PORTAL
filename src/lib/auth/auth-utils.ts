/**
 * AUTH UTILITIES
 * 
 * Centralized authentication utilities for JWT verification and token management.
 * This module provides a single source of truth for authentication logic.
 */

import { jwtVerify, JWTPayload } from 'jose';
import { NextRequest } from 'next/server';

const JWT_SECRET = new TextEncoder().encode(
  process.env.SUPABASE_JWT_SECRET || 'your-secret-key-at-least-32-chars'
);

export interface TokenPayload extends JWTPayload {
  user_id: string;
  email: string;
  role: string;
  session_id?: string;
}

export interface AuthResult {
  valid: boolean;
  payload?: TokenPayload;
  error?: string;
}

/**
 * Verify JWT token and return payload
 */
export async function verifyToken(token: string): Promise<AuthResult> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      valid: true,
      payload: payload as TokenPayload,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid token',
    };
  }
}

/**
 * Extract and verify token from request cookies
 */
export async function verifyRequestAuth(request: NextRequest): Promise<AuthResult> {
  const token = request.cookies.get('auth_token')?.value;
  
  if (!token) {
    return {
      valid: false,
      error: 'No authentication token found',
    };
  }

  return verifyToken(token);
}

/**
 * Check if user has required role
 */
export function hasRole(userRole: string, requiredRole: string): boolean {
  const roleHierarchy: Record<string, number> = {
    'super_admin': 4,
    'admin': 3,
    'staff': 2,
    'viewer': 1,
  };

  const userLevel = roleHierarchy[userRole] || 0;
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
 * Format role for display
 */
export function formatRole(role: string): string {
  const roleMap: Record<string, string> = {
    super_admin: 'Super Administrator',
    admin: 'Administrator',
    staff: 'Staff Member',
    viewer: 'Viewer',
  };
  return roleMap[role] || role;
}

/**
 * Get role badge color class
 */
export function getRoleBadgeColor(role: string): string {
  const colorMap: Record<string, string> = {
    super_admin: 'bg-red-100 text-red-800',
    admin: 'bg-purple-100 text-purple-800',
    staff: 'bg-blue-100 text-blue-800',
    viewer: 'bg-gray-100 text-gray-800',
  };
  return colorMap[role] || 'bg-gray-100 text-gray-800';
}

/**
 * Get IP address from request
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
