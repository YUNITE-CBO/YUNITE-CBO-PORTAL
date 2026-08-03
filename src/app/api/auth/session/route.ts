/**
 * SESSION API
 * 
 * Returns the current authenticated user's information based on the auth_token cookie.
 * This endpoint is used by the frontend to determine the current user's role and permissions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.SUPABASE_JWT_SECRET || 'your-secret-key-at-least-32-chars'
);

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      
      return NextResponse.json({
        success: true,
        data: {
          user: {
            id: payload.user_id,
            email: payload.email,
            role: payload.role,
          },
          isSuperAdmin: payload.role === 'super_admin',
        },
      });
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get session' },
      { status: 500 }
    );
  }
}
