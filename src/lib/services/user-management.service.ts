/**
 * ENTERPRISE USER MANAGEMENT SERVICE
 * 
 * YUNITE Enterprise Operating System
 * 
 * Comprehensive user management service for enterprise-grade identity management.
 * This service handles all non-Super Administrator user operations including:
 * 
 * - User CRUD operations
 * - Role and permission management
 * - Account lifecycle (activate, suspend, archive, restore)
 * - Password management
 * - Department/organization assignment
 * - Comprehensive audit logging
 * - Notification integration
 */

import { createServiceClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export type UserRole = 'admin' | 'staff' | 'viewer';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'archived' | 'locked';
export type AuditAction = 
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'role_changed'
  | 'status_changed'
  | 'password_reset'
  | 'account_locked'
  | 'account_unlocked'
  | 'account_suspended'
  | 'account_restored'
  | 'account_archived'
  | 'account_restored_from_archive'
  | 'profile_updated'
  | 'permissions_changed';

export interface CreateUserData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  department?: string;
  jobTitle?: string;
  employeeId?: string;
  sendWelcomeEmail?: boolean;
}

export interface UpdateUserData {
  fullName?: string;
  phone?: string;
  email?: string;
  role?: UserRole;
  department?: string;
  jobTitle?: string;
  employeeId?: string;
  adminNotes?: string;
}

export interface UserQueryOptions {
  query?: string;
  role?: UserRole;
  status?: UserStatus;
  department?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'full_name' | 'email' | 'created_at' | 'last_login' | 'role';
  sortOrder?: 'asc' | 'desc';
}

export interface UserWithDetails {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  department: string | null;
  jobTitle: string | null;
  employeeId: string | null;
  adminNotes: string | null;
  createdAt: string;
  dateJoined: string | null;
  lastLogin: string | null;
  lastActiveAt: string | null;
  emailVerified: boolean;
  totalLogins: number;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  archivedAt: string | null;
  isProtected: boolean;
  accountStatus: string;
  metadata?: {
    recentActivity?: unknown[];
    activeSessions?: number;
    departments?: Record<string, unknown>[];
  };
}

export interface AuditLogEntry {
  id: string;
  adminUserId: string;
  targetUserId: string;
  action: AuditAction;
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  reason?: string;
  module?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface UserManagementResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
  errorCode?: string;
}

export class UserManagementService {
  private readonly MAX_PASSWORD_HISTORY = 5;

