import { SupabaseClient, PostgrestResponse } from '@supabase/supabase-js';
import { SupabaseService } from './SupabaseService';
import { Logger } from './Logger';
import { DatabaseError } from '../../common/errors/AppError';

export interface ListQueryOptions {
  select?: string;
  filters?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  orderBy?: { column: string; ascending?: boolean };
  count?: 'exact' | 'planned' | 'estimated';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class SupabaseDatabaseService {
  private static instance: SupabaseDatabaseService;

  public static getInstance(): SupabaseDatabaseService {
    if (!SupabaseDatabaseService.instance) {
      SupabaseDatabaseService.instance = new SupabaseDatabaseService();
    }
    return SupabaseDatabaseService.instance;
  }

  public async list<T>(table: string, options: ListQueryOptions = {}): Promise<T[]> {
    const client = SupabaseService.getAdminClient();
    let query = client.from(table).select(options.select ?? '*');

    if (options.filters) {
      Object.entries(options.filters).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          return;
        }

        if (Array.isArray(value)) {
          query = query.in(key, value as unknown as string[]);
        } else if (typeof value === 'object' && value !== null) {
          // Handle operators like { gt: 100, lt: 200 }
          const op = value as Record<string, unknown>;
          if (op.gt !== undefined) query = query.gt(key, op.gt as never);
          if (op.gte !== undefined) query = query.gte(key, op.gte as never);
          if (op.lt !== undefined) query = query.lt(key, op.lt as never);
          if (op.lte !== undefined) query = query.lte(key, op.lte as never);
          if (op.neq !== undefined) query = query.neq(key, op.neq as never);
          if (op.like !== undefined) query = query.like(key, op.like as string);
          if (op.ilike !== undefined) query = query.ilike(key, op.ilike as string);
          if (op.is !== undefined) query = query.is(key, op.is as never);
        } else {
          query = query.eq(key, value as never);
        }
      });
    }

    if (options.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending ?? true,
      });
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);
    }

    const { data, error } = await query;
    if (error) {
      Logger.error(`Supabase list failed for ${table}`, error);
      throw new DatabaseError(`Unable to list records from ${table}`, error);
    }

    return (data as T[]) || [];
  }

  public async listPaginated<T>(
    table: string,
    options: ListQueryOptions = {},
    page: number = 1,
    pageSize: number = 50
  ): Promise<PaginatedResult<T>> {
    const client = SupabaseService.getAdminClient();
    const offset = (page - 1) * pageSize;

    // Get total count
    let countQuery = client.from(table).select('*', { count: 'exact', head: true });
    let dataQuery = client.from(table).select(options.select ?? '*');

    if (options.filters) {
      Object.entries(options.filters).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (Array.isArray(value)) {
          countQuery = countQuery.in(key, value as unknown as string[]);
          dataQuery = dataQuery.in(key, value as unknown as string[]);
        } else if (typeof value === 'object' && value !== null) {
          const op = value as Record<string, unknown>;
          if (op.gt !== undefined) { countQuery = countQuery.gt(key, op.gt as never); dataQuery = dataQuery.gt(key, op.gt as never); }
          if (op.gte !== undefined) { countQuery = countQuery.gte(key, op.gte as never); dataQuery = dataQuery.gte(key, op.gte as never); }
          if (op.lt !== undefined) { countQuery = countQuery.lt(key, op.lt as never); dataQuery = dataQuery.lt(key, op.lt as never); }
          if (op.lte !== undefined) { countQuery = countQuery.lte(key, op.lte as never); dataQuery = dataQuery.lte(key, op.lte as never); }
          if (op.neq !== undefined) { countQuery = countQuery.neq(key, op.neq as never); dataQuery = dataQuery.neq(key, op.neq as never); }
          if (op.like !== undefined) { countQuery = countQuery.like(key, op.like as string); dataQuery = dataQuery.like(key, op.like as string); }
          if (op.ilike !== undefined) { countQuery = countQuery.ilike(key, op.ilike as string); dataQuery = dataQuery.ilike(key, op.ilike as string); }
        } else {
          countQuery = countQuery.eq(key, value as never);
          dataQuery = dataQuery.eq(key, value as never);
        }
      });
    }

    if (options.orderBy) {
      dataQuery = dataQuery.order(options.orderBy.column, {
        ascending: options.orderBy.ascending ?? true,
      });
    }

    dataQuery = dataQuery.range(offset, offset + pageSize - 1);

    const [{ count, error: countError }, { data, error: dataError }] = await Promise.all([
      countQuery,
      dataQuery,
    ]);

    if (countError) {
      Logger.error(`Supabase paginated count failed for ${table}`, countError);
      throw new DatabaseError(`Unable to count records from ${table}`, countError);
    }

    if (dataError) {
      Logger.error(`Supabase paginated list failed for ${table}`, dataError);
      throw new DatabaseError(`Unable to list records from ${table}`, dataError);
    }

    return {
      data: (data as T[]) || [],
      total: count ?? 0,
      page,
      pageSize,
      totalPages: count ? Math.ceil(count / pageSize) : 0,
    };
  }

  public async getById<T>(table: string, id: string, select = '*'): Promise<T | null> {
    const client = SupabaseService.getAdminClient();
    const { data, error } = await client.from(table).select(select).eq('id', id).single();

    if (error && error.code !== 'PGRST116') {
      Logger.error(`Supabase getById failed for ${table}/${id}`, error);
      throw new DatabaseError(`Unable to fetch ${table} record`, error);
    }

    return (data as T) || null;
  }

  public async getByField<T>(table: string, field: string, value: unknown, select = '*'): Promise<T | null> {
    const client = SupabaseService.getAdminClient();
    const { data, error } = await client.from(table).select(select).eq(field, value as never).single();

    if (error && error.code !== 'PGRST116') {
      Logger.error(`Supabase getByField failed for ${table}/${field}`, error);
      throw new DatabaseError(`Unable to fetch ${table} record`, error);
    }

    return (data as T) || null;
  }

  public async create<T>(table: string, payload: Record<string, unknown>): Promise<T> {
    const client = SupabaseService.getAdminClient();
    const { data, error } = await client.from(table).insert(payload).select('*').single();

    if (error) {
      Logger.error(`Supabase create failed for ${table}`, error);
      throw new DatabaseError(`Unable to create record in ${table}`, error);
    }

    return data as T;
  }

  public async createMany<T>(table: string, payloads: Record<string, unknown>[]): Promise<T[]> {
    const client = SupabaseService.getAdminClient();
    const { data, error } = await client.from(table).insert(payloads).select('*');

    if (error) {
      Logger.error(`Supabase createMany failed for ${table}`, error);
      throw new DatabaseError(`Unable to create records in ${table}`, error);
    }

    return (data as T[]) || [];
  }

  public async update<T>(table: string, id: string, payload: Record<string, unknown>): Promise<T> {
    const client = SupabaseService.getAdminClient();
    const { data, error } = await client.from(table).update(payload).eq('id', id).select('*').single();

    if (error) {
      Logger.error(`Supabase update failed for ${table}/${id}`, error);
      throw new DatabaseError(`Unable to update record in ${table}`, error);
    }

    return data as T;
  }

  public async updateByField<T>(table: string, field: string, value: unknown, payload: Record<string, unknown>): Promise<T[]> {
    const client = SupabaseService.getAdminClient();
    const { data, error } = await client.from(table).update(payload).eq(field, value as never).select('*');

    if (error) {
      Logger.error(`Supabase updateByField failed for ${table}/${field}`, error);
      throw new DatabaseError(`Unable to update records in ${table}`, error);
    }

    return (data as T[]) || [];
  }

  public async delete(table: string, id: string): Promise<void> {
    const client = SupabaseService.getAdminClient();
    const { error } = await client.from(table).delete().eq('id', id);

    if (error) {
      Logger.error(`Supabase delete failed for ${table}/${id}`, error);
      throw new DatabaseError(`Unable to delete record from ${table}`, error);
    }
  }

  public async deleteByField(table: string, field: string, value: unknown): Promise<void> {
    const client = SupabaseService.getAdminClient();
    const { error } = await client.from(table).delete().eq(field, value as never);

    if (error) {
      Logger.error(`Supabase deleteByField failed for ${table}/${field}`, error);
      throw new DatabaseError(`Unable to delete records from ${table}`, error);
    }
  }

  public async softDelete(table: string, id: string): Promise<void> {
    const client = SupabaseService.getAdminClient();
    const { error } = await client.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id);

    if (error) {
      Logger.error(`Supabase softDelete failed for ${table}/${id}`, error);
      throw new DatabaseError(`Unable to soft delete record from ${table}`, error);
    }
  }

  public async upsert<T>(table: string, payload: Record<string, unknown>, uniqueKey = 'id'): Promise<T> {
    const client = SupabaseService.getAdminClient();
    const { data, error } = await client.from(table).upsert(payload, { onConflict: uniqueKey }).select('*').single();

    if (error) {
      Logger.error(`Supabase upsert failed for ${table}`, error);
      throw new DatabaseError(`Unable to upsert record in ${table}`, error);
    }

    return data as T;
  }

  public async count(table: string, filters: Record<string, unknown> = {}): Promise<number> {
    const client = SupabaseService.getAdminClient();
    let query = client.from(table).select('*', { count: 'exact', head: true });

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value as never);
      }
    });

    const { count, error } = await query;
    if (error) {
      Logger.error(`Supabase count failed for ${table}`, error);
      throw new DatabaseError(`Unable to count records in ${table}`, error);
    }

    return count ?? 0;
  }

  public async exists(table: string, field: string, value: unknown): Promise<boolean> {
    const client = SupabaseService.getAdminClient();
    const { data, error } = await client.from(table).select('id', { count: 'exact', head: true }).eq(field, value as never);

    if (error) {
      Logger.error(`Supabase exists check failed for ${table}`, error);
      throw new DatabaseError(`Unable to check existence in ${table}`, error);
    }

    return (data ?? []).length > 0;
  }

  public async sum(table: string, column: string, filters: Record<string, unknown> = {}): Promise<number> {
    const client = SupabaseService.getAdminClient();
    let query = client.from(table).select(column);

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value as never);
      }
    });

    const { data, error } = await query;
    if (error) {
      Logger.error(`Supabase sum failed for ${table}`, error);
      throw new DatabaseError(`Unable to sum column in ${table}`, error);
    }

    const sum = (data as any[] || []).reduce((acc: number, row: any) => acc + Number(row[column] || 0), 0);
    return sum;
  }

  /**
   * Execute a raw SQL query using the Supabase rpc function
   */
  public async executeRawQuery(query: string, params?: any[]): Promise<any> {
    try {
      const client = SupabaseService.getAdminClient();
      const { data, error } = await client.rpc('exec_sql', {
        query_text: query,
        query_params: params || [],
      });

      if (error) throw error;
      return data;
    } catch (error) {
      Logger.error('Supabase raw query failed', { query: query.substring(0, 100) });
      throw new DatabaseError('Raw query execution failed', error);
    }
  }

  /**
   * Execute a function/procedure via RPC
   */
  public async rpc<T>(fn: string, params: Record<string, unknown> = {}): Promise<T> {
    const client = SupabaseService.getAdminClient();
    const { data, error } = await client.rpc(fn, params);

    if (error) {
      Logger.error(`Supabase RPC failed for ${fn}`, error);
      throw new DatabaseError(`RPC execution failed: ${fn}`, error);
    }

    return data as T;
  }
}