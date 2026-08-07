/**
 * SUPER ADMIN BOOTSTRAP SERVICE
 * 
 * YUNITE Enterprise Operating System
 * 
 * This service ensures that a Super Administrator account exists in the database
 * based on environment configuration. It runs on application startup and ensures:
 * 
 * 1. The Super Admin account is created if it doesn't exist
 * 2. The account has the correct role, status, and security settings
 * 3. All security settings (active, email verified, etc.) are enforced
 * 4. Bootstrap operations are logged for auditing
 * 
 * The Super Admin credentials come exclusively from environment variables,
 * never from code or version control.
 */

import { createServiceClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export interface SuperAdminConfig {
  email: string;
  password: string;
  name: string;
  phone?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface BootstrapResult {
  success: boolean;
  action: 'created' | 'updated' | 'verified' | 'error' | 'skipped';
  message: string;
  userId?: string;
  timestamp: string;
  duration?: number;
  details?: Record<string, unknown>;
}

export class SuperAdminBootstrapService {
  private readonly CONFIG_PREFIX = 'SUPER_ADMIN_';
  private readonly REQUIRED_VARS = ['EMAIL', 'PASSWORD', 'NAME'];
  
  /**
   * Main entry point - bootstrap the Super Admin account
   * Call this on application startup
   */
  async bootstrap(): Promise<BootstrapResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    
    try {
      // Step 1: Validate environment configuration
      const configValidation = this.validateEnvironmentConfig();
      if (!configValidation.valid) {
        const result: BootstrapResult = {
          success: false,
          action: 'error',
          message: `Missing required environment configuration: ${configValidation.missing.join(', ')}`,
          timestamp,
        };
        await this.logBootstrapOperation(result, Date.now() - startTime);
        return result;
      }

      const config = this.getConfigFromEnvironment();
      
      // Step 2: Check if Super Admin already exists
      const supabase = await createServiceClient();
      const existingUser = await this.findSuperAdminByEmail(config.email);
      
      if (!existingUser) {
        // Create new Super Admin
        const createResult = await this.createSuperAdmin(config);
        createResult.timestamp = timestamp;
        createResult.duration = Date.now() - startTime;
        await this.logBootstrapOperation(createResult, Date.now() - startTime);
        return createResult;
      }
      
      // Step 3: Validate and update existing Super Admin
      const updateResult = await this.validateAndUpdateSuperAdmin(existingUser, config);
      updateResult.timestamp = timestamp;
      await this.logBootstrapOperation(updateResult, Date.now() - startTime);
      return updateResult;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const result: BootstrapResult = {
        success: false,
        action: 'error',
        message: `Bootstrap failed: ${errorMessage}`,
        timestamp,
        details: { error: String(error) },
      };
      await this.logBootstrapOperation(result, Date.now() - startTime);
      console.error('[SuperAdminBootstrap] Fatal error:', error);
      return result;
    }
  }

  /**
   * Validate that all required environment variables are present
   */
  private validateEnvironmentConfig(): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    
    for (const varName of this.REQUIRED_VARS) {
      const fullVarName = `${this.CONFIG_PREFIX}${varName}`;
      const value = process.env[fullVarName];
      
      if (!value || value.trim() === '') {
        missing.push(fullVarName);
      }
    }
    
    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Read Super Admin configuration from environment variables
   */
  private getConfigFromEnvironment(): SuperAdminConfig {
    return {
      email: (process.env[`${this.CONFIG_PREFIX}EMAIL`] || '').toLowerCase().trim(),
      password: process.env[`${this.CONFIG_PREFIX}PASSWORD`] || '',
      name: (process.env[`${this.CONFIG_PREFIX}NAME`] || '').trim(),
      phone: process.env[`${this.CONFIG_PREFIX}PHONE`]?.trim() || undefined,
      status: (process.env[`${this.CONFIG_PREFIX}STATUS`] as 'ACTIVE' | 'INACTIVE') || 'ACTIVE',
    };
  }

  /**
   * Find existing Super Admin by email
   */
  private async findSuperAdminByEmail(email: string) {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    return data;
  }

  /**
   * Create a new Super Admin account
   */
  private async createSuperAdmin(config: SuperAdminConfig): Promise<BootstrapResult> {
    const supabase = await createServiceClient();
    
    // Validate password strength
    const passwordValidation = this.validatePasswordStrength(config.password);
    if (!passwordValidation.valid) {
      return {
        success: false,
        action: 'error',
        message: `Password validation failed: ${passwordValidation.error}`,
        timestamp: new Date().toISOString(),
      };
    }

    // Hash password with bcrypt (12 rounds)
    const passwordHash = await bcrypt.hash(config.password, 12);
    
    // Generate unique ID
    const userId = uuidv4();
    const now = new Date().toISOString();
    
    // Create the Super Admin user
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        id: userId,
        email: config.email,
        password_hash: passwordHash,
        full_name: config.name,
        phone: config.phone || null,
        role: 'super_admin',
        is_active: config.status === 'ACTIVE',
        date_joined: now,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    
    if (error) {
      console.error('[SuperAdminBootstrap] Failed to create user:', error);
      return {
        success: false,
        action: 'error',
        message: `Failed to create Super Admin: ${error.message}`,
        timestamp: new Date().toISOString(),
        details: { supabaseError: error },
      };
    }

    // Create notification preferences for the new user
    await this.createNotificationPreferences(userId);
    
    return {
      success: true,
      action: 'created',
      message: `Super Admin account created successfully for ${config.email}`,
      userId,
      timestamp: new Date().toISOString(),
      details: {
        email: config.email,
        role: 'super_admin',
        isActive: config.status === 'ACTIVE',
      },
    };
  }

  /**
   * Validate existing Super Admin and ensure compliance with config
   */
  private async validateAndUpdateSuperAdmin(
    existingUser: Record<string, unknown>,
    config: SuperAdminConfig
  ): Promise<BootstrapResult> {
    const supabase = await createServiceClient();
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    const changes: string[] = [];
    
    // Check 1: Verify role is super_admin
    if (existingUser.role !== 'super_admin') {
      updates.role = 'super_admin';
      changes.push('role');
    }
    
    // Check 2: Verify account is active (if configured as ACTIVE)
    if (config.status === 'ACTIVE' && !existingUser.is_active) {
      updates.is_active = true;
      changes.push('is_active');
    }
    
    // Check 3: Verify name matches (if name is configured)
    if (config.name && existingUser.full_name !== config.name) {
      updates.full_name = config.name;
      changes.push('full_name');
    }
    
    // Check 4: Verify phone matches (if configured)
    if (config.phone !== undefined && existingUser.phone !== config.phone) {
      updates.phone = config.phone;
      changes.push('phone');
    }
    
    // Check 5: Handle password update (only if password changed in env)
    // Note: We don't update password on every boot, only if explicitly requested
    // or if the existing user has no password
    if (!existingUser.password_hash) {
      const passwordHash = await bcrypt.hash(config.password, 12);
      updates.password_hash = passwordHash;
      changes.push('password_hash (restored missing password)');
    }

    // Apply updates if there are changes
    if (Object.keys(updates).length > 1) { // More than just updated_at
      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', existingUser.id);
      
      if (error) {
        console.error('[SuperAdminBootstrap] Failed to update Super Admin:', error);
        return {
          success: false,
          action: 'error',
          message: `Failed to update Super Admin: ${error.message}`,
          timestamp: new Date().toISOString(),
        };
      }
      
      return {
        success: true,
        action: 'updated',
        message: `Super Admin account validated and updated: ${changes.join(', ')}`,
        userId: existingUser.id as string,
        timestamp: new Date().toISOString(),
        details: {
          email: config.email,
          changes,
          previousValues: {
            role: existingUser.role,
            is_active: existingUser.is_active,
            full_name: existingUser.full_name,
            phone: existingUser.phone,
          },
        },
      };
    }
    
    // No changes needed
    return {
      success: true,
      action: 'verified',
      message: `Super Admin account verified and compliant`,
      userId: existingUser.id as string,
      timestamp: new Date().toISOString(),
      details: {
        email: config.email,
        role: existingUser.role,
        isActive: existingUser.is_active,
        lastLogin: existingUser.last_login,
      },
    };
  }

  /**
   * Create default notification preferences for a new user
   */
  private async createNotificationPreferences(userId: string): Promise<void> {
    const supabase = await createServiceClient();
    
    await supabase.from('notification_preferences').insert({
      id: uuidv4(),
      user_id: userId,
      notify_on_login: true,
      notify_on_logout: true,
      notify_on_password_change: true,
      notify_on_profile_update: true,
      email_notifications: true,
      in_app_notifications: true,
    });
  }

  /**
   * Log bootstrap operation to audit table
   */
  private async logBootstrapOperation(
    result: BootstrapResult,
    durationMs: number
  ): Promise<void> {
    try {
      const supabase = await createServiceClient();
      
      await supabase.from('bootstrap_logs').insert({
        id: uuidv4(),
        operation_type: 'super_admin_bootstrap',
        status: result.success ? 'success' : 'failed',
        action_taken: result.action,
        message: result.message,
        details: result.details || {},
        duration_ms: durationMs,
        environment: process.env.NODE_ENV || 'development',
        metadata: {
          timestamp: result.timestamp,
          hasUserId: !!result.userId,
        },
      });
    } catch (logError) {
      // Don't fail the bootstrap if logging fails
      console.error('[SuperAdminBootstrap] Failed to log operation:', logError);
    }
  }

  /**
   * Validate password strength requirements
   */
  private validatePasswordStrength(password: string): { valid: boolean; error?: string } {
    if (!password || password.length < 8) {
      return { valid: false, error: 'Password must be at least 8 characters long' };
    }

    if (!/[A-Z]/.test(password)) {
      return { valid: false, error: 'Password must contain at least one uppercase letter' };
    }

    if (!/[a-z]/.test(password)) {
      return { valid: false, error: 'Password must contain at least one lowercase letter' };
    }

    if (!/[0-9]/.test(password)) {
      return { valid: false, error: 'Password must contain at least one number' };
    }

    // Additional recommended characters
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return { 
        valid: false, 
        error: 'Password should contain at least one special character (!@#$%^&*(),.?":{}|<>)' 
      };
    }

    return { valid: true };
  }

  /**
   * Get bootstrap status - check if Super Admin exists and is configured
   */
  async getBootstrapStatus(): Promise<{
    configured: boolean;
    exists: boolean;
    userId?: string;
    lastBootstrap?: string;
  }> {
    const supabase = await createServiceClient();
    
    // Check if environment is configured
    const isConfigured = this.validateEnvironmentConfig().valid;
    
    if (!isConfigured) {
      return { configured: false, exists: false };
    }
    
    const config = this.getConfigFromEnvironment();
    
    // Check if user exists
    const user = await this.findSuperAdminByEmail(config.email);
    
    if (!user) {
      return { configured: true, exists: false };
    }
    
    // Get last bootstrap log
    const { data: lastLog } = await supabase
      .from('bootstrap_logs')
      .select('created_at')
      .eq('operation_type', 'super_admin_bootstrap')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    return {
      configured: true,
      exists: true,
      userId: user.id,
      lastBootstrap: lastLog?.created_at,
    };
  }
}

export const superAdminBootstrapService = new SuperAdminBootstrapService();
