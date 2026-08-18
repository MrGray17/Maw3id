import express from 'express';

import { requireAuthenticatedUser } from '../auth/authorization.js';
import { requireCsrfToken } from '../auth/csrf.js';
import { createOtpController } from '../auth/otpController.js';
import { AppError } from '../http/errors.js';

function requireTrustedOrigin(req, _res, next) {
  const origin = req.get('origin');
  if (!origin || !req.config.allowedOrigins.includes(origin)) {
    return next(new AppError(403, 'origin_not_allowed', 'Request origin is not allowed.'));
  }
  return next();
}

export function createAuthRouter({ config, authenticate, requestOtpService, verifyOtpService }) {
  const router = express.Router();
  const controller = createOtpController({
    config, requestOtpService, verifyOtpService, developmentMode: config.otpDeliveryMode === 'development',
  });

  router.post('/auth/phone/request', requireTrustedOrigin, controller.request);
  router.post('/auth/phone/verify', requireTrustedOrigin, controller.verify);
  router.get('/auth/session', authenticate, requireAuthenticatedUser, controller.session);
  router.post('/auth/logout', requireTrustedOrigin, authenticate, requireAuthenticatedUser, requireCsrfToken, controller.logout);
  return router;
}
