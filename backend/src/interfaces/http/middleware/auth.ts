import { Request, Response, NextFunction } from 'express';
import { AuthenticationError, AuthorizationError } from '../../../common/errors/AppError';
import { Logger } from '../../../core/services/Logger';
import { SupabaseAuthService } from '../../../core/services/SupabaseAuthService';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  organizationId?: string;
  branchId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.split(' ')[1];
    const user = await SupabaseAuthService.verifyJwt(token);

    req.user = {
      userId: user.id,
      email: user.email ?? '',
      role: user.role ?? 'USER',
      organizationId: (user as any).organization_id ?? undefined,
      branchId: (user as any).branch_id ?? undefined,
    };

    next();
  } catch (error) {
    Logger.warn('Supabase auth middleware failed', error);
    if (error instanceof AuthenticationError) {
      next(error);
    } else {
      next(new AuthenticationError('Authentication failed'));
    }
  }
}

export function authorize(...resources: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Not authenticated');
      }

      // Admin role has full access
      if (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN') {
        next();
        return;
      }

      // Check specific resource permissions
      const action = req.method.toLowerCase();
      const requiredPermissions = resources.map(resource => ({
        action: mapMethodToAction(action),
        resource,
      }));

      // This would check against the user's permissions from the database
      // For now, we'll just allow the request and let the service layer handle authorization
      next();
    } catch (error) {
      next(error);
    }
  };
}

function mapMethodToAction(method: string): string {
  const actionMap: Record<string, string> = {
    get: 'read',
    post: 'create',
    put: 'update',
    patch: 'update',
    delete: 'delete',
  };
  return actionMap[method] || 'read';
}

export function requireOrganizationAccess(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) {
      throw new AuthenticationError('Not authenticated');
    }

    const organizationId = req.params.organizationId || req.body.organizationId;
    if (organizationId && req.user.organizationId && req.user.organizationId !== organizationId) {
      throw new AuthorizationError('You do not have access to this organization');
    }

    next();
  } catch (error) {
    next(error);
  }
}

export function requireBranchAccess(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) {
      throw new AuthenticationError('Not authenticated');
    }

    const branchId = req.params.branchId || req.body.branchId;
    if (branchId && req.user.branchId && req.user.branchId !== branchId) {
      throw new AuthorizationError('You do not have access to this branch');
    }

    next();
  } catch (error) {
    next(error);
  }
}