import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { config, validateConfig } from './config';
import { Logger } from './core/services/Logger';
import { SupabaseHealthService } from './core/services/SupabaseHealthService';
import { SupabaseMigrationService } from './core/services/SupabaseMigrationService';
import { errorHandler } from './interfaces/http/middleware/errorHandler';
import { requestLogger } from './interfaces/http/middleware/requestLogger';
import { InMemoryEventBus } from './events/bus/InMemoryEventBus';
import { SupabaseService } from './core/services/SupabaseService';
import { SupabaseStorageService } from './core/services/SupabaseStorageService';
import authRouter from './modules/auth/authRoutes';

const app = express();
const port = config.server.port;

// Initialize Event Bus
const eventBus = InMemoryEventBus.getInstance();

// Security Middleware
app.use(helmet());
app.use(cors({
  origin: config.server.isProduction ? process.env.CORS_ORIGIN : '*',
  credentials: true,
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.maxRequests,
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request Logging
app.use(requestLogger);

// Health Check
app.get('/health', async (req, res) => {
  const status = await SupabaseHealthService.getStatus();

  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      name: 'YUNITE Banking System',
      integrations: status,
    },
  });
});

// API Routes will be registered here
app.use('/api/v1/auth', authRouter);

app.get('/api/v1/integrations/supabase', async (_req, res) => {
  res.json({
    success: true,
    data: {
      message: 'Supabase is configured as the primary backend data source',
      services: ['database', 'auth', 'storage', 'realtime', 'health'],
    },
  });
});
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

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Error Handler (must be last)
app.use(errorHandler);

// Initialize Supabase
async function initializeSupabase(): Promise<void> {
  try {
    validateConfig();
    await SupabaseService.initialize();
    await SupabaseStorageService.initialize();
    await SupabaseMigrationService.applyMigrations();
  } catch (error) {
    Logger.error('Supabase initialization failed, continuing without Supabase', error);
  }
}

// Start Server
app.listen(port, async () => {
  Logger.info(`🚀 YUNITE Banking System started on port ${port}`);
  Logger.info(`📚 API Documentation: http://localhost:${port}/api-docs`);
  Logger.info(`❤️  Health Check: http://localhost:${port}/health`);
  Logger.info(`📊 Environment: ${config.server.nodeEnv}`);

  // Initialize Supabase (non-blocking - server starts first)
  await initializeSupabase();
});

export { app, eventBus };
export { SupabaseService, SupabaseStorageService };
