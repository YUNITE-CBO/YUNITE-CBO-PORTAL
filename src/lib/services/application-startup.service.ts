/**
 * APPLICATION STARTUP SERVICE
 * 
 * YUNITE Enterprise Operating System
 * 
 * This module handles all initialization tasks that must run when the
 * application starts. It ensures the system is properly bootstrapped
 * and ready to serve requests.
 */

import { superAdminBootstrapService } from './super-admin-bootstrap.service';
import { notificationService } from './notifications/notification.service';

export interface StartupResult {
  success: boolean;
  tasks: {
    name: string;
    status: 'completed' | 'failed' | 'skipped';
    duration: number;
    message?: string;
    error?: string;
  }[];
  totalDuration: number;
  environment: string;
  timestamp: string;
}

class ApplicationStartupService {
  private isRunning = false;
  private hasStarted = false;

  /**
   * Initialize the application - call this on server startup
   */
  async initialize(): Promise<StartupResult> {
    // Prevent concurrent initialization
    if (this.isRunning) {
      console.log('[Startup] Initialization already in progress...');
      return {
        success: false,
        tasks: [],
        totalDuration: 0,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
      };
    }

    // Skip if already initialized
    if (this.hasStarted) {
      console.log('[Startup] Already initialized, skipping...');
      return {
        success: true,
        tasks: [{ name: 'all', status: 'completed', duration: 0 }],
        totalDuration: 0,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
      };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const environment = process.env.NODE_ENV || 'development';

    console.log(`[Startup] ═══════════════════════════════════════════════════════`);
    console.log(`[Startup] YUNITE Enterprise OS - Application Startup`);
    console.log(`[Startup] Environment: ${environment}`);
    console.log(`[Startup] Timestamp: ${timestamp}`);
    console.log(`[Startup] ═══════════════════════════════════════════════════════`);

    const tasks: StartupResult['tasks'] = [];

    try {
      // Task 1: Bootstrap Super Admin
      const bootstrapResult = await this.runTask('super_admin_bootstrap', async () => {
        return await superAdminBootstrapService.bootstrap();
      });
      tasks.push(bootstrapResult);

      // Task 2: Process scheduled notifications (if needed)
      const notificationResult = await this.runTask('notification_cleanup', async () => {
        await this.cleanupNotifications();
        return { success: true, message: 'Notification cleanup completed' };
      });
      tasks.push(notificationResult);

      // Task 3: Verify database connection
      const dbResult = await this.runTask('database_verification', async () => {
        return await this.verifyDatabaseConnection();
      });
      tasks.push(dbResult);

      // Check for failures
      const hasFailures = tasks.some(t => t.status === 'failed');
      const totalDuration = Date.now() - startTime;

      console.log(`[Startup] ═══════════════════════════════════════════════════════`);
      console.log(`[Startup] Startup ${hasFailures ? 'completed with warnings' : 'completed successfully'}`);
      console.log(`[Startup] Total duration: ${totalDuration}ms`);
      console.log(`[Startup] ═══════════════════════════════════════════════════════`);

      this.hasStarted = true;
      this.isRunning = false;

      return {
        success: !hasFailures,
        tasks,
        totalDuration,
        environment,
        timestamp,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Startup] Fatal error during initialization:`, error);

      this.isRunning = false;

      return {
        success: false,
        tasks,
        totalDuration: Date.now() - startTime,
        environment,
        timestamp,
      };
    }
  }

  /**
   * Run a startup task with timing
   */
  private async runTask(
    name: string,
    task: () => Promise<{ success: boolean; message?: string }>
  ): Promise<StartupResult['tasks'][0]> {
    const startTime = Date.now();
    
    try {
      const result = await task();
      const duration = Date.now() - startTime;
      
      if (result.success) {
        console.log(`[Startup] ✓ ${name}: completed in ${duration}ms`);
      } else {
        console.log(`[Startup] ⚠ ${name}: ${result.message || 'completed'} in ${duration}ms`);
      }
      
      return {
        name,
        status: result.success ? 'completed' : 'skipped',
        duration,
        message: result.message,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`[Startup] ✗ ${name}: failed in ${duration}ms - ${errorMessage}`);
      
      return {
        name,
        status: 'failed',
        duration,
        error: errorMessage,
      };
    }
  }

  /**
   * Clean up old/expired notifications
   */
  private async cleanupNotifications(): Promise<void> {
    const supabase = await import('@/lib/supabase/server').then(m => m.createServiceClient());
    
    // Clean up old read notifications (older than 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('status', 'read')
      .lt('read_at', ninetyDaysAgo.toISOString());
    
    if (error) {
      console.warn('[Startup] Failed to cleanup old notifications:', error.message);
    }
  }

  /**
   * Verify database connection
   */
  private async verifyDatabaseConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      const supabase = await import('@/lib/supabase/server').then(m => m.createServiceClient());
      
      // Simple query to verify connection
      const { error } = await supabase.from('users').select('id').limit(1);
      
      if (error) {
        return {
          success: false,
          message: `Database connection failed: ${error.message}`,
        };
      }
      
      return { success: true, message: 'Database connection verified' };
    } catch (error) {
      return {
        success: false,
        message: 'Database connection failed',
      };
    }
  }

  /**
   * Get startup status
   */
  getStatus(): { isRunning: boolean; hasStarted: boolean } {
    return {
      isRunning: this.isRunning,
      hasStarted: this.hasStarted,
    };
  }

  /**
   * Reset startup state (for testing)
   */
  reset(): void {
    this.isRunning = false;
    this.hasStarted = false;
  }
}

export const applicationStartupService = new ApplicationStartupService();

// Auto-initialize flag - set to false if you want manual initialization
const AUTO_INITIALIZE = process.env.AUTO_INITIALIZE !== 'false';

/**
 * Get or create the initialization promise
 * This ensures the startup runs only once even with multiple requests
 */
let initPromise: Promise<StartupResult> | null = null;

export function getOrCreateInitialization(): Promise<StartupResult> {
  if (!AUTO_INITIALIZE) {
    console.log('[Startup] Auto-initialization disabled. Call applicationStartupService.initialize() manually.');
    return Promise.resolve({
      success: true,
      tasks: [],
      totalDuration: 0,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    });
  }

  if (!initPromise) {
    initPromise = applicationStartupService.initialize();
  }
  return initPromise;
}

// Export for manual use
export { superAdminBootstrapService } from './super-admin-bootstrap.service';
