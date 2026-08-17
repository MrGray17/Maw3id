import { AppError } from '../http/errors.js';

export function passThroughAuthentication(_req, _res, next) {
  next();
}

export function requireAuthenticatedUser(req, _res, next) {
  if (!req.auth?.userId) {
    return next(new AppError(401, 'authentication_required', 'Authentication is required.'));
  }

  return next();
}

export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!allowedRoles.includes(req.auth?.role)) {
      return next(new AppError(403, 'insufficient_permissions', 'You do not have permission to perform this action.'));
    }

    return next();
  };
}
