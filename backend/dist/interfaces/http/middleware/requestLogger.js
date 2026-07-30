"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = requestLogger;
const Logger_1 = require("../../../core/services/Logger");
function requestLogger(req, res, next) {
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
            Logger_1.Logger.error(`${method} ${requestPath} ${statusCode}`, logData);
        }
        else if (statusCode >= 400) {
            Logger_1.Logger.warn(`${method} ${requestPath} ${statusCode}`, logData);
        }
        else {
            Logger_1.Logger.info(`${method} ${requestPath} ${statusCode}`, logData);
        }
    });
    next();
}
//# sourceMappingURL=requestLogger.js.map