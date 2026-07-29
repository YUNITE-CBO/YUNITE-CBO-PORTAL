import winston from 'winston';
import path from 'path';

const logDir = path.resolve(__dirname, '../../../logs');

export class Logger {
  private static instance: winston.Logger;

  private static getLogger(): winston.Logger {
    if (!Logger.instance) {
      Logger.instance = winston.createLogger({
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
        defaultMeta: { service: 'yunite-banking' },
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.printf(({ timestamp, level, message, ...meta }) => {
                const metaStr = Object.keys(meta).length > 1 ? JSON.stringify(meta, null, 2) : '';
                return `${timestamp} [${level}]: ${message} ${metaStr}`;
              })
            ),
          }),
          new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 5242880,
            maxFiles: 5,
          }),
          new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: 5242880,
            maxFiles: 10,
          }),
        ],
      });
    }
    return Logger.instance;
  }

  static info(message: string, meta?: any): void {
    Logger.getLogger().info(message, meta);
  }

  static error(message: string, meta?: any): void {
    Logger.getLogger().error(message, meta);
  }

  static warn(message: string, meta?: any): void {
    Logger.getLogger().warn(message, meta);
  }

  static debug(message: string, meta?: any): void {
    Logger.getLogger().debug(message, meta);
  }

  static audit(action: string, userId: string, resource: string, resourceId: string, changes?: any): void {
    Logger.getLogger().info('AUDIT_TRAIL', {
      audit: true,
      action,
      userId,
      resource,
      resourceId,
      changes,
      timestamp: new Date().toISOString(),
    });
  }
}