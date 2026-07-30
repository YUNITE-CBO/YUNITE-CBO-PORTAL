/**
 * YUNITE Banking System - Centralized Error Handling
 * All errors flow through this system for consistent API responses
 */
export declare class AppError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly details?: any;
    readonly isOperational: boolean;
    readonly timestamp: Date;
    constructor(message: string, statusCode?: number, code?: string, details?: any, isOperational?: boolean);
}
export declare class ValidationError extends AppError {
    constructor(message?: string, details?: any);
}
export declare class AuthenticationError extends AppError {
    constructor(message?: string);
}
export declare class AuthorizationError extends AppError {
    constructor(message?: string);
}
export declare class NotFoundError extends AppError {
    constructor(resource?: string);
}
export declare class ConflictError extends AppError {
    constructor(message?: string);
}
export declare class BusinessRuleError extends AppError {
    constructor(message: string, details?: any);
}
export declare class InsufficientFundsError extends AppError {
    constructor(message?: string);
}
export declare class DuplicateEntryError extends AppError {
    constructor(message?: string);
}
export declare class AccountFrozenError extends AppError {
    constructor(message?: string);
}
export declare class RateLimitError extends AppError {
    constructor(message?: string);
}
export declare class DatabaseError extends AppError {
    constructor(message?: string, details?: any);
}
export declare class ExternalServiceError extends AppError {
    constructor(service: string, message?: string);
}
//# sourceMappingURL=AppError.d.ts.map