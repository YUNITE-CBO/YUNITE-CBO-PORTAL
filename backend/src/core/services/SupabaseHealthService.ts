import { SupabaseService } from './SupabaseService';
import { SupabaseStorageService } from './SupabaseStorageService';
import { SupabaseAuthService } from './SupabaseAuthService';
import { Logger } from './Logger';

export class SupabaseHealthService {
  public static async getStatus(): Promise<Record<string, unknown>> {
    const checks = await Promise.allSettled([
      SupabaseService.initialize(),
      SupabaseStorageService.initialize(),
      SupabaseAuthService.verifyJwt('health-check-token').catch(() => false),
    ]);

    return {
      database: checks[0].status === 'fulfilled' ? 'ok' : 'error',
      storage: checks[1].status === 'fulfilled' ? 'ok' : 'error',
      auth: checks[2].status === 'fulfilled' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
    };
  }
}
