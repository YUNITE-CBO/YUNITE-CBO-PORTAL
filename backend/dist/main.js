"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseStorageService = exports.SupabaseService = exports.eventBus = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const config_1 = require("./config");
const Logger_1 = require("./core/services/Logger");
const errorHandler_1 = require("./interfaces/http/middleware/errorHandler");
const requestLogger_1 = require("./interfaces/http/middleware/requestLogger");
const InMemoryEventBus_1 = require("./events/bus/InMemoryEventBus");
const SupabaseService_1 = require("./core/services/SupabaseService");
Object.defineProperty(exports, "SupabaseService", { enumerable: true, get: function () { return SupabaseService_1.SupabaseService; } });
const SupabaseStorageService_1 = require("./core/services/SupabaseStorageService");
Object.defineProperty(exports, "SupabaseStorageService", { enumerable: true, get: function () { return SupabaseStorageService_1.SupabaseStorageService; } });
const app = (0, express_1.default)();
exports.app = app;
const port = config_1.config.server.port;
// Initialize Event Bus
const eventBus = InMemoryEventBus_1.InMemoryEventBus.getInstance();
exports.eventBus = eventBus;
// Security Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: config_1.config.server.isProduction ? process.env.CORS_ORIGIN : '*',
    credentials: true,
}));
// Rate Limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: config_1.config.rateLimiting.windowMs,
    max: config_1.config.rateLimiting.maxRequests,
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later.',
        },
    },
});
app.use('/api/', limiter);
// Body Parsing
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// Request Logging
app.use(requestLogger_1.requestLogger);
// Health Check
app.get('/health', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: '1.0.0',
            name: 'YUNITE Banking System',
        },
    });
});
// API Routes will be registered here
// app.use('/api/v1/auth', authRouter);
// app.use('/api/v1/organizations', organizationRouter);
// app.use('/api/v1/members', memberRouter);
// app.use('/api/v1/savings', savingsRouter);
// app.use('/api/v1/shares', sharesRouter);
// app.use('/api/v1/loans', loansRouter);
// app.use('/api/v1/fines', finesRouter);
// app.use('/api/v1/projects', projectsRouter);
// app.use('/api/v1/meetings', meetingsRouter);
// app.use('/api/v1/voting', votingRouter);
// app.use('/api/v1/contributions', contributionsRouter);
// app.use('/api/v1/welfare', welfareRouter);
// app.use('/api/v1/unity-fund', unityFundRouter);
// app.use('/api/v1/table-banking', tableBankingRouter);
// app.use('/api/v1/emergency-fund', emergencyFundRouter);
// app.use('/api/v1/notifications', notificationsRouter);
// app.use('/api/v1/documents', documentsRouter);
// app.use('/api/v1/audit-logs', auditLogRouter);
// app.use('/api/v1/dashboard', dashboardRouter);
// app.use('/api/v1/reports', reportsRouter);
// app.use('/api/v1/settings', settingsRouter);
// app.use('/api/v1/ai', aiRouter);
// app.use('/api/v1/help-desk', helpDeskRouter);
// app.use('/api/v1/contracts', contractsRouter);
// app.use('/api/v1/suppliers', suppliersRouter);
// app.use('/api/v1/vendors', vendorsRouter);
// app.use('/api/v1/customers', customersRouter);
// app.use('/api/v1/inventory', inventoryRouter);
// app.use('/api/v1/assets', assetsRouter);
// app.use('/api/v1/budgeting', budgetingRouter);
// app.use('/api/v1/procurement', procurementRouter);
// app.use('/api/v1/payroll', payrollRouter);
// app.use('/api/v1/hr', hrRouter);
// app.use('/api/v1/beneficiaries', beneficiariesRouter);
// app.use('/api/v1/insurance', insuranceRouter);
// app.use('/api/v1/compliance', complianceRouter);
// app.use('/api/v1/risk', riskRouter);
// app.use('/api/v1/fraud', fraudRouter);
// app.use('/api/v1/integrations', integrationsRouter);
// app.use('/api/v1/api-keys', apiKeysRouter);
// app.use('/api/v1/system-monitor', systemMonitorRouter);
// app.use('/api/v1/backup', backupRouter);
// app.use('/api/v1/events', eventsRouter);
// app.use('/api/v1/tasks', tasksRouter);
// app.use('/api/v1/messages', messagesRouter);
// app.use('/api/v1/announcements', announcementsRouter);
// Swagger Documentation
const swaggerDocument = {
    openapi: '3.0.0',
    info: {
        title: 'YUNITE Banking System API',
        version: '1.0.0',
        description: 'Core Banking-inspired Enterprise Operating System for Community-Based Organizations',
        contact: {
            name: 'YUNITE Team',
            email: 'support@yunite.org',
        },
    },
    servers: [
        {
            url: `http://localhost:${port}/api/v1`,
            description: 'Development server',
        },
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
            },
        },
    },
    security: [{ bearerAuth: [] }],
};
app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerDocument));
// Error Handler (must be last)
app.use(errorHandler_1.errorHandler);
// Initialize Supabase
async function initializeSupabase() {
    try {
        await SupabaseService_1.SupabaseService.initialize();
        await SupabaseStorageService_1.SupabaseStorageService.initialize();
    }
    catch (error) {
        Logger_1.Logger.error('Supabase initialization failed, continuing without Supabase', error);
    }
}
// Start Server
app.listen(port, async () => {
    Logger_1.Logger.info(`🚀 YUNITE Banking System started on port ${port}`);
    Logger_1.Logger.info(`📚 API Documentation: http://localhost:${port}/api-docs`);
    Logger_1.Logger.info(`❤️  Health Check: http://localhost:${port}/health`);
    Logger_1.Logger.info(`📊 Environment: ${config_1.config.server.nodeEnv}`);
    // Initialize Supabase (non-blocking - server starts first)
    await initializeSupabase();
});
//# sourceMappingURL=main.js.map