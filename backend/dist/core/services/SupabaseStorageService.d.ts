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
    transform?: {
        width?: number;
        height?: number;
        resize?: 'cover' | 'contain' | 'fill';
    };
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
export declare class SupabaseStorageService {
    private static initialized;
    private static defaultBuckets;
    /**
     * Initialize storage - create default buckets if they don't exist
     */
    static initialize(): Promise<void>;
    /**
     * Get the appropriate client for storage operations
     */
    private static getClient;
    /**
     * Upload a file to Supabase Storage
     */
    static upload(options: StorageUploadOptions, useAdmin?: boolean): Promise<{
        path: string;
        url: string;
    }>;
    /**
     * Download a file from Supabase Storage
     */
    static download(options: StorageDownloadOptions): Promise<any>;
    /**
     * Delete a file from Supabase Storage
     */
    static delete(bucket: string, paths: string[]): Promise<void>;
    /**
     * List files in a bucket path
     */
    static listFiles(bucket: string, path?: string, options?: {
        limit?: number;
        offset?: number;
        sortBy?: {
            column: string;
            order: string;
        };
    }): Promise<StorageFileInfo[]>;
    /**
     * Get a public URL for a file
     */
    static getPublicUrl(bucket: string, path: string): string;
    /**
     * Generate a signed URL for temporary access
     */
    static getSignedUrl(bucket: string, path: string, expiresIn?: number): Promise<string>;
    /**
     * Copy a file within storage
     */
    static copy(bucket: string, fromPath: string, toPath: string): Promise<string>;
    /**
     * Move a file within storage
     */
    static move(bucket: string, fromPath: string, toPath: string): Promise<string>;
    /**
     * Get bucket info
     */
    static getBucketInfo(bucket: string): Promise<any>;
    /**
     * List all buckets
     */
    static listBuckets(): Promise<any[]>;
}
//# sourceMappingURL=SupabaseStorageService.d.ts.map