"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.authorize = authorize;
exports.requireOrganizationAccess = requireOrganizationAccess;
exports.requireBranchAccess = requireBranchAccess;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../../../config");
const AppError_1 = require("../../../common/errors/AppError");
function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AppError_1.AuthenticationError('No token provided');
        }
        const token = authHeader.split(' ')[1];
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
        req.user = decoded;
        next();
    }
    catch (error) {
        if (error instanceof AppError_1.AuthenticationError) {
            next(error);
        }
        else if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            next(new AppError_1.AuthenticationError('Token has expired'));
        }
        else if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            next(new AppError_1.AuthenticationError('Invalid token'));
        }
        else {
            next(new AppError_1.AuthenticationError('Authentication failed'));
        }
    }
}
function authorize(...resources) {
    return (req, res, next) => {
        try {
            if (!req.user) {
                throw new AppError_1.AuthenticationError('Not authenticated');
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
        }
        catch (error) {
            next(error);
        }
    };
}
function mapMethodToAction(method) {
    const actionMap = {
        get: 'read',
        post: 'create',
        put: 'update',
        patch: 'update',
        delete: 'delete',
    };
    return actionMap[method] || 'read';
}
function requireOrganizationAccess(req, res, next) {
    try {
        if (!req.user) {
            throw new AppError_1.AuthenticationError('Not authenticated');
        }
        const organizationId = req.params.organizationId || req.body.organizationId;
        if (organizationId && req.user.organizationId && req.user.organizationId !== organizationId) {
            throw new AppError_1.AuthorizationError('You do not have access to this organization');
        }
        next();
    }
    catch (error) {
        next(error);
    }
}
function requireBranchAccess(req, res, next) {
    try {
        if (!req.user) {
            throw new AppError_1.AuthenticationError('Not authenticated');
        }
        const branchId = req.params.branchId || req.body.branchId;
        if (branchId && req.user.branchId && req.user.branchId !== branchId) {
            throw new AppError_1.AuthorizationError('You do not have access to this branch');
        }
        next();
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=auth.js.map