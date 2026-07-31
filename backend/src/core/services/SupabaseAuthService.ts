import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from './SupabaseService';
import { Logger } from './Logger';
import { AuthenticationError, DatabaseError } from '../../common/errors/AppError';

export interface SupabaseAuthUser {
  id: string;
  email?: string;
  phone?: string;
  role?: string;
  organizationId?: string;
}

export class SupabaseAuthService {
  private static client: SupabaseClient;

  private static getClient(): SupabaseClient {
    if (!SupabaseAuthService.client) {
      SupabaseAuthService.client = SupabaseService.getAdminClient();
    }
    return SupabaseAuthService.client;
  }

  public static async signInWithPassword(email: string, password: string): Promise<{ access_token: string; user: any }> {
    const { data, error } = await SupabaseService.getAnonClient().auth.signInWithPassword({ email, password });
    if (error) {
      Logger.error('Supabase password sign-in failed', error);
      throw new AuthenticationError(error.message);
    }
    return { access_token: data.session?.access_token ?? '', user: data.user };
  }

  public static async signInWithOtp(email: string): Promise<void> {
    const { error } = await SupabaseService.getAnonClient().auth.signInWithOtp({ email });
    if (error) {
      Logger.error('Supabase magic link sign-in failed', error);
      throw new AuthenticationError(error.message);
    }
  }

  public static async verifyJwt(token: string): Promise<any> {
    const { data, error } = await SupabaseService.getAnonClient().auth.getUser(token);
    if (error || !data.user) {
      Logger.error('Supabase JWT verification failed', error);
      throw new AuthenticationError('Invalid or expired token');
    }
    return data.user;
  }

  public static async getUserById(userId: string): Promise<SupabaseAuthUser | null> {
    const client = SupabaseAuthService.getClient();
    const { data, error } = await client.auth.admin.getUserById(userId);
    if (error) {
      Logger.error(`Failed to fetch auth user ${userId}`, error);
      throw new DatabaseError('Unable to fetch auth user', error);
    }
    return {
      id: data.user.id,
      email: data.user.email,
      phone: data.user.phone,
      role: data.user.role,
    } as SupabaseAuthUser;
  }
}
