/**
 * ENTERPRISE DOCUMENT & MEDIA SERVICE - SEARCH SERVICE
 * 
 * Advanced search and retrieval capabilities for the document service.
 * Provides faceted search, filters, and aggregations.
 */

import { createServiceClient } from '@/lib/supabase/server';
import {
  DocumentSearchOptions,
  DocumentSearchResult,
  SearchFacets,
  EnterpriseDocument,
  ModuleType,
  DocumentStatus,
} from './types';

export class DocumentSearchService {
  /**
   * Full-text search across documents
   */
  async search(options: DocumentSearchOptions): Promise<DocumentSearchResult> {
    const supabase = await createServiceClient();

    let query = supabase
      .from('documents')
      .select('*', { count: 'exact' });

    // Apply classification filters
    if (options.module) {
      const modules = Array.isArray(options.module) ? options.module : [options.module];
      query = query.in('module', modules);
    }

    if (options.entityType) {
      query = query.eq('entity_type', options.entityType);
    }

    if (options.entityId) {
      query = query.eq('entity_id', options.entityId);
    }

    if (options.categoryCode) {
      const categories = Array.isArray(options.categoryCode) 
        ? options.categoryCode 
        : [options.categoryCode];
      query = query.in('category_code', categories);
    }

    // Apply status filters
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      query = query.in('status', statuses);
    }

    if (options.isExpired !== undefined) {
      query = query.eq('is_expired', options.isExpired);
    }

