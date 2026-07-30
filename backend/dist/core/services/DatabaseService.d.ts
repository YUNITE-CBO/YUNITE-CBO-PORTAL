import { PrismaClient } from '@prisma/client';
export declare class DatabaseService {
    private static instance;
    static getInstance(): PrismaClient;
    static connect(): Promise<void>;
    static disconnect(): Promise<void>;
    static healthCheck(): Promise<boolean>;
    /**
     * Get the Supabase client for auth operations
     */
    static getSupabaseClient(): import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
    /**
     * Get the Supabase admin client for server-side operations
     */
    static getSupabaseAdmin(): import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
}
//# sourceMappingURL=DatabaseService.d.ts.map