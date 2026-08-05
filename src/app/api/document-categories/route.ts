/**
 * Document Categories API
 * Phase 4: Configurable document categories for compliance requirements
 */

import { NextRequest, NextResponse } from 'next/server';
import { documentService } from '@/lib/services/document.service';
import { authService } from '@/lib/services/auth.service';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const module = searchParams.get('module');

    const categories = await documentService.getDocumentCategories(module || 'members');
    return NextResponse.json({ success: true, data: categories });
  } catch (error) {
    console.error('Error fetching document categories:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch categories' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authService.getSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can create categories
    if (session.user.role !== 'super_admin' && session.user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { code, name, description, module, is_required, allowed_mime_types, max_file_size_mb } = body;

    if (!code || !name || !module) {
      return NextResponse.json({ 
        success: false, 
        error: 'code, name, and module are required' 
      }, { status: 400 });
    }

    const result = await documentService.createDocumentCategory({
      code,
      name,
      description,
      module,
      is_required,
      allowed_mime_types,
      max_file_size_mb,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: { id: result.id } });
  } catch (error) {
    console.error('Error creating document category:', error);
    return NextResponse.json({ success: false, error: 'Failed to create category' }, { status: 500 });
  }
}
