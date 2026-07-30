"use strict";
/**
 * YUNITE Banking System - Centralized Error Handling
 * All errors flow through this system for consistent API responses
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalServiceError = exports.DatabaseError = exports.RateLimitError = exports.AccountFrozenError = exports.DuplicateEntryError = exports.InsufficientFundsError = exports.BusinessRuleError = exports.ConflictError = exports.NotFoundError = exports.AuthorizationError = exports.AuthenticationError = exports.ValidationError = exports.AppError = void 0;
class AppError extends Error {
    statusCode;
    code;
    details;
    isOperational;
    timestamp;
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details, isOperational = true) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = isOperational;
        this.timestamp = new Date();
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
class ValidationError extends AppError {
    constructor(message = 'Validation failed', details) {
        super(message, 400, 'VALIDATION_ERROR', details);
    }
}
exports.ValidationError = ValidationError;
class AuthenticationError extends AppError {
    constructor(message = 'Authentication failed') {
        super(message, 401, 'AUTHENTICATION_ERROR');
    }
}
exports.AuthenticationError = AuthenticationError;
class AuthorizationError extends AppError {
    constructor(message = 'Access denied') {
        super(message, 403, 'AUTHORIZATION_ERROR');
    }
}
exports.AuthorizationError = AuthorizationError;
class NotFoundError extends AppError {
    constructor(resource = 'Resource') {
        super(`${resource} not found`, 404, 'NOT_FOUND');
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends AppError {
    constructor(message = 'Resource already exists') {
        super(message, 409, 'CONFLICT');
    }
}
exports.ConflictError = ConflictError;
class BusinessRuleError extends AppError {
    constructor(message, details) {
        super(message, 422, 'BUSINESS_RULE_VIOLATION', details);
    }
}
exports.BusinessRuleError = BusinessRuleError;
class InsufficientFundsError extends AppError {
    constructor(message = 'Insufficient funds') {
        super(message, 422, 'INSUFFICIENT_FUNDS');
    }
}
exports.InsufficientFundsError = InsufficientFundsError;
class DuplicateEntryError extends AppError {
    constructor(message = 'Duplicate entry') {
        super(message, 409, 'DUPLICATE_ENTRY');
    }
}
exports.DuplicateEntryError = DuplicateEntryError;
class AccountFrozenError extends AppError {
    constructor(message = 'Account is frozen or inactive') {
        super(message, 423, 'ACCOUNT_FROZEN');
    }
}
exports.AccountFrozenError = AccountFrozenError;
class RateLimitError extends AppError {
    constructor(message = 'Too many requests') {
        super(message, 429, 'RATE_LIMIT_EXCEEDED');
    }
}
exports.RateLimitError = RateLimitError;
class DatabaseError extends AppError {
    constructor(message = 'Database operation failed', details) {
        super(message, 500, 'DATABASE_ERROR', details, false);
    }
}
exports.DatabaseError = DatabaseError;
class ExternalServiceError extends AppError {
    constructor(service, message = 'External service error') {
        super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
    }
}
exports.ExternalServiceError = ExternalServiceError;
//# sourceMappingURL=AppError.js.map