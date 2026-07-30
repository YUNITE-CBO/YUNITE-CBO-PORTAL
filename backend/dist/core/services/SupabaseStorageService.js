"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseStorageService = void 0;
const SupabaseService_1 = require("./SupabaseService");
const Logger_1 = require("./Logger");
const config_1 = require("../../config");
class SupabaseStorageService {
    static initialized = false;
    static defaultBuckets = [
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
    static async initialize() {
        if (SupabaseStorageService.initialized)
            return;
        try {
            Logger_1.Logger.info('Initializing Supabase Storage...');
            const adminClient = SupabaseService_1.SupabaseService.getAdminClient();
            // Create default buckets
            for (const bucketName of SupabaseStorageService.defaultBuckets) {
                const { data: existingBucket, error: listError } = await adminClient.storage.getBucket(bucketName);
                if (listError && listError.message.includes('not found')) {
                    const { error: createError } = await adminClient.storage.createBucket(bucketName, {
                        public: bucketName === 'avatars',
                        fileSizeLimit: config_1.config.upload.maxFileSize,
                        allowedMimeTypes: bucketName === 'avatars'
                            ? ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
                            : undefined,
                    });
                    if (createError) {
                        Logger_1.Logger.warn(`Could not create bucket '${bucketName}': ${createError.message}`);
                    }
                    else {
                        Logger_1.Logger.info(`Created storage bucket: ${bucketName}`);
                    }
                }
            }
            SupabaseStorageService.initialized = true;
            Logger_1.Logger.info('✅ Supabase Storage initialized successfully');
        }
        catch (error) {
            Logger_1.Logger.error('Failed to initialize Supabase Storage', error);
            throw error;
        }
    }
    /**
     * Get the appropriate client for storage operations
     */
    static getClient(useAdmin = false) {
        return useAdmin ? SupabaseService_1.SupabaseService.getAdminClient() : SupabaseService_1.SupabaseService.getAnonClient();
    }
    /**
     * Upload a file to Supabase Storage
     */
    static async upload(options, useAdmin = false) {
        const client = SupabaseService_1.SupabaseService.getAdminClient(); // Always use admin for uploads server-side
        const { data, error } = await client.storage
            .from(options.bucket)
            .upload(options.path, options.file, {
            contentType: options.contentType,
            upsert: options.upsert ?? true,
            cacheControl: options.cacheControl ?? '3600',
        });
        if (error) {
            Logger_1.Logger.error(`Storage upload failed [${options.bucket}/${options.path}]`, error);
            throw error;
        }
        // Get public URL
        const { data: urlData } = client.storage
            .from(options.bucket)
            .getPublicUrl(options.path);
        Logger_1.Logger.info(`File uploaded: ${options.bucket}/${options.path}`);
        return {
            path: data?.path || options.path,
            url: urlData.publicUrl,
        };
    }
    /**
     * Download a file from Supabase Storage
     */
    static async download(options) {
        const client = SupabaseService_1.SupabaseService.getAdminClient();
        const { data, error } = await client.storage
            .from(options.bucket)
            .download(options.path, {
            transform: options.transform,
        });
        if (error) {
            Logger_1.Logger.error(`Storage download failed [${options.bucket}/${options.path}]`, error);
            throw error;
        }
        return data;
    }
    /**
     * Delete a file from Supabase Storage
     */
    static async delete(bucket, paths) {
        const client = SupabaseService_1.SupabaseService.getAdminClient();
        const { error } = await client.storage
            .from(bucket)
            .remove(paths);
        if (error) {
            Logger_1.Logger.error(`Storage delete failed [${bucket}/${paths.join(', ')}]`, error);
            throw error;
        }
        Logger_1.Logger.info(`Files deleted: ${bucket}/${paths.join(', ')}`);
    }
    /**
     * List files in a bucket path
     */
    static async listFiles(bucket, path = '', options) {
        const client = SupabaseService_1.SupabaseService.getAdminClient();
        const { data, error } = await client.storage
            .from(bucket)
            .list(path, options);
        if (error) {
            Logger_1.Logger.error(`Storage list failed [${bucket}/${path}]`, error);
            throw error;
        }
        return (data || []).map((file) => ({
            ...file,
            bucket,
        }));
    }
    /**
     * Get a public URL for a file
     */
    static getPublicUrl(bucket, path) {
        const client = SupabaseService_1.SupabaseService.getAnonClient();
        const { data } = client.storage.from(bucket).getPublicUrl(path);
        return data.publicUrl;
    }
    /**
     * Generate a signed URL for temporary access
     */
    static async getSignedUrl(bucket, path, expiresIn = 3600) {
        const client = SupabaseService_1.SupabaseService.getAdminClient();
        const { data, error } = await client.storage
            .from(bucket)
            .createSignedUrl(path, expiresIn);
        if (error) {
            Logger_1.Logger.error(`Signed URL generation failed [${bucket}/${path}]`, error);
            throw error;
        }
        return data.signedUrl;
    }
    /**
     * Copy a file within storage
     */
    static async copy(bucket, fromPath, toPath) {
        const client = SupabaseService_1.SupabaseService.getAdminClient();
        const { data, error } = await client.storage
            .from(bucket)
            .copy(fromPath, toPath);
        if (error) {
            Logger_1.Logger.error(`Storage copy failed [${bucket}/${fromPath} -> ${toPath}]`, error);
            throw error;
        }
        return data?.path || toPath;
    }
    /**
     * Move a file within storage
     */
    static async move(bucket, fromPath, toPath) {
        const client = SupabaseService_1.SupabaseService.getAdminClient();
        const { data, error } = await client.storage
            .from(bucket)
            .move(fromPath, toPath);
        if (error) {
            Logger_1.Logger.error(`Storage move failed [${bucket}/${fromPath} -> ${toPath}]`, error);
            throw error;
        }
        return data?.path || toPath;
    }
    /**
     * Get bucket info
     */
    static async getBucketInfo(bucket) {
        const client = SupabaseService_1.SupabaseService.getAdminClient();
        const { data, error } = await client.storage.getBucket(bucket);
        if (error)
            throw error;
        return data;
    }
    /**
     * List all buckets
     */
    static async listBuckets() {
        const client = SupabaseService_1.SupabaseService.getAdminClient();
        const { data, error } = await client.storage.listBuckets();
        if (error)
            throw error;
        return data || [];
    }
}
exports.SupabaseStorageService = SupabaseStorageService;
//# sourceMappingURL=SupabaseStorageService.js.map