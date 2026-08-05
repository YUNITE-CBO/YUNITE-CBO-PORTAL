/**
 * Document Management API - Centralized Enterprise Document Service
 * 
 * This API serves as the unified interface for all document operations
 * across the YUNITE Enterprise Operating System.
 */

import { NextRequest, NextResponse } from 'next/server';
import { enterpriseDocumentService, registerAllModuleHandlers } from '@/lib/services/documents';
import { documentSearchService } from '@/lib/services/documents/search.service';
import { authService } from '@/lib/services/auth.service';

// Register module handlers (should be done once at app startup)
let handlersRegistered = false;
function ensureHandlersRegistered() {
  if (!handlersRegistered) {
    registerAllModuleHandlers();
    handlersRegistered = true;
  }
}

export async function GET(request: NextRequest) {
  try {
    ensureHandlersRegistered();
    
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Search documents
    if (action === 'search') {
      const query = searchParams.get('query') || undefined;
      const module = searchParams.get('module') || undefined;
      const entityType = searchParams.get('entityType') || undefined;
      const entityId = searchParams.get('entityId') || undefined;
      const categoryCode = searchParams.get('categoryCode') || undefined;
      const status = searchParams.get('status') || undefined;
      const page = parseInt(searchParams.get('page') || '1');
      const pageSize = parseInt(searchParams.get('pageSize') || '20');

      const results = await enterpriseDocumentService.search({
        query,
        module: module as any,
        entityType,
        entityId,
        categoryCode,
        status: status as any,
        page,
        pageSize,
      });

      return NextResponse.json({ success: true, data: results });
    }

    // Get search facets
    if (action === 'facets') {
      const facets = await documentSearchService.getFacets({});
      return NextResponse.json({ success: true, data: facets });
    }

    // Get document statistics
    if (action === 'stats') {
      const stats = await documentSearchService.getStatistics();
      return NextResponse.json({ success: true, data: stats });
    }

    // Get expiring documents
    if (action === 'expiring') {
      const days = parseInt(searchParams.get('days') || '30');
      const limit = parseInt(searchParams.get('limit') || '50');
      const docs = await documentSearchService.getExpiringDocuments(days, { limit });
      return NextResponse.json({ success: true, data: docs });
    }

    // Find duplicate documents
    if (action === 'duplicates') {
      const duplicates = await documentSearchService.findDuplicates();
      return NextResponse.json({ success: true, data: duplicates });
    }

    // Get documents for entity
    const module = searchParams.get('module');
    const entityType = searchParams.get('entityType');
    const entityId = searchParams.get('entityId');
    const categories = searchParams.get('categories');
    const memberId = searchParams.get('memberId');
    const documentId = searchParams.get('id');

    // Get single document by ID
    if (documentId) {
      const doc = await enterpriseDocumentService.getById(documentId);
      if (!doc) {
        return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: doc });
    }

    // Get document categories for a module
    if (categories && module) {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const supabase = await createServiceClient();
      const { data } = await supabase
        .from('document_categories')
        .select('*')
        .eq('module', module)
        .eq('is_active', true)
        .order('sort_order');
      return NextResponse.json({ success: true, data: data || [] });
    }

    // Get member compliance status
    if (memberId) {
      ensureHandlersRegistered();
      const { MemberDocumentHandler } = await import('@/lib/services/documents/enhanced-handlers');
      const handler = new MemberDocumentHandler();
      const compliance = await handler.getComplianceRequirements(memberId);
      const score = await handler.calculateComplianceScore(memberId);
      return NextResponse.json({ success: true, data: { requirements: compliance, score } });
    }

    // Get documents for an entity
    if (module && entityType && entityId) {
      const docs = await enterpriseDocumentService.getForEntity(
        module as any,
        entityId,
        {
          includeArchived: searchParams.get('includeArchived') === 'true',
        }
      );
      return NextResponse.json({ success: true, data: docs });
    }

    return NextResponse.json({ 
      success: false, 
      error: 'Missing required parameters. Provide: (module, entityType, entityId), (categories, module), (memberId), or (id)' 
    }, { status: 400 });

  } catch (error) {
    console.error('Error in GET /api/documents:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to process request' 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureHandlersRegistered();
    
    // Verify user is authenticated
    const session = await authService.getSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const ipAddress = request.headers.get('x-forwarded-for') || 
                      request.headers.get('x-real-ip') || '';

    // Handle multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const module = formData.get('module') as string;
    const entityType = formData.get('entityType') as string;
    const entityId = formData.get('entityId') as string;
    const categoryCode = formData.get('categoryCode') as string;
    const bucket = formData.get('bucket') as string | null;
    const title = formData.get('title') as string | null;
    const description = formData.get('description') as string | null;
    const expiryDate = formData.get('expiryDate') as string | null;
    const isNewVersion = formData.get('isNewVersion') === 'true';
    const parentDocumentId = formData.get('parentDocumentId') as string | null;
    const visibility = formData.get('visibility') as 'public' | 'authenticated' | 'admin' | 'owner' | null;

    // Validation
    if (!file || !module || !entityType || !entityId || !categoryCode) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields: file, module, entityType, entityId, categoryCode' 
      }, { status: 400 });
    }

    // Upload document
    const result = await enterpriseDocumentService.upload({
      module: module as any,
      entityType,
      entityId,
      categoryCode,
      file,
      fileName: file.name,
      bucket: bucket || undefined,
      title: title || undefined,
      description: description || undefined,
      expiryDate: expiryDate || undefined,
      isNewVersion,
      parentDocumentId: parentDocumentId || undefined,
      visibility: visibility || undefined,
      userId: session.user.id,
      userName: session.user.full_name,
      ipAddress,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      data: {
        document: result.document,
        fileId: result.fileId,
        publicUrl: result.publicUrl,
      },
      message: 'Document uploaded successfully'
    });

  } catch (error) {
    console.error('Error in POST /api/documents:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to upload document' 
    }, { status: 500 });
  }
}
