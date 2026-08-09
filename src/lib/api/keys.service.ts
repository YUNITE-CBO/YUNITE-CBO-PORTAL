/**
 * YUNITE API — API key & client management service
 *
 * Generates, stores (hashed), revokes, and rotates API keys, and manages
 * API clients and their permission scopes. Raw keys are shown exactly once
 * at generation time and never persisted or logged.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { hashApiKey } from './principal';
import { ApiError } from './error';

export interface ApiClientRecord {
  id: string;
  name: string;
  slug: string;
  client_type: 'admin_portal' | 'lookup' | 'mobile' | 'third_party';
  status: 'active' | 'inactive' | 'suspended';
  description: string | null;
  default_tier: 'public' | 'standard' | 'privileged';
  created_at: string;
  created_by: string | null;
}

export interface ApiKeyRecord {
  id: string;
  client_id: string;
  name: string;
  key_prefix: string;
  status: 'active' | 'revoked' | 'expired' | 'rotating';
  environment: 'live' | 'test';
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  created_at: string;
  created_by: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
}

export interface GeneratedKey extends ApiKeyRecord {
  /** The raw key — shown ONCE to the caller, never retrievable again. */
  key: string;
}

const KEY_PREFIX = 'yk_live_';
const TEST_KEY_PREFIX = 'yk_test_';

function randomToken(bytes: number): string {
  const { randomBytes } = require('crypto') as typeof import('crypto');
  return randomBytes(bytes).toString('hex');
}

export class ApiKeyService {
  async listClients(): Promise<ApiClientRecord[]> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('api_clients')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw ApiError.server(error.message);
    return (data ?? []) as ApiClientRecord[];
  }

  async getClient(id: string): Promise<ApiClientRecord> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('api_clients')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw ApiError.server(error.message);
    if (!data) throw ApiError.notFound('API client not found');
    return data as ApiClientRecord;
  }

  async createClient(
    input: { name: string; slug: string; client_type?: ApiClientRecord['client_type']; description?: string; default_tier?: ApiClientRecord['default_tier'] },
    createdBy?: string
  ): Promise<ApiClientRecord> {
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!slug) throw ApiError.validation('slug is required');
    if (slug === 'admin-portal') throw ApiError.conflict('Reserved client slug');

    const supabase = await createServiceClient();
    const { data: existing } = await supabase.from('api_clients').select('id').eq('slug', slug).maybeSingle();
    if (existing) throw ApiError.conflict('A client with that slug already exists');

    const { data, error } = await supabase
      .from('api_clients')
      .insert({
        name: input.name.trim(),
        slug,
        client_type: input.client_type ?? 'third_party',
        description: input.description ?? null,
        default_tier: input.default_tier ?? 'standard',
        created_by: createdBy ?? null,
      })
      .select('*')
      .single();
    if (error) throw ApiError.server(error.message);
    return data as ApiClientRecord;
  }

  async updateClient(
    id: string,
    input: Partial<Pick<ApiClientRecord, 'name' | 'status' | 'description' | 'default_tier'>> & { deactivated_at?: string | null }
  ): Promise<ApiClientRecord> {
    const supabase = await createServiceClient();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.status !== undefined) {
      patch.status = input.status;
      patch.deactivated_at = input.status === 'inactive' || input.status === 'suspended' ? new Date().toISOString() : null;
    }
    if (input.description !== undefined) patch.description = input.description;
    if (input.default_tier !== undefined) patch.default_tier = input.default_tier;

    const { data, error } = await supabase.from('api_clients').update(patch).eq('id', id).select('*').maybeSingle();
    if (error) throw ApiError.server(error.message);
    if (!data) throw ApiError.notFound('API client not found');
    return data as ApiClientRecord;
  }

  async setClientPermissions(clientId: string, permissions: { module: string; action: string }[]): Promise<void> {
    const supabase = await createServiceClient();
    // Replace all scopes atomically.
    const { error: delErr } = await supabase.from('api_client_permissions').delete().eq('client_id', clientId);
    if (delErr) throw ApiError.server(delErr.message);
    if (permissions.length) {
      const rows = permissions.map((p) => ({ client_id: clientId, module: p.module, action: p.action }));
      const { error: insErr } = await supabase.from('api_client_permissions').insert(rows);
      if (insErr) throw ApiError.server(insErr.message);
    }
  }

  async getClientPermissions(clientId: string): Promise<{ module: string; action: string }[]> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('api_client_permissions')
      .select('module, action')
      .eq('client_id', clientId);
    if (error) throw ApiError.server(error.message);
    return (data ?? []) as { module: string; action: string }[];
  }

  async listKeys(clientId?: string): Promise<ApiKeyRecord[]> {
    const supabase = await createServiceClient();
    let q = supabase.from('api_keys').select('*').order('created_at', { ascending: false });
    if (clientId) q = q.eq('client_id', clientId);
    const { data, error } = await q;
    if (error) throw ApiError.server(error.message);
    return (data ?? []) as ApiKeyRecord[];
  }

  /**
   * Generate a new API key. The raw key is returned exactly once.
   * Only the hash, prefix, and metadata are persisted.
   */
  async generateKey(
    input: { client_id: string; name: string; environment?: 'live' | 'test'; expires_at?: string },
    createdBy?: string
  ): Promise<GeneratedKey> {
    const client = await this.getClient(input.client_id);
    if (client.status !== 'active') throw ApiError.conflict('Client is not active');

    const environment = input.environment ?? 'live';
    const prefix = environment === 'test' ? TEST_KEY_PREFIX : KEY_PREFIX;
    const rawKey = `${prefix}${randomToken(24)}`;
    const keyHash = await hashApiKey(rawKey);
    const keyPrefix = `${rawKey.slice(0, 12)}…`;

    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        client_id: input.client_id,
        name: input.name.trim(),
        key_prefix: keyPrefix,
        key_hash: keyHash,
        status: 'active',
        environment,
        expires_at: input.expires_at ?? null,
        created_by: createdBy ?? null,
      })
      .select('*')
      .single();
    if (error) throw ApiError.server(error.message);

    return { ...(data as ApiKeyRecord), key: rawKey };
  }

  async revokeKey(keyId: string, revokedBy?: string, reason?: string): Promise<ApiKeyRecord> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('api_keys')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by: revokedBy ?? null,
        revoke_reason: reason ?? null,
      })
      .eq('id', keyId)
      .select('*')
      .maybeSingle();
    if (error) throw ApiError.server(error.message);
    if (!data) throw ApiError.notFound('API key not found');
    return data as ApiKeyRecord;
  }
}

export const apiKeyService = new ApiKeyService();
