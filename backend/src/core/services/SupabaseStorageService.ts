import { SupabaseClient, TransformOptions } from '@supabase/supabase-js';
import { SupabaseService } from './SupabaseService';
import { Logger } from './Logger';
import { config } from '../../config';

export interface StorageUploadOptions {
  bucket: string;
  path: string;
  file: ArrayBuffer | Uint8Array | ReadableStream | string;
  contentType?: string;
  upsert?: boolean;
  cacheControl?: string;
}

export interface StorageDownloadOptions {
  bucket: string;
  path: string;
  transform?: TransformOptions;
}

export interface StorageFileInfo {
  name: string;
  bucket: string;
  owner: string | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
  metadata: Record<string, any>;
  id: string;
  size: number;
}

export class SupabaseStorageService {
  private static initialized = false;
  private static defaultBuckets = [
    'organizations',
    'members',
    'documents',
    'loans',
    'projects',
    'meetings',
    'reports',
    'avatars',
  ];

  /**
   * Initialize storage - create default buckets if they don't exist
   */
  public static async initialize(): Promise<void> {
    if (SupabaseStorageService.initialized) return;

    try {
      Logger.info('Initializing Supabase Storage...');
      const adminClient = SupabaseService.getAdminClient();

      // Create default buckets
      for (const bucketName of SupabaseStorageService.defaultBuckets) {
        const { data: existingBucket, error: listError } = await adminClient.storage.getBucket(bucketName);
        
        if (listError && listError.message.includes('not found')) {
          const { error: createError } = await adminClient.storage.createBucket(bucketName, {
            public: bucketName === 'avatars',
            fileSizeLimit: config.upload.maxFileSize,
            allowedMimeTypes: bucketName === 'avatars' 
              ? ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
              : undefined,
          });

          if (createError) {
            Logger.warn(`Could not create bucket '${bucketName}': ${createError.message}`);
          } else {
            Logger.info(`Created storage bucket: ${bucketName}`);
          }
        }
      }

      SupabaseStorageService.initialized = true;
      Logger.info('✅ Supabase Storage initialized successfully');
    } catch (error) {
      Logger.error('Failed to initialize Supabase Storage', error);
      throw error;
    }
  }

  /**
   * Get the appropriate client for storage operations
   */
  private static getClient(useAdmin: boolean = false): SupabaseClient {
    return useAdmin ? SupabaseService.getAdminClient() : SupabaseService.getAnonClient();
  }

  /**
   * Upload a file to Supabase Storage
   */
  public static async upload(options: StorageUploadOptions, useAdmin: boolean = false): Promise<{ path: string; url: string }> {
    const client = SupabaseService.getAdminClient(); // Always use admin for uploads server-side
    
    const { data, error } = await client.storage
      .from(options.bucket)
      .upload(options.path, options.file, {
        contentType: options.contentType,
        upsert: options.upsert ?? true,
        cacheControl: options.cacheControl ?? '3600',
      });

    if (error) {
      Logger.error(`Storage upload failed [${options.bucket}/${options.path}]`, error);
      throw error;
    }

    // Get public URL
    const { data: urlData } = client.storage
      .from(options.bucket)
      .getPublicUrl(options.path);

    Logger.info(`File uploaded: ${options.bucket}/${options.path}`);
    return {
      path: data?.path || options.path,
      url: urlData.publicUrl,
    };
  }

  /**
   * Download a file from Supabase Storage
   */
  public static async download(options: StorageDownloadOptions): Promise<any> {
    const client = SupabaseService.getAdminClient();

    const { data, error } = await client.storage
      .from(options.bucket)
      .download(options.path, {
        transform: options.transform,
      });

    if (error) {
      Logger.error(`Storage download failed [${options.bucket}/${options.path}]`, error);
      throw error;
    }

    return data;
  }

  /**
   * Delete a file from Supabase Storage
   */
  public static async delete(bucket: string, paths: string[]): Promise<void> {
    const client = SupabaseService.getAdminClient();

    const { error } = await client.storage
      .from(bucket)
      .remove(paths);

    if (error) {
      Logger.error(`Storage delete failed [${bucket}/${paths.join(', ')}]`, error);
      throw error;
    }

    Logger.info(`Files deleted: ${bucket}/${paths.join(', ')}`);
  }

  /**
   * List files in a bucket path
   */
  public static async listFiles(bucket: string, path: string = '', options?: {
    limit?: number;
    offset?: number;
    sortBy?: { column: string; order: string };
  }): Promise<StorageFileInfo[]> {
    const client = SupabaseService.getAdminClient();

    const { data, error } = await client.storage
      .from(bucket)
      .list(path, options);

    if (error) {
      Logger.error(`Storage list failed [${bucket}/${path}]`, error);
      throw error;
    }

    return (data || []).map((file: any) => ({
      ...file,
      bucket,
    })) as StorageFileInfo[];
  }

  /**
   * Get a public URL for a file
   */
  public static getPublicUrl(bucket: string, path: string): string {
    const client = SupabaseService.getAnonClient();
    const { data } = client.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  /**
   * Generate a signed URL for temporary access
   */
  public static async getSignedUrl(bucket: string, path: string, expiresIn: number = 3600): Promise<string> {
    const client = SupabaseService.getAdminClient();

    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) {
      Logger.error(`Signed URL generation failed [${bucket}/${path}]`, error);
      throw error;
    }

    return data.signedUrl;
  }

  /**
   * Copy a file within storage
   */
  public static async copy(bucket: string, fromPath: string, toPath: string): Promise<string> {
    const client = SupabaseService.getAdminClient();

    const { data, error } = await client.storage
      .from(bucket)
      .copy(fromPath, toPath);

    if (error) {
      Logger.error(`Storage copy failed [${bucket}/${fromPath} -> ${toPath}]`, error);
      throw error;
    }

    return (data as any)?.path || toPath;
  }

  /**
   * Move a file within storage
   */
  public static async move(bucket: string, fromPath: string, toPath: string): Promise<string> {
    const client = SupabaseService.getAdminClient();

    const { data, error } = await client.storage
      .from(bucket)
      .move(fromPath, toPath);

    if (error) {
      Logger.error(`Storage move failed [${bucket}/${fromPath} -> ${toPath}]`, error);
      throw error;
    }

    return (data as any)?.path || toPath;
  }

  /**
   * Get bucket info
   */
  public static async getBucketInfo(bucket: string): Promise<any> {
    const client = SupabaseService.getAdminClient();

    const { data, error } = await client.storage.getBucket(bucket);
    if (error) throw error;
    return data;
  }

  /**
   * List all buckets
   */
  public static async listBuckets(): Promise<any[]> {
    const client = SupabaseService.getAdminClient();

    const { data, error } = await client.storage.listBuckets();
    if (error) throw error;
    return data || [];
  }
}