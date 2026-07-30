export declare const config: {
    server: {
        port: number;
        nodeEnv: string;
        isProduction: boolean;
        isDevelopment: boolean;
        isTest: boolean;
    };
    database: {
        url: string;
    };
    redis: {
        url: string;
    };
    jwt: {
        secret: string;
        expiresIn: string;
        refreshSecret: string;
        refreshExpiresIn: string;
    };
    encryption: {
        key: string;
    };
    email: {
        host: string;
        port: number;
        user: string;
        pass: string;
    };
    sms: {
        username: string;
        apiKey: string;
    };
    mpesa: {
        consumerKey: string;
        consumerSecret: string;
        passkey: string;
        shortcode: string;
    };
    ai: {
        apiKey: string;
        model: string;
    };
    supabase: {
        url: string;
        anonKey: string;
        serviceRoleKey: string;
        publishableKey: string;
        jwtSecret: string;
    };
    rateLimiting: {
        windowMs: number;
        maxRequests: number;
    };
    upload: {
        dir: string;
        maxFileSize: number;
    };
};
//# sourceMappingURL=index.d.ts.map