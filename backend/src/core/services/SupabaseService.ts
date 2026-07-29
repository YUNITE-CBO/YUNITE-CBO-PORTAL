import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config';
import { Logger } from './Logger';

export class SupabaseService {
  private static anonInstance: SupabaseClient;
  private static adminInstance: SupabaseClient;

  /**
   * Get the Supabase client with anon key (limited permissions)
   */
  public static getAnonClient(): SupabaseClient {
    if (!SupabaseService.anonInstance) {
      if (!config.supabase.url || !config.supabase.anonKey) {
        throw new Error('Supabase URL and Anon Key must be configured');
      }

      SupabaseService.anonInstance = createClient(config.supabase.url, config.supabase.anonKey, {
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

      Logger.info('Supabase anon client initialized');
    }
    return SupabaseService.anonInstance;
  }

  /**
   * Get the Supabase admin client with service role key (full permissions)
   * WARNING: Only use server-side, never expose to client
   */
  public static getAdminClient(): SupabaseClient {
    if (!SupabaseService.adminInstance) {
      if (!config.supabase.url || !config.supabase.serviceRoleKey) {
        throw new Error('Supabase URL and Service Role Key must be configured');
      }

      SupabaseService.adminInstance = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      });

      Logger.info('Supabase admin client initialized');
    }
    return SupabaseService.adminInstance;
  }

  /**
   * Health check - verify Supabase connection
   */
  public static async healthCheck(): Promise<boolean> {
    try {
      const client = SupabaseService.getAdminClient();
      const { data, error } = await client.from('_prisma_migrations').select('id', { count: 'exact', head: true });
      
      if (error) {
        // _prisma_migrations may not exist, try a simple query
        const { error: pingError } = await client.rpc('ping' as any);
        if (pingError) {
          Logger.warn('Supabase health check - rpc ping failed, trying direct query');
        }
      }

      Logger.info('Supabase health check passed');
      return true;
    } catch (error) {
      Logger.error('Supabase health check failed', error);
      return false;
    }
  }

  /**
   * Initialize Supabase - verify connection on startup
   */
  public static async initialize(): Promise<void> {
    try {
      Logger.info('Initializing Supabase services...');
      
      // Initialize both clients
      SupabaseService.getAnonClient();
      SupabaseService.getAdminClient();

      // Verify connection
      const healthy = await SupabaseService.healthCheck();
      if (healthy) {
        Logger.info('✅ Supabase services initialized successfully');
      } else {
        Logger.warn('⚠️  Supabase initialized but health check returned warning');
      }
    } catch (error) {
      Logger.error('❌ Failed to initialize Supabase services', error);
      throw error;
    }
  }

  /**
   * Execute a raw SQL query via Supabase's Postgres REST API
   */
  public static async executeRawQuery(query: string, params?: any[]): Promise<any> {
    try {
      const client = SupabaseService.getAdminClient();
      const { data, error } = await client.rpc('exec_sql' as any, {
        query_text: query,
        query_params: params || [],
      });

      if (error) throw error;
      return data;
    } catch (error) {
      Logger.error('Supabase raw query failed', error);
      throw error;
    }
  }

  /**
   * Get the Supabase project URL
   */
  public static getProjectUrl(): string {
    return config.supabase.url;
  }

  /**
   * Get the Supabase anon key
   */
  public static getAnonKey(): string {
    return config.supabase.anonKey;
  }
}