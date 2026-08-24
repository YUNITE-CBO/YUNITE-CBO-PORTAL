'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { CurrentUser, PasswordChange, UserProfileUpdate } from '@/types/api';

interface AuthContextType {
  user: CurrentUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  
  // Auth methods
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; mustChangePassword?: boolean }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  
  // Profile methods
  updateProfile: (updates: UserProfileUpdate) => Promise<{ success: boolean; error?: string }>;
  changePassword: (data: PasswordChange) => Promise<{ success: boolean; error?: string }>;
  
  // Helpers
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize session on mount
  useEffect(() => {
    checkSession();
  }, []);

  // Check current session - fetches all user data in one call
  const checkSession = useCallback(async () => {
    setIsLoading(true);
    try {
      // Single API call to get session with full user data
      const response = await fetch('/api/auth/session');
      const data = await response.json();
      
      if (data.success && data.data?.user) {
        const sessionUser = data.data.user;
        setUser({
          ...sessionUser,
          isSuperAdmin: data.data.isSuperAdmin,
          isAdmin: data.data.isAdmin,
        });
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Login
  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMessage = data.error || 'Login failed';
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }

      // Set user state from login response
      setUser({
        id: data.data.user.id,
        email: data.data.user.email,
        full_name: data.data.user.full_name,
        role: data.data.user.role,
        avatar_url: data.data.user.avatar_url,
        phone: data.data.user.phone,
        is_active: data.data.user.is_active,
        isSuperAdmin: data.data.user.role === 'super_admin',
        isAdmin: ['super_admin', 'admin'].includes(data.data.user.role),
        must_change_password: data.data.user.must_change_password,
      });

      return { 
        success: true, 
        mustChangePassword: data.data.user.must_change_password 
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Logout
  const logout = useCallback(async () => {
    setIsLoading(true);
    
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // Continue even if logout API fails
    } finally {
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  // Refresh session
  const refreshSession = useCallback(async () => {
    await checkSession();
  }, [checkSession]);

  // Update profile
  const updateProfile = useCallback(async (updates: UserProfileUpdate) => {
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to update profile' };
      }

      // Update local state with response data. Include the address /
      // emergency contact fields too — dropping them here made the saved
      // values vanish from the profile form until a full session reload.
      if (data.data) {
        setUser(prev => prev ? {
          ...prev,
          full_name: data.data.full_name,
          phone: data.data.phone,
          avatar_url: data.data.avatar_url,
          address: data.data.address,
          emergency_contact_name: data.data.emergency_contact_name,
          emergency_contact_phone: data.data.emergency_contact_phone,
        } : null);
      }

      return { success: true };
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Failed to update profile' 
      };
    }
  }, []);

  // Change password
  const changePassword = useCallback(async (data: PasswordChange) => {
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        return { success: false, error: result.error || 'Failed to change password' };
      }

      return { success: true };
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Failed to change password' 
      };
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    isSuperAdmin: user?.role === 'super_admin',
    isAdmin: ['super_admin', 'admin'].includes(user?.role || ''),
    error,
    login,
    logout,
    refreshSession,
    updateProfile,
    changePassword,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
