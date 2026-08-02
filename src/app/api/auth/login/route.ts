import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/services/auth.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const result = await authService.login(email, password);

    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          full_name: result.user.full_name,
          role: result.user.role,
        },
      },
    });

    // Set auth cookie
    response.cookies.set('auth_token', result.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    });

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Login failed';
    console.error('Login error:', error);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 401 }
    );
  }
}
