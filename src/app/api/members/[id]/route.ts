import { NextRequest, NextResponse } from 'next/server';
import { memberService } from '@/lib/services';
import { createClient } from '@/lib/supabase/server';

// GET /api/members/[id] - Get member profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await memberService.getProfile(id);

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Member not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error('Error fetching member profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch member profile' },
      { status: 500 }
    );
  }
}

// PATCH /api/members/[id] - Update member
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const supabase = await createClient();
    const { data: member, error } = await supabase
      .from('members')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'Member updated successfully',
      data: member,
    });
  } catch (error) {
    console.error('Error updating member:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update member' },
      { status: 500 }
    );
  }
}
