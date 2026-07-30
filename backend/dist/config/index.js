"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
exports.config = {
    server: {
        port: parseInt(process.env.PORT || '3001', 10),
        nodeEnv: process.env.NODE_ENV || 'development',
        isProduction: process.env.NODE_ENV === 'production',
        isDevelopment: process.env.NODE_ENV === 'development',
        isTest: process.env.NODE_ENV === 'test',
    },
    database: {
        url: process.env.DATABASE_URL || 'postgresql://localhost:5432/yunite_banking',
    },
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'super-secret-key-change-in-production',
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-key',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
    encryption: {
        key: process.env.ENCRYPTION_KEY || 'default-encryption-key-32char!',
    },
    email: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
    },
    sms: {
        username: process.env.AFRICASTALKING_USERNAME || '',
        apiKey: process.env.AFRICASTALKING_API_KEY || '',
    },
    mpesa: {
        consumerKey: process.env.MPESA_CONSUMER_KEY || '',
        consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
        passkey: process.env.MPESA_PASSKEY || '',
        shortcode: process.env.MPESA_SHORTCODE || '174379',
    },
    ai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: process.env.AI_MODEL || 'gpt-4',
    },
    supabase: {
        url: process.env.SUPABASE_URL || '',
        anonKey: process.env.SUPABASE_ANON_KEY || '',
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
        jwtSecret: process.env.SUPABASE_JWT_SECRET || '',
    },
    rateLimiting: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    },
    upload: {
        dir: process.env.UPLOAD_DIR || './uploads',
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
    },
};
//# sourceMappingURL=index.js.map