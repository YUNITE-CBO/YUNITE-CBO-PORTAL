/**
 * ADMIN LOGIN ACTIVITY API
 * 
 * Super Admin only endpoint for viewing login activity across all users.
 * Uses centralized authorization framework.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/admin/login-activity - Get login activity
export async function GET(request: NextRequest) {
  try {
    // Use centralized authorization
    const authResult = await requireSuperAdmin(request);
    if (!authResult.success) {
      return authResult.status === 401 
        ? unauthorizedResponse(authResult.error)
        : forbiddenResponse(authResult.error);
    }

    const supabase = await createServiceClient();
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('user_id');
    const eventType = searchParams.get('event_type');
    const success = searchParams.get('success');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let dbQuery = supabase
      .from('login_activity')
      .select(`
        id, user_id, email, event_type, ip_address, user_agent,
        device_info, success, failure_reason, created_at
      `, { count: 'exact' });

    // Apply filters
    if (userId) {
      dbQuery = dbQuery.eq('user_id', userId);
    }

    if (eventType) {
      dbQuery = dbQuery.eq('event_type', eventType);
    }

    if (success !== null) {
      dbQuery = dbQuery.eq('success', success === 'true');
    }

    const { data: activities, count, error } = await dbQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching login activity:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch login activity' },
        { status: 500 }
      );
    }

    // Get user names for the activities
    const userIds = Array.from(new Set(activities?.map(a => a.user_id).filter(Boolean) || []));
    let userMap: Record<string, { full_name: string; email: string }> = {};

    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', userIds);
      
      userMap = (users || []).reduce((acc, user) => {
        acc[user.id] = { full_name: user.full_name, email: user.email };
        return acc;
      }, {} as Record<string, { full_name: string; email: string }>);
    }

    // Enrich activities with user info
    const enrichedActivities = (activities || []).map(activity => ({
      ...activity,
      user_name: activity.user_id ? userMap[activity.user_id]?.full_name || 'Unknown' : activity.email || 'Unknown',
      user_email: activity.user_id ? userMap[activity.user_id]?.email || activity.email : activity.email,
    }));

    return NextResponse.json({
      success: true,
      data: enrichedActivities,
      pagination: {
        total: count || 0,
        limit,
        offset,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('Login activity error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch login activity' },
      { status: 500 }
    );
  }
}
