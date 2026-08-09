/**
 * YUNITE API — Consistent Error System
 *
 * Every gateway response uses one envelope and one set of error codes so
 * consuming applications never have to interpret dozens of formats.
 */

export type ApiErrorCode =
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'method_not_allowed'
  | 'client_inactive'
  | 'endpoint_disabled'
  | 'server_error'
  | 'service_unavailable';

export const HTTP_STATUS: Record<ApiErrorCode, number> = {
  validation_error: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  rate_limited: 429,
  client_inactive: 403,
  endpoint_disabled: 404,
  server_error: 500,
  service_unavailable: 503,
};

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: ApiErrorDetail[];

  constructor(code: ApiErrorCode, message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.details = details;
  }

  static validation(message: string, details?: ApiErrorDetail[]): ApiError {
    return new ApiError('validation_error', message, details);
  }
  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError('unauthorized', message);
  }
  static forbidden(message = 'Insufficient permissions'): ApiError {
    return new ApiError('forbidden', message);
  }
  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError('not_found', message);
  }
  static conflict(message: string): ApiError {
    return new ApiError('conflict', message);
  }
  static rateLimited(message = 'Rate limit exceeded'): ApiError {
    return new ApiError('rate_limited', message);
  }
  static methodNotAllowed(message = 'Method not allowed'): ApiError {
    return new ApiError('method_not_allowed', message);
  }
  static server(message = 'Internal server error'): ApiError {
    return new ApiError('server_error', message);
  }
  static unavailable(message = 'Service unavailable'): ApiError {
    return new ApiError('service_unavailable', message);
  }
}
