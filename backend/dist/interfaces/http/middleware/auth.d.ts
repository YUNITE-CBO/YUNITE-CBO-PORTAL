import { Request, Response, NextFunction } from 'express';
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
export declare function authenticate(req: Request, res: Response, next: NextFunction): void;
export declare function authorize(...resources: string[]): (req: Request, res: Response, next: NextFunction) => void;
export declare function requireOrganizationAccess(req: Request, res: Response, next: NextFunction): void;
export declare function requireBranchAccess(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map