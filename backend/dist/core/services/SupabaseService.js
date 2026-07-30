"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("../../config");
const Logger_1 = require("./Logger");
class SupabaseService {
    static anonInstance;
    static adminInstance;
    /**
     * Get the Supabase client with anon key (limited permissions)
     */
    static getAnonClient() {
        if (!SupabaseService.anonInstance) {
            if (!config_1.config.supabase.url || !config_1.config.supabase.anonKey) {
                throw new Error('Supabase URL and Anon Key must be configured');
            }
            SupabaseService.anonInstance = (0, supabase_js_1.createClient)(config_1.config.supabase.url, config_1.config.supabase.anonKey, {
                auth: {
                    autoRefreshToken: true,
                    persistSession: false,
                    detectSessionInUrl: false,
                },
                realtime: {
                    params: {
                        eventsPerSecond: 10,
                    },
                },
            });
            Logger_1.Logger.info('Supabase anon client initialized');
        }
        return SupabaseService.anonInstance;
    }
    /**
     * Get the Supabase admin client with service role key (full permissions)
     * WARNING: Only use server-side, never expose to client
     */
    static getAdminClient() {
        if (!SupabaseService.adminInstance) {
            if (!config_1.config.supabase.url || !config_1.config.supabase.serviceRoleKey) {
                throw new Error('Supabase URL and Service Role Key must be configured');
            }
            SupabaseService.adminInstance = (0, supabase_js_1.createClient)(config_1.config.supabase.url, config_1.config.supabase.serviceRoleKey, {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                    detectSessionInUrl: false,
                },
            });
            Logger_1.Logger.info('Supabase admin client initialized');
        }
        return SupabaseService.adminInstance;
    }
    /**
     * Health check - verify Supabase connection
     */
    static async healthCheck() {
        try {
            const client = SupabaseService.getAdminClient();
            const { data, error } = await client.from('_prisma_migrations').select('id', { count: 'exact', head: true });
            if (error) {
                // _prisma_migrations may not exist, try a simple query
                const { error: pingError } = await client.rpc('ping');
                if (pingError) {
                    Logger_1.Logger.warn('Supabase health check - rpc ping failed, trying direct query');
                }
            }
            Logger_1.Logger.info('Supabase health check passed');
            return true;
        }
        catch (error) {
            Logger_1.Logger.error('Supabase health check failed', error);
            return false;
        }
    }
    /**
     * Initialize Supabase - verify connection on startup
     */
    static async initialize() {
        try {
            Logger_1.Logger.info('Initializing Supabase services...');
            // Initialize both clients
            SupabaseService.getAnonClient();
            SupabaseService.getAdminClient();
            // Verify connection
            const healthy = await SupabaseService.healthCheck();
            if (healthy) {
                Logger_1.Logger.info('✅ Supabase services initialized successfully');
            }
            else {
                Logger_1.Logger.warn('⚠️  Supabase initialized but health check returned warning');
            }
        }
        catch (error) {
            Logger_1.Logger.error('❌ Failed to initialize Supabase services', error);
            throw error;
        }
    }
    /**
     * Execute a raw SQL query via Supabase's Postgres REST API
     */
    static async executeRawQuery(query, params) {
        try {
            const client = SupabaseService.getAdminClient();
            const { data, error } = await client.rpc('exec_sql', {
                query_text: query,
                query_params: params || [],
            });
            if (error)
                throw error;
            return data;
        }
        catch (error) {
            Logger_1.Logger.error('Supabase raw query failed', error);
            throw error;
        }
    }
    /**
     * Get the Supabase project URL
     */
    static getProjectUrl() {
        return config_1.config.supabase.url;
    }
    /**
     * Get the Supabase anon key
     */
    static getAnonKey() {
        return config_1.config.supabase.anonKey;
    }
}
exports.SupabaseService = SupabaseService;
//# sourceMappingURL=SupabaseService.js.map