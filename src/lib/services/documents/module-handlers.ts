/**
 * ENTERPRISE DOCUMENT & MEDIA SERVICE - ADDITIONAL MODULE HANDLERS
 * 
 * These handlers are in addition to those in enhanced-handlers.ts.
 * This file only exports handlers not defined elsewhere to avoid duplicate exports.
 */

import { createServiceClient } from '@/lib/supabase/server';
import {
  ModuleDocumentHandler,
  ModuleType,
  EnterpriseDocument,
  DocumentUploadOptions,
} from './types';

/**
 * USER DOCUMENTS HANDLER
 * Handles profile photos for admin/users
 */
export class UserDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'users';

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    if (options.categoryCode.includes('profile') || options.categoryCode.includes('avatar')) {
      const mimeType = options.file instanceof File ? options.file.type : '';
      if (!mimeType.startsWith('image/')) {
        return { valid: false, error: 'Profile photos must be image files' };
      }
    }
    return { valid: true };
  }

  async onUpload(document: EnterpriseDocument): Promise<void> {
    if (document.categoryCode.includes('profile') || document.categoryCode.includes('avatar')) {
      const supabase = await createServiceClient();
      await supabase
        .from('users')
        .update({ avatar_url: document.publicUrl })
        .eq('id', document.entityId);
    }
  }
}

/**
 * PROJECT DOCUMENTS HANDLER
 * Handles proposals, contracts, progress reports, deliverables
 */
export class ProjectDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'projects';

  async onUpload(document: EnterpriseDocument): Promise<void> {
    const supabase = await createServiceClient();

    if (document.categoryCode === 'project_proposal') {
      await supabase.from('projects').update({ proposal_url: document.publicUrl }).eq('id', document.entityId);
    }
    if (document.categoryCode === 'project_contract') {
      await supabase.from('projects').update({ contract_url: document.publicUrl }).eq('id', document.entityId);
    }
    if (document.categoryCode === 'project_completion') {
      await supabase.from('projects').update({ completion_report_url: document.publicUrl }).eq('id', document.entityId);
    }
  }
}

/**
 * REPORT DOCUMENTS HANDLER
 * Handles generated reports, statements, financial analyses
 */
export class ReportDocumentHandler implements ModuleDocumentHandler {
  module: ModuleType = 'reports';

  async validateUpload(options: DocumentUploadOptions): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    options.metadata = {
      ...options.metadata,
      is_generated: true,
      generation_source: 'system',
    };
    return { valid: true };
  }

  async onUpload(_document: EnterpriseDocument): Promise<void> {
    // Reports are stored with version history for audit trail
  }
}
