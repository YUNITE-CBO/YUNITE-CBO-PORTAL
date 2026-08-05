import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/users - Search users
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');
    const limit = parseInt(searchParams.get('limit') || '20');

    const supabase = await createServiceClient();

    let dbQuery = supabase
      .from('users')
      .select('id, email, full_name, role, phone, is_active', { count: 'exact' });

    // Filter only active users
    dbQuery = dbQuery.eq('is_active', true);

    // Apply search filter if provided
    if (query && query.length >= 2) {
      dbQuery = dbQuery.or(
        `email.ilike.%${query}%,full_name.ilike.%${query}%`
      );
    }

    const { data: users, count, error } = await dbQuery
      .order('full_name', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Error searching users:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to search users' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: users || [],
      count: count || 0,
    });
  } catch (error) {
    console.error('User search error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to search users' },
      { status: 500 }
    );
  }
}

// POST /api/users - Create new user (admin only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, full_name, phone, role } = body;

    if (!email || !password || !full_name) {
      return NextResponse.json(
        { success: false, error: 'Email, password, and full name are required' },
        { status: 400 }
      );
    }

    const bcrypt = await import('bcryptjs');
    const password_hash = await bcrypt.hash(password, 10);

    const supabase = await createServiceClient();

    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        password_hash,
        full_name,
        phone: phone || null,
        role: role || 'staff',
        is_active: true,
      })
      .select('id, email, full_name, role, phone, is_active, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'User with this email already exists' },
          { status: 409 }
        );
      }
      console.error('Error creating user:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to create user' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      data: user,
    }, { status: 201 });
  } catch (error) {
    console.error('User creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
