import { Request, Response, NextFunction } from 'express';
import { Logger } from '../../../core/services/Logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, path: requestPath, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    const logData = {
      method,
      path: requestPath,
      statusCode,
      duration: `${duration}ms`,
      ip,
      userAgent: req.headers['user-agent'] || 'unknown',
    };

    if (statusCode >= 500) {
      Logger.error(`${method} ${requestPath} ${statusCode}`, logData);
    } else if (statusCode >= 400) {
      Logger.warn(`${method} ${requestPath} ${statusCode}`, logData);
    } else {
      Logger.info(`${method} ${requestPath} ${statusCode}`, logData);
    }
  });

  next();
}