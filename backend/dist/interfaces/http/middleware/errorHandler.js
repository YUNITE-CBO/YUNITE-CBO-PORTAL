"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const AppError_1 = require("../../../common/errors/AppError");
const Logger_1 = require("../../../core/services/Logger");
function errorHandler(err, req, res, next) {
    if (err instanceof AppError_1.AppError) {
        Logger_1.Logger.warn(`AppError: ${err.code} - ${err.message}`, {
            statusCode: err.statusCode,
            path: req.path,
            method: req.method,
            ip: req.ip,
        });
        res.status(err.statusCode).json({
            success: false,
            error: {
                code: err.code,
                message: err.message,
                details: err.details,
                timestamp: err.timestamp,
            },
        });
        return;
    }
    // Handle Prisma errors
    if (err.name === 'PrismaClientKnownRequestError') {
        const prismaErr = err;
        let message = 'Database operation failed';
        let code = 'DATABASE_ERROR';
        if (prismaErr.code === 'P2002') {
            message = 'A record with this value already exists';
            code = 'DUPLICATE_ENTRY';
        }
        else if (prismaErr.code === 'P2025') {
            message = 'Record not found';
            code = 'NOT_FOUND';
        }
        else if (prismaErr.code === 'P2003') {
            message = 'Referenced record does not exist';
            code = 'FOREIGN_KEY_ERROR';
        }
        Logger_1.Logger.error(`PrismaError: ${prismaErr.code} - ${err.message}`, {
            path: req.path,
            method: req.method,
        });
        res.status(409).json({
            success: false,
            error: {
                code,
                message,
                details: prismaErr.meta,
                timestamp: new Date(),
            },
        });
        return;
    }
    // Handle JSON parse errors
    if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({
            success: false,
            error: {
                code: 'INVALID_JSON',
                message: 'Invalid JSON in request body',
                timestamp: new Date(),
            },
        });
        return;
    }
    // Handle JWT errors
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        res.status(401).json({
            success: false,
            error: {
                code: 'INVALID_TOKEN',
                message: err.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token',
                timestamp: new Date(),
            },
        });
        return;
    }
    // Unknown errors
    Logger_1.Logger.error(`Unhandled Error: ${err.message}`, {
        stack: err.stack,
        path: req.path,
        method: req.method,
    });
    res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
            timestamp: new Date(),
        },
    });
}
//# sourceMappingURL=errorHandler.js.map