  /**
   * Create a new user
   */
  async createUser(
    adminId: string,
    data: CreateUserData,
    options?: { ipAddress?: string; userAgent?: string; reason?: string }
  ): Promise<UserManagementResult> {
    const supabase = await createServiceClient();

    // Validate email format
    if (!this.isValidEmail(data.email)) {
      return {
        success: false,
        message: 'Invalid email format',
        errorCode: 'INVALID_EMAIL',
      };
    }

    // Validate password strength
    const passwordValidation = this.validatePasswordStrength(data.password);
    if (!passwordValidation.valid) {
      return {
        success: false,
        message: passwordValidation.error || 'Invalid password',
        errorCode: 'WEAK_PASSWORD',
      };
    }

    // Check if email already exists
    const existingUser = await this.findUserByEmail(data.email);
    if (existingUser) {
      return {
        success: false,
        message: 'A user with this email already exists',
        errorCode: 'EMAIL_EXISTS',
      };
    }

    // Note: UserRole type only allows 'admin' | 'staff' | 'viewer'
    // super_admin can only be created via environment config (bootstrap service)

    const now = new Date().toISOString();
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create user
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        id: userId,
        email: data.email.toLowerCase().trim(),
        password_hash: passwordHash,
        full_name: data.fullName.trim(),
        phone: data.phone?.trim() || null,
        role: data.role,
        is_active: true,
        department: data.department?.trim() || null,
        job_title: data.jobTitle?.trim() || null,
        employee_id: data.employeeId?.trim() || null,
        date_joined: now,
        created_at: now,
        updated_at: now,
        email_verified: false,
        password_history: [passwordHash],
        account_status: 'active',
      })
      .select()
      .single();

    if (error) {
      console.error('[UserManagement] Failed to create user:', error);
      return {
        success: false,
        message: 'Failed to create user',
        error: error.message,
        errorCode: 'CREATE_FAILED',
      };
    }

    // Create notification preferences
    await this.createNotificationPreferences(userId);

    // Log audit
    await this.logAudit({
      adminUserId: adminId,
      targetUserId: userId,
      action: 'user_created',
      oldValues: {},
      newValues: {
        email: newUser.email,
        full_name: newUser.full_name,
        role: newUser.role,
        department: newUser.department,
        created_at: newUser.created_at,
      },
      reason: options?.reason,
      module: 'user_management',
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });

    // Send welcome email (if enabled)
    if (data.sendWelcomeEmail !== false) {
      await this.sendWelcomeEmail(newUser);
    }

    return {
      success: true,
      message: 'User created successfully',
      data: this.mapUserToResponse(newUser),
    };
  }

  /**
   * Update an existing user
   */
  async updateUser(
    adminId: string,
    userId: string,
    data: UpdateUserData,
    options?: { ipAddress?: string; userAgent?: string; reason?: string }
  ): Promise<UserManagementResult> {
    const supabase = await createServiceClient();

    // Get current user data
    const currentUser = await this.getUserById(userId);
    if (!currentUser) {
      return {
        success: false,
        message: 'User not found',
        errorCode: 'USER_NOT_FOUND',
      };
    }

    // Prevent modification of protected accounts
    if (currentUser.isProtected) {
      return {
        success: false,
        message: 'Cannot modify protected user account',
        errorCode: 'PROTECTED_ACCOUNT',
      };
    }

    // Prevent modification of Super Admin
    if (currentUser.role === 'super_admin') {
      return {
        success: false,
        message: 'Super Admin accounts can only be modified through bootstrap configuration',
        errorCode: 'SUPER_ADMIN_PROTECTED',
      };
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    // Build update object
    if (data.fullName !== undefined && data.fullName !== currentUser.fullName) {
      oldValues.full_name = currentUser.fullName;
      newValues.full_name = data.fullName.trim();
      updates.full_name = data.fullName.trim();
    }

    if (data.phone !== undefined && data.phone !== currentUser.phone) {
      oldValues.phone = currentUser.phone;
      newValues.phone = data.phone?.trim() || null;
      updates.phone = data.phone?.trim() || null;
    }

    if (data.email !== undefined && data.email.toLowerCase() !== currentUser.email) {
      // Validate new email
      if (!this.isValidEmail(data.email)) {
        return {
          success: false,
          message: 'Invalid email format',
          errorCode: 'INVALID_EMAIL',
        };
      }

      // Check if new email already exists
      const emailExists = await this.findUserByEmail(data.email);
      if (emailExists && emailExists.id !== userId) {
        return {
          success: false,
          message: 'Email already in use by another user',
          errorCode: 'EMAIL_EXISTS',
        };
      }

      oldValues.email = currentUser.email;
      newValues.email = data.email.toLowerCase().trim();
      updates.email = data.email.toLowerCase().trim();
    }

    if (data.role !== undefined && data.role !== currentUser.role) {
      // Validate role
      const validRoles = ['admin', 'staff', 'viewer'];
      if (!validRoles.includes(data.role)) {
        return {
          success: false,
          message: 'Invalid role',
          errorCode: 'INVALID_ROLE',
        };
      }

      oldValues.role = currentUser.role;
      newValues.role = data.role;
      updates.role = data.role;
    }

    if (data.department !== undefined) {
      oldValues.department = currentUser.department;
      newValues.department = data.department?.trim() || null;
      updates.department = data.department?.trim() || null;
    }

    if (data.jobTitle !== undefined) {
      oldValues.job_title = currentUser.jobTitle;
      newValues.job_title = data.jobTitle?.trim() || null;
      updates.job_title = data.jobTitle?.trim() || null;
    }

    if (data.employeeId !== undefined) {
      oldValues.employee_id = currentUser.employeeId;
      newValues.employee_id = data.employeeId?.trim() || null;
      updates.employee_id = data.employeeId?.trim() || null;
    }

    if (data.adminNotes !== undefined) {
      oldValues.admin_notes = currentUser.adminNotes;
      newValues.admin_notes = data.adminNotes || null;
      updates.admin_notes = data.adminNotes || null;
    }

    // Apply updates
    if (Object.keys(updates).length > 1) { // More than just updated_at
      const { data: updatedUser, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        console.error('[UserManagement] Failed to update user:', error);
        return {
          success: false,
          message: 'Failed to update user',
          error: error.message,
          errorCode: 'UPDATE_FAILED',
        };
      }

      // Determine action type
      let action: AuditAction = 'user_updated';
      if (oldValues.role !== undefined) action = 'role_changed';

      // Log audit
      await this.logAudit({
        adminUserId: adminId,
        targetUserId: userId,
        action,
        oldValues,
        newValues,
        reason: options?.reason,
        module: 'user_management',
        ipAddress: options?.ipAddress,
        userAgent: options?.userAgent,
      });

      // If role changed, terminate active sessions
      if (oldValues.role !== undefined) {
        await this.terminateUserSessions(userId, 'role_changed');
      }

      return {
        success: true,
        message: 'User updated successfully',
        data: this.mapUserToResponse(updatedUser),
      };
    }

    return {
      success: true,
      message: 'No changes made',
      data: this.mapUserToResponse(currentUser),
    };
  }

  /**
   * Deactivate (soft delete) a user
   */
  async deactivateUser(
    adminId: string,
    userId: string,
    options?: { ipAddress?: string; userAgent?: string; reason?: string }
  ): Promise<UserManagementResult> {
    const supabase = await createServiceClient();

    const user = await this.getUserById(userId);
    if (!user) {
      return {
        success: false,
        message: 'User not found',
        errorCode: 'USER_NOT_FOUND',
      };
    }

    // Prevent deactivation of protected accounts
    if ((user as unknown as { is_protected?: boolean }).is_protected) {
      return {
        success: false,
        message: 'Cannot deactivate protected user account',
        errorCode: 'PROTECTED_ACCOUNT',
      };
    }

    // Prevent deactivation of Super Admin
    if (user.role === 'super_admin') {
      return {
        success: false,
        message: 'Cannot deactivate Super Admin account',
        errorCode: 'SUPER_ADMIN_PROTECTED',
      };
    }

    // Prevent self-deactivation
    if (userId === adminId) {
      return {
        success: false,
        message: 'Cannot deactivate your own account',
        errorCode: 'SELF_DEACTIVATION',
      };
    }

    // Check if this is the last admin
    if (user.role === 'admin') {
      const adminCount = await this.countUsersByRole('admin');
      if (adminCount <= 1) {
        return {
          success: false,
          message: 'Cannot deactivate the last administrator',
          errorCode: 'LAST_ADMIN',
        };
      }
    }

    // Deactivate user
    const { error } = await supabase
      .from('users')
      .update({
        is_active: false,
        account_status: 'inactive',
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('[UserManagement] Failed to deactivate user:', error);
      return {
        success: false,
        message: 'Failed to deactivate user',
        error: error.message,
        errorCode: 'DEACTIVATE_FAILED',
      };
    }

    // Terminate all sessions
    await this.terminateUserSessions(userId, 'account_deactivated');

    // Log audit
    await this.logAudit({
      adminUserId: adminId,
      targetUserId: userId,
      action: 'status_changed',
      oldValues: { is_active: true },
      newValues: { is_active: false },
      reason: options?.reason,
      module: 'user_management',
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });

    return {
      success: true,
      message: 'User deactivated successfully',
    };
  }

  /**
   * Reactivate a user
   */
  async reactivateUser(
    adminId: string,
    userId: string,
    options?: { ipAddress?: string; userAgent?: string; reason?: string }
  ): Promise<UserManagementResult> {
    const supabase = await createServiceClient();

    const user = await this.getUserById(userId);
    if (!user) {
      return {
        success: false,
        message: 'User not found',
        errorCode: 'USER_NOT_FOUND',
      };
    }

    if (user.is_active) {
      return {
        success: true,
        message: 'User is already active',
        data: this.mapUserToResponse(user),
      };
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({
        is_active: true,
        account_status: 'active',
        locked_until: null,
        failed_login_attempts: 0,
        suspended_at: null,
        suspension_reason: null,
        suspension_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('[UserManagement] Failed to reactivate user:', error);
      return {
        success: false,
        message: 'Failed to reactivate user',
        error: error.message,
        errorCode: 'REACTIVATE_FAILED',
      };
    }

    // Log audit
    await this.logAudit({
      adminUserId: adminId,
      targetUserId: userId,
      action: 'account_restored',
      oldValues: { is_active: false },
      newValues: { is_active: true },
      reason: options?.reason,
      module: 'user_management',
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });

    return {
      success: true,
      message: 'User reactivated successfully',
      data: this.mapUserToResponse(updatedUser),
    };
  }

  /**
   * Suspend a user temporarily
   */
  async suspendUser(
    adminId: string,
    userId: string,
    reason: string,
    expiresAt?: Date,
    options?: { ipAddress?: string; userAgent?: string }
  ): Promise<UserManagementResult> {
    const supabase = await createServiceClient();

    const user = await this.getUserById(userId);
    if (!user) {
      return {
        success: false,
        message: 'User not found',
        errorCode: 'USER_NOT_FOUND',
      };
    }

    // Prevent suspension of protected accounts
    if ((user as unknown as { is_protected?: boolean }).is_protected) {
      return {
        success: false,
        message: 'Cannot suspend protected user account',
        errorCode: 'PROTECTED_ACCOUNT',
      };
    }

    // Prevent self-suspension
    if (userId === adminId) {
      return {
        success: false,
        message: 'Cannot suspend your own account',
        errorCode: 'SELF_SUSPENSION',
      };
    }

    const { error } = await supabase
      .from('users')
      .update({
        is_active: false,
        account_status: 'suspended',
        suspended_at: new Date().toISOString(),
        suspended_by: adminId,
        suspension_reason: reason,
        suspension_expires_at: expiresAt?.toISOString() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('[UserManagement] Failed to suspend user:', error);
      return {
        success: false,
        message: 'Failed to suspend user',
        error: error.message,
        errorCode: 'SUSPEND_FAILED',
      };
    }

    // Terminate all sessions
    await this.terminateUserSessions(userId, 'account_suspended');

    // Log audit
    await this.logAudit({
      adminUserId: adminId,
      targetUserId: userId,
      action: 'account_suspended',
      oldValues: { suspended: false },
      newValues: { 
        suspended: true, 
        reason, 
        expires_at: expiresAt?.toISOString() || null 
      },
      reason,
      module: 'user_management',
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });

    return {
      success: true,
      message: 'User suspended successfully',
    };
  }

  /**
   * Reset user password (admin initiated)
   */
  async resetPassword(
    adminId: string,
    userId: string,
    newPassword: string,
    options?: { ipAddress?: string; userAgent?: string; forceChangeOnLogin?: boolean }
  ): Promise<UserManagementResult> {
    const supabase = await createServiceClient();

    const user = await this.getUserById(userId);
    if (!user) {
      return {
        success: false,
        message: 'User not found',
        errorCode: 'USER_NOT_FOUND',
      };
    }

    // Validate password strength
    const passwordValidation = this.validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return {
        success: false,
        message: passwordValidation.error || 'Invalid password',
        errorCode: 'WEAK_PASSWORD',
      };
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Get current password history
    const currentHistory: string[] = (user as unknown as { password_history?: string[] }).password_history || [];
    
    // Check if password was used recently
    for (const oldHash of currentHistory.slice(0, this.MAX_PASSWORD_HISTORY)) {
      const reused = await bcrypt.compare(newPassword, oldHash);
      if (reused) {
        return {
          success: false,
          message: 'Password has been used recently. Please choose a different password.',
          errorCode: 'PASSWORD_REUSED',
        };
      }
    }

    // Update password
    const { error } = await supabase
      .from('users')
      .update({
        password_hash: newPasswordHash,
        password_history: [newPasswordHash, ...currentHistory].slice(0, this.MAX_PASSWORD_HISTORY),
        password_changed_at: new Date().toISOString(),
        must_change_password: options?.forceChangeOnLogin ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('[UserManagement] Failed to reset password:', error);
      return {
        success: false,
        message: 'Failed to reset password',
        error: error.message,
        errorCode: 'PASSWORD_RESET_FAILED',
      };
    }

    // Terminate other sessions
    await this.terminateUserSessions(userId, 'password_reset');

    // Log audit
    await this.logAudit({
      adminUserId: adminId,
      targetUserId: userId,
      action: 'password_reset',
      oldValues: { password_changed: false },
      newValues: { 
        password_changed: true, 
        force_change_on_login: options?.forceChangeOnLogin ?? true 
      },
      module: 'user_management',
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });

    return {
      success: true,
      message: 'Password reset successfully',
    };
  }

  /**
   * Get user by ID with details
   */
  async getUserById(userId: string): Promise<UserWithDetails | null> {
    const supabase = await createServiceClient();

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (!user) return null;

    // Get additional details
    const [recentActivity, activeSessions] = await Promise.all([
      this.getUserRecentActivity(userId, 5),
      this.countActiveSessions(userId),
    ]);

    return {
      ...this.mapUserToResponse(user),
      metadata: {
        recentActivity,
        activeSessions,
      },
    } as UserWithDetails;
  }

  /**
   * List users with filtering and pagination
   */
  async listUsers(options: UserQueryOptions = {}): Promise<{
    users: UserWithDetails[];
    total: number;
    pagination: {
      limit: number;
      offset: number;
      totalPages: number;
    };
  }> {
    const supabase = await createServiceClient();
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    let query = supabase
      .from('users')
      .select('*', { count: 'exact' });

    // Apply filters
    if (options.query && options.query.length >= 2) {
      query = query.or(
        `email.ilike.%${options.query}%,full_name.ilike.%${options.query}%`
      );
    }

    if (options.role) {
      query = query.eq('role', options.role);
    }

    if (options.isActive !== undefined) {
      query = query.eq('is_active', options.isActive);
    }

    if (options.department) {
      query = query.eq('department', options.department);
    }

    // Sorting
    const sortBy = options.sortBy || 'created_at';
    const sortOrder = options.sortOrder || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data: users, count, error } = await query;

    if (error) {
      console.error('[UserManagement] Failed to list users:', error);
      return {
        users: [],
        total: 0,
        pagination: { limit, offset, totalPages: 0 },
      };
    }

    return {
      users: (users || []).map(u => this.mapUserToResponse(u) as UserWithDetails),
      total: count || 0,
      pagination: {
        limit,
        offset,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Get user audit history
   */
  async getUserAuditHistory(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ audits: AuditLogEntry[]; total: number }> {
    const supabase = await createServiceClient();
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;

    const { data: audits, count, error } = await supabase
      .from('user_management_audit')
      .select('*', { count: 'exact' })
      .eq('target_user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[UserManagement] Failed to get audit history:', error);
      return { audits: [], total: 0 };
    }

    return {
      audits: (audits || []).map(a => ({
        id: a.id,
        adminUserId: a.admin_user_id,
        targetUserId: a.target_user_id,
        action: a.action as AuditAction,
        oldValues: a.old_values || {},
        newValues: a.new_values || {},
        reason: a.reason || undefined,
        module: a.module || undefined,
        ipAddress: a.ip_address || undefined,
        userAgent: a.user_agent || undefined,
        createdAt: a.created_at,
      })),
      total: count || 0,
    };
  }

  /**
   * Get all departments
   */
  async getDepartments(): Promise<string[]> {
    const supabase = await createServiceClient();

    const { data } = await supabase
      .from('users')
      .select('department')
      .not('department', 'is', null);

    const departments = new Set<string>();
    for (const user of data || []) {
      if (user.department) {
        departments.add(user.department);
      }
    }

    return Array.from(departments).sort();
  }

  // ==================== Private Methods ====================

  private async findUserByEmail(email: string) {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('email', email.toLowerCase())
      .single();
    return data;
  }

  private async getUserById(userId: string): Promise<Record<string, unknown> | null> {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    return data;
  }

  private async countUsersByRole(role: string): Promise<number> {
    const supabase = await createServiceClient();
    const { count } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', role)
      .eq('is_active', true);
    return count || 0;
  }

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

  private async terminateUserSessions(userId: string, reason: string): Promise<void> {
    const supabase = await createServiceClient();
    await supabase
      .from('user_sessions')
      .update({
        is_active: false,
        terminated_at: new Date().toISOString(),
        termination_reason: reason,
      })
      .eq('user_id', userId)
      .eq('is_active', true);
  }

  private async getUserRecentActivity(userId: string, limit: number): Promise<unknown[]> {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('login_activity')
      .select('id, event_type, ip_address, success, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  }

  private async countActiveSessions(userId: string): Promise<number> {
    const supabase = await createServiceClient();
    const { count } = await supabase
      .from('user_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true);
    return count || 0;
  }

  private async logAudit(params: {
    adminUserId: string;
    targetUserId: string;
    action: AuditAction;
    oldValues: Record<string, unknown>;
    newValues: Record<string, unknown>;
    reason?: string;
    module?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const supabase = await createServiceClient();

    await supabase.from('user_management_audit').insert({
      id: uuidv4(),
      admin_user_id: params.adminUserId,
      target_user_id: params.targetUserId,
      action: params.action,
      old_values: params.oldValues,
      new_values: params.newValues,
      reason: params.reason || null,
      module: params.module || 'user_management',
      ip_address: params.ipAddress || null,
      user_agent: params.userAgent || null,
      created_at: new Date().toISOString(),
    });
  }

  private async sendWelcomeEmail(user: Record<string, unknown>): Promise<void> {
    // Import email service dynamically to avoid circular dependencies
    try {
      const { emailService } = await import('./notifications/email.service');
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://yunite.example.com';
      
      await emailService.send({
        to: user.email as string,
        toName: user.full_name as string,
        subject: 'Welcome to YUNITE Enterprise Portal',
        htmlBody: `
          <div style="padding: 20px; background-color: #f8fafc; border-radius: 8px;">
            <h2 style="color: #1e40af; margin-bottom: 20px;">Welcome to YUNITE!</h2>
            <p style="color: #334155; font-size: 16px;">Hello ${user.full_name},</p>
            <p style="color: #334155; font-size: 16px;">
              Your account has been created in the YUNITE Enterprise Portal.
            </p>
            <div style="background-color: white; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Email:</strong> ${user.email}</p>
              <p style="margin: 4px 0;"><strong>Role:</strong> ${user.role}</p>
            </div>
            <a href="${appUrl}/login" 
               style="display: inline-block; background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">
              Login to Your Account
            </a>
          </div>
        `,
      });
    } catch (error) {
      console.error('[UserManagement] Failed to send welcome email:', error);
      // Don't fail the operation if email fails
    }
  }

  private mapUserToResponse(user: Record<string, unknown>): UserWithDetails {
    return {
      id: user.id as string,
      email: user.email as string,
      fullName: user.full_name as string,
      phone: user.phone as string | null,
      role: user.role as string,
      isActive: user.is_active as boolean,
      department: user.department as string | null,
      jobTitle: user.job_title as string | null,
      employeeId: user.employee_id as string | null,
      adminNotes: user.admin_notes as string | null,
      createdAt: user.created_at as string,
      dateJoined: user.date_joined as string | null,
      lastLogin: user.last_login as string | null,
      lastActiveAt: user.last_active_at as string | null,
      emailVerified: (user.email_verified as boolean) || false,
      totalLogins: (user.total_logins as number) || 0,
      failedLoginAttempts: (user.failed_login_attempts as number) || 0,
      lockedUntil: user.locked_until as string | null,
      suspendedAt: user.suspended_at as string | null,
      suspensionReason: user.suspension_reason as string | null,
      archivedAt: user.archived_at as string | null,
      isProtected: (user.is_protected as boolean) || false,
      accountStatus: (user.account_status as string) || 'active',
    };
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private validatePasswordStrength(password: string): { valid: boolean; error?: string } {
    if (password.length < 8) {
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

    return { valid: true };
  }
}

export const userManagementService = new UserManagementService();
