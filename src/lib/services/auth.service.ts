/**
 * AUTH SERVICE
 * 
 * Centralized authentication service for YUNITE Enterprise Portal.
 * Handles login, logout, session management, and user authentication.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = new TextEncoder().encode(
  process.env.SUPABASE_JWT_SECRET || 'your-secret-key-at-least-32-chars'
);

const SESSION_DURATION_HOURS = 24;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

export interface LoginResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    full_name: string;
    role: string;
    avatar_url?: string | null;
    phone?: string | null;
    is_active: boolean;
    must_change_password?: boolean;
  };
  token?: string;
  error?: string;
  error_code?: 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'ACCOUNT_DISABLED' | 'SESSION_ERROR';
}

export interface DeviceInfo {
  browser: string;
  os: string;
  device: string;
  isMobile: boolean;
}

// Parse device info from user agent
export function parseDeviceInfo(userAgent: string): DeviceInfo {
  const isMobile = /mobile|android|iphone|ipad|tablet/i.test(userAgent);
  const isTablet = /tablet|ipad/i.test(userAgent);

  let browser = 'Unknown Browser';
  let os = 'Unknown OS';
  let device = 'Desktop';

  if (isMobile && !isTablet) {
    device = 'Mobile';
  } else if (isTablet) {
    device = 'Tablet';
  }

  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';

  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iOS')) os = 'iOS';

  return { browser, os, device, isMobile };
}

export class AuthService {
  /**
   * Authenticate user and create session
   */
  async login(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
    deviceInfo?: DeviceInfo
  ): Promise<LoginResult> {
    const supabase = await createServiceClient();
    const normalizedEmail = email.toLowerCase().trim();

    // Find user by email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (userError || !user) {
      await this.logLoginActivity(null, normalizedEmail, 'login_failed', false, 'User not found', ipAddress, userAgent, deviceInfo);
      return {
        success: false,
        error: 'Invalid email or password',
        error_code: 'INVALID_CREDENTIALS',
      };
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await this.logLoginActivity(user.id, normalizedEmail, 'login_failed', false, 'Account locked', ipAddress, userAgent, deviceInfo);
      return {
        success: false,
        error: `Account is locked. Please try again after ${new Date(user.locked_until).toLocaleTimeString()}`,
        error_code: 'ACCOUNT_LOCKED',
      };
    }

    // Check if account is active
    if (!user.is_active) {
      await this.logLoginActivity(user.id, normalizedEmail, 'login_failed', false, 'Account disabled', ipAddress, userAgent, deviceInfo);
      return {
        success: false,
        error: 'Your account has been deactivated. Contact your administrator.',
        error_code: 'ACCOUNT_DISABLED',
      };
    }

    // Verify password
    if (!user.password_hash) {
      await this.logLoginActivity(user.id, normalizedEmail, 'login_failed', false, 'No password set', ipAddress, userAgent, deviceInfo);
      return {
        success: false,
        error: 'Invalid email or password',
        error_code: 'INVALID_CREDENTIALS',
      };
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      // Increment failed login attempts
      const newAttempts = (user.failed_login_attempts || 0) + 1;
      const updates: Record<string, unknown> = { failed_login_attempts: newAttempts };

      // Lock account if max attempts reached
      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        const lockUntil = new Date();
        lockUntil.setMinutes(lockUntil.getMinutes() + LOCKOUT_DURATION_MINUTES);
        updates.locked_until = lockUntil.toISOString();
        await this.logLoginActivity(user.id, normalizedEmail, 'account_locked', false, 'Max login attempts exceeded', ipAddress, userAgent, deviceInfo);
      } else {
        await this.logLoginActivity(user.id, normalizedEmail, 'login_failed', false, `Invalid password (attempt ${newAttempts}/${MAX_LOGIN_ATTEMPTS})`, ipAddress, userAgent, deviceInfo);
      }

      await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id);

      const attemptsRemaining = MAX_LOGIN_ATTEMPTS - newAttempts;
      return {
        success: false,
        error: attemptsRemaining > 0 
          ? `Invalid password. ${attemptsRemaining} attempt(s) remaining.`
          : 'Account has been temporarily locked due to multiple failed login attempts.',
        error_code: 'ACCOUNT_LOCKED',
      };
    }

    // Reset failed login attempts on successful password check
    await supabase
      .from('users')
      .update({
        failed_login_attempts: 0,
        locked_until: null,
        last_login: new Date().toISOString(),
      })
      .eq('id', user.id);

    // Generate JWT token
    const token = await this.generateToken(user);

    // Create session record
    await this.createSession(user.id, token, ipAddress, userAgent, deviceInfo);

    // Log successful login
    await this.logLoginActivity(user.id, normalizedEmail, 'login_success', true, undefined, ipAddress, userAgent, deviceInfo);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        avatar_url: user.avatar_url,
        phone: user.phone,
        is_active: user.is_active,
        must_change_password: user.must_change_password || false,
      },
      token,
    };
  }

  /**
   * Logout user and terminate session
   */
  async logout(
    userId: string,
    sessionToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServiceClient();

    // Terminate session
    await supabase
      .from('user_sessions')
      .update({
        is_active: false,
        terminated_at: new Date().toISOString(),
        termination_reason: 'user_logout',
      })
      .eq('user_id', userId)
      .eq('session_token', sessionToken)
      .eq('is_active', true);

    // Log logout activity
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    await this.logLoginActivity(userId, user?.email || '', 'logout', true, undefined, ipAddress, userAgent);

    return { success: true };
  }

  /**
   * Verify and decode JWT token
   */
  async verifyToken(token: string): Promise<{
    valid: boolean;
    payload?: {
      user_id: string;
      email: string;
      role: string;
      session_id?: string;
    };
    error?: string;
  }> {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      return {
        valid: true,
        payload: {
          user_id: payload.user_id as string,
          email: payload.email as string,
          role: payload.role as string,
          session_id: payload.session_id as string,
        },
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid token',
      };
    }
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(userId: string): Promise<{
    success: boolean;
    user?: Record<string, unknown>;
    error?: string;
  }> {
    const supabase = await createServiceClient();

    const { data: user, error } = await supabase
      .from('users')
      .select(`
        id, email, full_name, role, phone, avatar_url, address,
        emergency_contact_name, emergency_contact_phone, date_joined,
        last_login, is_active, must_change_password, created_at
      `)
      .eq('id', userId)
      .single();

    if (error || !user) {
      return { success: false, error: 'User not found' };
    }

    return {
      success: true,
      user: {
        ...user,
        isSuperAdmin: user.role === 'super_admin',
        isAdmin: user.role === 'admin' || user.role === 'super_admin',
      },
    };
  }

  /**
   * Get session from request (for API routes using cookies)
   */
  async getSession(): Promise<{ user?: { id: string; email: string; role: string; full_name: string } } | null> {
    // This method is a placeholder - actual session handling is done by middleware
    // API routes that need user info should use the middleware to extract user from JWT
    return null;
  }

  /**
   * Update user profile (non-sensitive fields only)
   */
  async updateProfile(
    userId: string,
    updates: {
      full_name?: string;
      phone?: string;
      address?: string;
      emergency_contact_name?: string;
      emergency_contact_phone?: string;
      avatar_url?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServiceClient();

    // Validate inputs
    if (updates.full_name && updates.full_name.trim().length < 2) {
      return { success: false, error: 'Full name must be at least 2 characters' };
    }

    if (updates.phone && !/^[\d\s\-+()]{7,20}$/.test(updates.phone)) {
      return { success: false, error: 'Invalid phone number format' };
    }

    // Update profile
    const { error } = await supabase
      .from('users')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      return { success: false, error: 'Failed to update profile' };
    }

    return { success: true };
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServiceClient();

    // Get current user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('password_hash, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return { success: false, error: 'User not found' };
    }

    // Verify current password
    if (!user.password_hash) {
      return { success: false, error: 'Current password not set' };
    }

    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      return { success: false, error: 'Current password is incorrect' };
    }

    // Validate new password
    const passwordValidation = this.validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return { success: false, error: passwordValidation.error };
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await supabase
      .from('users')
      .update({
        password_hash: newPasswordHash,
        password_changed_at: new Date().toISOString(),
        must_change_password: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    // Log password change
    await this.logLoginActivity(userId, user.email, 'password_changed', true, undefined, ipAddress, userAgent);

    // Optionally terminate other sessions for security
    await supabase
      .from('user_sessions')
      .update({
        is_active: false,
        terminated_at: new Date().toISOString(),
        termination_reason: 'password_changed',
      })
      .eq('user_id', userId)
      .eq('is_active', true);

    return { success: true };
  }

  /**
   * Get user sessions
   */
  async getUserSessions(userId: string, currentSessionId?: string): Promise<{
    sessions: Array<{
      id: string;
      device_info: Record<string, unknown> | null;
      ip_address: string | null;
      created_at: string;
      last_activity_at: string;
      is_current: boolean;
    }>;
  }> {
    const supabase = await createServiceClient();

    const { data: sessions } = await supabase
      .from('user_sessions')
      .select('id, device_info, ip_address, created_at, last_activity_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(10);

    return {
      sessions: (sessions || []).map(s => ({
        ...s,
        is_current: s.id === currentSessionId,
      })),
    };
  }

  /**
   * Terminate specific session
   */
  async terminateSession(userId: string, sessionId: string): Promise<{ success: boolean }> {
    const supabase = await createServiceClient();

    await supabase
      .from('user_sessions')
      .update({
        is_active: false,
        terminated_at: new Date().toISOString(),
        termination_reason: 'user_terminated',
      })
      .eq('id', sessionId)
      .eq('user_id', userId);

    return { success: true };
  }

  /**
   * Get login activity for a user
   */
  async getLoginActivity(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{
    activities: Array<{
      id: string;
      event_type: string;
      ip_address: string | null;
      device_info: Record<string, unknown> | null;
      success: boolean;
      failure_reason: string | null;
      created_at: string;
    }>;
    total: number;
  }> {
    const supabase = await createServiceClient();
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;

    const { data: activities, count } = await supabase
      .from('login_activity')
      .select('id, event_type, ip_address, device_info, success, failure_reason, created_at', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    return {
      activities: activities || [],
      total: count || 0,
    };
  }

  // ==================== Private Methods ====================

  private async generateToken(user: Record<string, unknown>): Promise<string> {
    const sessionId = uuidv4();
    
    return new SignJWT({
      user_id: user.id,
      email: user.email,
      role: user.role,
      session_id: sessionId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_DURATION_HOURS}h`)
      .sign(JWT_SECRET);
  }

  private async createSession(
    userId: string,
    token: string,
    ipAddress?: string,
    userAgent?: string,
    deviceInfo?: DeviceInfo
  ): Promise<void> {
    const supabase = await createServiceClient();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + SESSION_DURATION_HOURS);

    await supabase.from('user_sessions').insert({
      user_id: userId,
      session_token: token,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      device_info: deviceInfo || null,
      is_active: true,
      expires_at: expiresAt.toISOString(),
    });
  }

  private async logLoginActivity(
    userId: string | null,
    email: string,
    eventType: string,
    success: boolean,
    failureReason?: string,
    ipAddress?: string,
    userAgent?: string,
    deviceInfo?: DeviceInfo
  ): Promise<void> {
    const supabase = await createServiceClient();

    await supabase.from('login_activity').insert({
      user_id: userId,
      email: email,
      event_type: eventType,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      device_info: deviceInfo || null,
      success,
      failure_reason: failureReason || null,
    });
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

export const authService = new AuthService();
