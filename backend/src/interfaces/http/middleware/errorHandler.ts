import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../common/errors/AppError';
import { Logger } from '../../../core/services/Logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof AppError) {
    Logger.warn(`AppError: ${err.code} - ${err.message}`, {
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
    const prismaErr = err as any;
    let message = 'Database operation failed';
    let code = 'DATABASE_ERROR';

    if (prismaErr.code === 'P2002') {
      message = 'A record with this value already exists';
      code = 'DUPLICATE_ENTRY';
    } else if (prismaErr.code === 'P2025') {
      message = 'Record not found';
      code = 'NOT_FOUND';
    } else if (prismaErr.code === 'P2003') {
      message = 'Referenced record does not exist';
      code = 'FOREIGN_KEY_ERROR';
    }

    Logger.error(`PrismaError: ${prismaErr.code} - ${err.message}`, {
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
  Logger.error(`Unhandled Error: ${err.message}`, {
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