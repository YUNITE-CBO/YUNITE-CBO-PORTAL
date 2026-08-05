/**
 * TOKEN API
 * 
 * Returns the current JWT token for authenticated requests.
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
      await jwtVerify(token, JWT_SECRET);
      
      return NextResponse.json({
        success: true,
        token,
      });
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Token error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get token' },
      { status: 500 }
    );
  }
}
