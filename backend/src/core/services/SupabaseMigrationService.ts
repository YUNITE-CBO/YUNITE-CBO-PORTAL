import { Logger } from './Logger';
import { SupabaseService } from './SupabaseService';

export class SupabaseMigrationService {
  public static async applyMigrations(): Promise<void> {
    try {
      const client = SupabaseService.getAdminClient();
      const queries = [
        `create table if not exists public.supabase_health_checks (id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), status text not null);`,
        `create index if not exists idx_supabase_health_checks_created_at on public.supabase_health_checks (created_at);`,
      ];

      for (const query of queries) {
        const { error } = await client.rpc('exec_sql' as any, { query_text: query, query_params: [] });
        if (error) {
          Logger.warn(`Migration query skipped: ${error.message}`);
        }
      }

      Logger.info('Supabase migration scaffolding applied');
    } catch (error) {
      Logger.error('Supabase migration scaffolding failed', error);
    }
  }
}