    if (options.expiringWithinDays) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + options.expiringWithinDays);
      query = query
        .lte('expiry_date', futureDate.toISOString())
        .gte('expiry_date', new Date().toISOString());
    }

    // Apply owner filters
    if (options.uploadedBy) {
      query = query.eq('uploaded_by', options.uploadedBy);
    }

    // Apply date filters
    if (options.uploadedAfter) {
      query = query.gte('uploaded_at', options.uploadedAfter);
    }
    if (options.uploadedBefore) {
      query = query.lte('uploaded_at', options.uploadedBefore);
    }
    if (options.expiresAfter) {
      query = query.gte('expiry_date', options.expiresAfter);
    }
    if (options.expiresBefore) {
      query = query.lte('expiry_date', options.expiresBefore);
    }

    // Archive filters
    if (!options.includeArchived) {
      query = query.eq('is_archived', false);
    }

    // Text search across multiple fields
    if (options.query) {
      const searchTerm = `%${options.query}%`;
      query = query.or(
        `file_name.ilike.${searchTerm},` +
        `original_file_name.ilike.${searchTerm},` +
        `metadata->>'title'.ilike.${searchTerm},` +
        `metadata->>'description'.ilike.${searchTerm},` +
        `metadata->>'author'.ilike.${searchTerm},` +
        `metadata->>'extracted_text'.ilike.${searchTerm}`
      );
    }

    // Pagination
    const page = options.page || 1;
    const pageSize = options.pageSize || options.limit || 20;
    const offset = options.offset || (page - 1) * pageSize;
    query = query.range(offset, offset + pageSize - 1);

    // Sorting
    const sortBy = options.sortBy || 'uploaded_at';
    const sortOrder = options.sortOrder || 'desc';
    
    switch (sortBy) {
      case 'fileName':
        query = query.order('file_name', { ascending: sortOrder === 'asc' });
        break;
      case 'uploadedAt':
        query = query.order('uploaded_at', { ascending: sortOrder === 'asc' });
        break;
      case 'expiryDate':
        query = query.order('expiry_date', { ascending: sortOrder === 'asc', nullsFirst: false });
        break;
      case 'status':
        query = query.order('status', { ascending: sortOrder === 'asc' });
        break;
      case 'fileSize':
        query = query.order('file_size', { ascending: sortOrder === 'asc' });
        break;
      default:
        query = query.order('uploaded_at', { ascending: false });
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('Search error:', error);
      return {
        documents: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      };
    }

    return {
      documents: data.map(d => this.mapToEnterpriseDocument(d)),
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    };
  }

  /**
   * Get search facets for filtering UI
   */
  async getFacets(options: Partial<DocumentSearchOptions>): Promise<SearchFacets> {
    const supabase = await createServiceClient();

    const baseQuery = supabase
      .from('documents')
      .select('module, category_code, status, uploaded_at', { count: 'exact' });

    // Apply same filters as main search (except pagination)
    if (options.module) {
      baseQuery.in('module', Array.isArray(options.module) ? options.module : [options.module]);
    }
    if (options.uploadedAfter) {
      baseQuery.gte('uploaded_at', options.uploadedAfter);
    }

    const { data, error } = await baseQuery;

    if (error || !data) {
      return {
        modules: {} as Record<ModuleType, number>,
        categories: {},
        statuses: {} as Record<DocumentStatus, number>,
        dateRanges: { last7Days: 0, last30Days: 0, last90Days: 0, lastYear: 0 },
      };
    }

    // Count by module
    const modules: Record<string, number> = {};
    const categories: Record<string, number> = {};
    const statuses: Record<string, number> = {};
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last90Days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const lastYear = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    const dateRanges = { last7Days: 0, last30Days: 0, last90Days: 0, lastYear: 0 };

    data.forEach(doc => {
      // Module counts
      modules[doc.module] = (modules[doc.module] || 0) + 1;

      // Category counts
      categories[doc.category_code] = (categories[doc.category_code] || 0) + 1;

      // Status counts
      statuses[doc.status] = (statuses[doc.status] || 0) + 1;

      // Date ranges
      const uploadDate = new Date(doc.uploaded_at);
      if (uploadDate >= last7Days) dateRanges.last7Days++;
      if (uploadDate >= last30Days) dateRanges.last30Days++;
      if (uploadDate >= last90Days) dateRanges.last90Days++;
      if (uploadDate >= lastYear) dateRanges.lastYear++;
    });

    return {
      modules: modules as Record<ModuleType, number>,
      categories,
      statuses: statuses as Record<DocumentStatus, number>,
      dateRanges,
    };
  }

  /**
   * Search by member/person name (cross-reference)
   */
  async searchByPersonName(
    name: string,
    options?: Partial<DocumentSearchOptions>
  ): Promise<DocumentSearchResult> {
    const supabase = await createServiceClient();

    // Get member IDs matching the name
    const { data: members } = await supabase
      .from('members')
      .select('id')
      .or(`first_name.ilike.%${name}%,last_name.ilike.%${name}%,email.ilike.%${name}%`);

    const memberIds = members?.map(m => m.id) || [];

    if (memberIds.length === 0) {
      return {
        documents: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      };
    }

    // Search documents for these members
    return this.search({
      ...options,
      module: 'members',
      entityId: memberIds[0], // Will need to search all
    });
  }

  /**
   * Get document statistics
   */
  async getStatistics(): Promise<{
    totalDocuments: number;
    totalStorageBytes: number;
    byModule: Record<string, number>;
    byStatus: Record<string, number>;
    expiringCount: number;
    expiredCount: number;
  }> {
    const supabase = await createServiceClient();

    const { count: totalDocuments } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('is_archived', false);

    const { data: storageData } = await supabase
      .from('documents')
      .select('file_size, module, status, expiry_date')
      .eq('is_archived', false);

    let totalStorageBytes = 0;
    const byModule: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let expiringCount = 0;
    let expiredCount = 0;

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    storageData?.forEach(doc => {
      totalStorageBytes += doc.file_size || 0;
      byModule[doc.module] = (byModule[doc.module] || 0) + 1;
      byStatus[doc.status] = (byStatus[doc.status] || 0) + 1;

      if (doc.expiry_date) {
        const expiry = new Date(doc.expiry_date);
        if (expiry < now) {
          expiredCount++;
        } else if (expiry <= in30Days) {
          expiringCount++;
        }
      }
    });

    return {
      totalDocuments: totalDocuments || 0,
      totalStorageBytes,
      byModule,
      byStatus,
      expiringCount,
      expiredCount,
    };
  }

  /**
   * Find duplicate documents by checksum
   */
  async findDuplicates(): Promise<Array<{
    checksum: string;
    count: number;
    documents: EnterpriseDocument[];
  }>> {
    const supabase = await createServiceClient();

    // Group by checksum and count
    const { data: grouped } = await supabase
      .from('documents')
      .select('checksum, id')
      .eq('is_archived', false)
      .not('checksum', 'is', null);

    if (!grouped) return [];

    const checksumCounts: Record<string, string[]> = {};
    grouped.forEach(doc => {
      if (!checksumCounts[doc.checksum]) {
        checksumCounts[doc.checksum] = [];
      }
      checksumCounts[doc.checksum].push(doc.id);
    });

    // Get full documents for duplicates
    const duplicates: Array<{
      checksum: string;
      count: number;
      documents: EnterpriseDocument[];
    }> = [];

    for (const [checksum, ids] of Object.entries(checksumCounts)) {
      if (ids.length > 1) {
        const { data: docs } = await supabase
          .from('documents')
          .select('*')
          .in('id', ids)
          .eq('is_archived', false);

        duplicates.push({
          checksum,
          count: ids.length,
          documents: docs?.map(d => this.mapToEnterpriseDocument(d)) || [],
        });
      }
    }

    return duplicates;
  }

  /**
   * Get documents expiring soon
   */
  async getExpiringDocuments(
    daysThreshold = 30,
    options?: { limit?: number }
  ): Promise<EnterpriseDocument[]> {
    const supabase = await createServiceClient();

    const now = new Date();
    const threshold = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);

    let query = supabase
      .from('documents')
      .select('*')
      .eq('is_archived', false)
      .eq('is_expired', false)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', threshold.toISOString())
      .gte('expiry_date', now.toISOString())
      .order('expiry_date', { ascending: true });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching expiring documents:', error);
      return [];
    }

    return data?.map(d => this.mapToEnterpriseDocument(d)) || [];
  }

  private mapToEnterpriseDocument(row: any): EnterpriseDocument {
    return {
      id: row.id,
      documentRef: row.document_ref,
      fileName: row.file_name,
      originalFileName: row.original_file_name,
      storageBucket: row.storage_bucket,
      storagePath: row.storage_path,
      publicUrl: row.file_path,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      checksum: row.checksum,
      module: row.module as ModuleType,
      entityType: row.entity_type,
      entityId: row.entity_id,
      categoryCode: row.category_code,
      version: row.version,
      parentDocumentId: row.parent_document_id,
      status: row.status as DocumentStatus,
      isVerified: row.is_verified,
      verifiedBy: row.verified_by,
      verifiedAt: row.verified_at,
      verificationNotes: row.verification_notes,
      expiryDate: row.expiry_date,
      isExpired: row.is_expired || false,
      reminderSent: row.reminder_sent,
      reminderCount: row.reminder_count,
      uploadedBy: row.uploaded_by,
      uploadedByName: row.uploaded_by_name,
      uploadedAt: row.uploaded_at,
      ipAddress: row.ip_address,
      isArchived: row.is_archived,
      archivedAt: row.archived_at,
      archivedBy: row.archived_by,
      metadata: row.metadata || {},
      visibility: row.visibility || 'authenticated',
    };
  }
}

export const documentSearchService = new DocumentSearchService();
