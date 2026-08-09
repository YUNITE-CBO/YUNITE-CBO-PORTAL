/**
 * YUNITE API — Response envelope & helpers
 *
 * One predictable response shape across the gateway:
 *   { success, data?, error?, meta? }
 * `meta.request_id` is always present so any request is traceable.
 */

import { NextResponse } from 'next/server';
import { ApiError, type ApiErrorCode, type ApiErrorDetail } from './error';

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: ApiErrorCode; message: string; details?: ApiErrorDetail[] };
  meta?: { request_id: string; pagination?: PaginationMeta };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export function paginate<T>(items: T[], page: number, limit: number, total: number): { data: T[]; pagination: PaginationMeta } {
  return {
    data: items,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit) || 0,
    },
  };
}

export function success<T>(requestId: string, data: T, status = 200, pagination?: PaginationMeta): NextResponse {
  const body: ApiEnvelope<T> = { success: true, data, meta: { request_id: requestId } };
  if (pagination) body.meta!.pagination = pagination;
  return NextResponse.json(body, { status });
}

export function errorResponse(requestId: string, error: ApiError | Error, statusOverride?: number): NextResponse {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError('server_error', process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message);
  const status = statusOverride ?? apiError.status;
  const body: ApiEnvelope = {
    success: false,
    error: { code: apiError.code, message: apiError.message, details: apiError.details },
    meta: { request_id: requestId },
  };
  return NextResponse.json(body, { status });
}
