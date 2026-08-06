// Client-side auth
export { AuthProvider, useAuth } from './AuthContext';

// Client-side utilities
export { 
  formatRole,
  getRoleBadgeColor,
} from './auth-utils';

// Server-side auth utilities
export {
  getAuthenticatedUser,
  requireAuth,
  hasRole,
  isSuperAdmin,
  isAdmin,
  getClientIP,
  getUserAgent,
  type AuthenticatedUser,
} from './server-auth';

// Centralized authorization framework
export {
  getAuthUser,
  requireAuth as requireAuthUser,
  hasPermission,
  requirePermission,
  requireRole,
  requireSuperAdmin,
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  getRoleDisplayName,
  isValidRole,
  getRoleLevel,
  type AuthenticatedUser as AuthenticatedUserV2,
  type AuthResult,
} from './authorization';
