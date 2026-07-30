import { SupabaseClient } from '@supabase/supabase-js';
export declare class SupabaseService {
    private static anonInstance;
    private static adminInstance;
    /**
     * Get the Supabase client with anon key (limited permissions)
     */
    static getAnonClient(): SupabaseClient;
    /**
     * Get the Supabase admin client with service role key (full permissions)
     * WARNING: Only use server-side, never expose to client
     */
    static getAdminClient(): SupabaseClient;
    /**
     * Health check - verify Supabase connection
     */
    static healthCheck(): Promise<boolean>;
    /**
     * Initialize Supabase - verify connection on startup
     */
    static initialize(): Promise<void>;
    /**
     * Execute a raw SQL query via Supabase's Postgres REST API
     */
    static executeRawQuery(query: string, params?: any[]): Promise<any>;
    /**
     * Get the Supabase project URL
     */
    static getProjectUrl(): string;
    /**
     * Get the Supabase anon key
     */
    static getAnonKey(): string;
}
//# sourceMappingURL=SupabaseService.d.ts.map