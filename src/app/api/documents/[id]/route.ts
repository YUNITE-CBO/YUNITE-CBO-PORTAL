/**
 * Document Operations API - Enterprise Document Service
 * 
 * Handles individual document operations: verify, archive, restore, delete, download
 */

import { NextRequest, NextResponse } from 'next/server';
import { enterpriseDocumentService, registerAllModuleHandlers } from '@/lib/services/documents';
import { authService } from '@/lib/services/auth.service';
import { createServiceClient } from '@/lib/supabase/server';

interface RouteParams {
  params: { id: string };
}

// Ensure handlers are registered
let handlersRegistered = false;
function ensureHandlersRegistered() {
  if (!handlersRegistered) {
    registerAllModuleHandlers();
    handlersRegistered = true;
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Generate download URL
    if (action === 'download') {
      const expiresIn = parseInt(searchParams.get('expiresIn') || '3600');
      const result = await enterpriseDocumentService.getDownloadUrl(params.id, expiresIn);
      
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 404 });
      }
      
      return NextResponse.json({ success: true, data: { url: result.url } });
    }

    // Get version history
    if (action === 'versions') {
      const versions = await enterpriseDocumentService.getVersionHistory(params.id);
      return NextResponse.json({ success: true, data: versions });
    }

    // Get single document
    const doc = await enterpriseDocumentService.getById(params.id);
    if (!doc) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: doc });

  } catch (error) {
    console.error('Error in GET /api/documents/[id]:', error);
    return NextResponse.json({ success: false, error: 'Operation failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    ensureHandlersRegistered();
    
    // Verify user is authenticated
    const session = await authService.getSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, notes, metadata, title, description, tags } = body;

    switch (action) {
      case 'verify': {
        const result = await enterpriseDocumentService.verify(params.id, session.user.id, notes);
        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        }

        // Auto-complete compliance when document is verified
        const doc = result.document;
        if (doc?.entityType === 'member' && doc?.categoryCode) {
          try {
            const supabase = await createServiceClient();
            
            const complianceTypeMap: Record<string, string> = {
              'member_national_id': 'id_verification',
              'member_kra_pin': 'kyc_complete',
              'member_passport_photo': 'photo',
            };
            
            const complianceType = complianceTypeMap[doc.categoryCode] || doc.categoryCode;
            
            await supabase
              .from('compliance_records')
              .update({ 
                status: 'complete', 
                completed_date: new Date().toISOString(),
                notes: `Auto-completed from verified document: ${doc.title || doc.fileName}`
              })
              .eq('member_id', doc.entityId)
              .eq('compliance_type', complianceType);
            
            await supabase
              .from('member_compliance')
              .update({ 
                status: 'approved', 
                reviewed_at: new Date().toISOString(),
                review_notes: `Auto-completed from verified document: ${doc.title || doc.fileName}`
              })
              .eq('member_id', doc.entityId)
              .eq('document_category_code', doc.categoryCode);
          } catch (err) {
            console.error('Failed to auto-update compliance:', err);
          }
        }

        return NextResponse.json({ 
          success: true, 
          data: result.document,
          message: 'Document verified successfully' 
        });
      }

      case 'approve': {
        const result = await enterpriseDocumentService.approve(params.id, session.user.id, notes);
        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        }

        // Auto-complete compliance when document is approved
        const doc = result.document;
        if (doc?.entityType === 'member' && doc?.categoryCode) {
          try {
            const supabase = await createServiceClient();
            
            // Map document category codes to compliance types
            const complianceTypeMap: Record<string, string> = {
              'member_national_id': 'id_verification',
              'member_kra_pin': 'kyc_complete',
              'member_passport_photo': 'photo',
            };
            
            const complianceType = complianceTypeMap[doc.categoryCode] || doc.categoryCode;
            
            // Update compliance_records
            await supabase
              .from('compliance_records')
              .update({ 
                status: 'complete', 
                completed_date: new Date().toISOString(),
                notes: `Auto-completed from approved document: ${doc.title || doc.fileName}`
              })
              .eq('member_id', doc.entityId)
              .eq('compliance_type', complianceType);
            
            // Update member_compliance
            await supabase
              .from('member_compliance')
              .update({ 
                status: 'approved', 
                reviewed_at: new Date().toISOString(),
                review_notes: `Auto-completed from approved document: ${doc.title || doc.fileName}`
              })
              .eq('member_id', doc.entityId)
              .eq('document_category_code', doc.categoryCode);
          } catch (err) {
            console.error('Failed to auto-update compliance:', err);
          }
        }

        return NextResponse.json({ 
          success: true, 
          data: result.document,
          message: 'Document approved successfully' 
        });
      }

      case 'reject': {
        if (!notes) {
          return NextResponse.json({ 
            success: false, 
            error: 'Rejection reason is required' 
          }, { status: 400 });
        }
        const result = await enterpriseDocumentService.reject(params.id, session.user.id, notes);
        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        }
        return NextResponse.json({ 
          success: true, 
          data: result.document,
          message: 'Document rejected' 
        });
      }

      case 'submit': {
        const result = await enterpriseDocumentService.submit(params.id, session.user.id);
        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        }
        return NextResponse.json({ 
          success: true, 
          data: result.document,
          message: 'Document submitted for review' 
        });
      }

      case 'archive': {
        const result = await enterpriseDocumentService.archive(params.id, session.user.id);
        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        }
        return NextResponse.json({ 
          success: true, 
          data: result.document,
          message: 'Document archived successfully' 
        });
      }

      case 'restore': {
        const result = await enterpriseDocumentService.restore(params.id, session.user.id);
        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        }
        return NextResponse.json({ 
          success: true, 
          data: result.document,
          message: 'Document restored successfully' 
        });
      }

      case 'update_metadata': {
        const result = await enterpriseDocumentService.updateMetadata(
          params.id,
          { title, description, tags, ...metadata },
          session.user.id
        );
        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        }
        return NextResponse.json({ 
          success: true, 
          data: result.document,
          message: 'Metadata updated successfully' 
        });
      }

      case 'replace': {
        // Handle file replacement
        const formData = await request.formData();
        const file = formData.get('file') as File;
        
        if (!file) {
          return NextResponse.json({ 
            success: false, 
            error: 'Replacement file is required' 
          }, { status: 400 });
        }

        const result = await enterpriseDocumentService.replace(
          params.id,
          file,
          file.name,
          session.user.id,
          session.user.full_name
        );

        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        }

        return NextResponse.json({ 
          success: true, 
          data: result.document,
          message: 'Document replaced successfully (new version created)' 
        });
      }

      default:
        return NextResponse.json({ 
          success: false, 
          error: `Invalid action: ${action}. Valid actions: verify, approve, reject, submit, archive, restore, update_metadata, replace` 
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Error in PUT /api/documents/[id]:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to update document' 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    ensureHandlersRegistered();
    
    // Verify user is authenticated
    const session = await authService.getSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const reason = searchParams.get('reason');

    const result = await enterpriseDocumentService.delete(
      params.id,
      session.user.id,
      reason || undefined
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Document deleted successfully' 
    });

  } catch (error) {
    console.error('Error in DELETE /api/documents/[id]:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to delete document' 
    }, { status: 500 });
  }
}
