import { PrismaClient } from '@prisma/client';
import { Logger } from './Logger';
import { SupabaseService } from './SupabaseService';

export class DatabaseService {
  private static instance: PrismaClient;

  public static getInstance(): PrismaClient {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new PrismaClient({
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

  public static async connect(): Promise<void> {
    try {
      await DatabaseService.getInstance().$connect();
      Logger.info('Database connected successfully via Prisma (Supabase Postgres)');
      
      // Also initialize Supabase client (non-blocking, for auth/storage features)
      try {
        SupabaseService.getAdminClient();
        Logger.info('Supabase admin client ready');
      } catch (supabaseError) {
        Logger.warn('Supabase client initialization deferred', supabaseError);
      }
    } catch (error) {
      Logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  public static async disconnect(): Promise<void> {
    await DatabaseService.getInstance().$disconnect();
    Logger.info('Database disconnected');
  }

  public static async healthCheck(): Promise<boolean> {
    try {
      await DatabaseService.getInstance().$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      Logger.error('Database health check failed', error);
      return false;
    }
  }

  /**
   * Get the Supabase client for auth operations
   */
  public static getSupabaseClient() {
    return SupabaseService.getAnonClient();
  }

  /**
   * Get the Supabase admin client for server-side operations
   */
  public static getSupabaseAdmin() {
    return SupabaseService.getAdminClient();
  }
}
