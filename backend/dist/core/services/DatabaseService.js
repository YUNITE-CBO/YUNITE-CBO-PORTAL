"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const client_1 = require("@prisma/client");
const Logger_1 = require("./Logger");
const SupabaseService_1 = require("./SupabaseService");
class DatabaseService {
    static instance;
    static getInstance() {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new client_1.PrismaClient({
                log: [
                    { emit: 'stdout', level: 'query' },
                    { emit: 'stdout', level: 'error' },
                    { emit: 'stdout', level: 'info' },
                    { emit: 'stdout', level: 'warn' },
                ],
            });
        }
        return DatabaseService.instance;
    }
    static async connect() {
        try {
            await DatabaseService.getInstance().$connect();
            Logger_1.Logger.info('Database connected successfully via Prisma (Supabase Postgres)');
            // Also initialize Supabase client (non-blocking, for auth/storage features)
            try {
                SupabaseService_1.SupabaseService.getAdminClient();
                Logger_1.Logger.info('Supabase admin client ready');
            }
            catch (supabaseError) {
                Logger_1.Logger.warn('Supabase client initialization deferred', supabaseError);
            }
        }
        catch (error) {
            Logger_1.Logger.error('Failed to connect to database', error);
            throw error;
        }
    }
    static async disconnect() {
        await DatabaseService.getInstance().$disconnect();
        Logger_1.Logger.info('Database disconnected');
    }
    static async healthCheck() {
        try {
            await DatabaseService.getInstance().$queryRaw `SELECT 1`;
            return true;
        }
        catch (error) {
            Logger_1.Logger.error('Database health check failed', error);
            return false;
        }
    }
    /**
     * Get the Supabase client for auth operations
     */
    static getSupabaseClient() {
        return SupabaseService_1.SupabaseService.getAnonClient();
    }
    /**
     * Get the Supabase admin client for server-side operations
     */
    static getSupabaseAdmin() {
        return SupabaseService_1.SupabaseService.getAdminClient();
    }
}
exports.DatabaseService = DatabaseService;
//# sourceMappingURL=DatabaseService.js.map