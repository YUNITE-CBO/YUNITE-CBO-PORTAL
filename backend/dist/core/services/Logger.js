"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const logDir = path_1.default.resolve(__dirname, '../../../logs');
class Logger {
    static instance;
    static getLogger() {
        if (!Logger.instance) {
            Logger.instance = winston_1.default.createLogger({
                level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
                format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
                defaultMeta: { service: 'yunite-banking' },
                transports: [
                    new winston_1.default.transports.Console({
                        format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.printf(({ timestamp, level, message, ...meta }) => {
                            const metaStr = Object.keys(meta).length > 1 ? JSON.stringify(meta, null, 2) : '';
                            return `${timestamp} [${level}]: ${message} ${metaStr}`;
                        })),
                    }),
                    new winston_1.default.transports.File({
                        filename: path_1.default.join(logDir, 'error.log'),
                        level: 'error',
                        maxsize: 5242880,
                        maxFiles: 5,
                    }),
                    new winston_1.default.transports.File({
                        filename: path_1.default.join(logDir, 'combined.log'),
                        maxsize: 5242880,
                        maxFiles: 10,
                    }),
                ],
            });
        }
        return Logger.instance;
    }
    static info(message, meta) {
        Logger.getLogger().info(message, meta);
    }
    static error(message, meta) {
        Logger.getLogger().error(message, meta);
    }
    static warn(message, meta) {
        Logger.getLogger().warn(message, meta);
    }
    static debug(message, meta) {
        Logger.getLogger().debug(message, meta);
    }
    static audit(action, userId, resource, resourceId, changes) {
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
exports.Logger = Logger;
//# sourceMappingURL=Logger.js.map