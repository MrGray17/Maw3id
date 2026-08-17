import crypto from 'node:crypto';

import { AppError } from '../http/errors.js';
import { hashSessionSecret } from './sessionService.js';

const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function requireCsrfToken(req, _res, next) {
  const token = req.get('x-csrf-token');
  const expectedHash = req.auth?.csrfTokenHash;

  if (
    typeof token !== 'string' ||
    !CSRF_TOKEN_PATTERN.test(token) ||
    !Buffer.isBuffer(expectedHash)
  ) {
    return next(new AppError(403, 'csrf_validation_failed', 'Request could not be verified.'));
  }

  const receivedHash = hashSessionSecret(token);

  if (!crypto.timingSafeEqual(receivedHash, expectedHash)) {
    return next(new AppError(403, 'csrf_validation_failed', 'Request could not be verified.'));
  }

  return next();
}
