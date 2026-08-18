import { clearSessionCookie, serializeSessionCookie } from './sessionAuthentication.js';
import { normalizeMoroccanPhone } from './otpService.js';
import { rotateCsrfToken, revokeSession } from './sessionService.js';
import { AppError } from '../http/errors.js';
import { rejectUnexpectedFields, requireUuid } from '../http/validation.js';

function requireCode(value) {
  if (typeof value !== 'string' || !/^[0-9]{6}$/.test(value)) {
    throw new AppError(422, 'validation_failed', 'Request validation failed.', {
      fields: { code: 'Must be a six-digit code.' },
    });
  }
  return value;
}

function requirePhone(value) {
  const phoneE164 = normalizeMoroccanPhone(value);
  if (!phoneE164) {
    throw new AppError(422, 'validation_failed', 'Request validation failed.', {
      fields: { phoneNumber: 'Enter a valid Moroccan mobile number.' },
    });
  }
  return phoneE164;
}

export function createOtpController({ config, requestOtpService, verifyOtpService, developmentMode }) {
  return {
    request: async (req, res) => {
      const body = rejectUnexpectedFields(req.body, ['phoneNumber']);
      const phoneE164 = requirePhone(body.phoneNumber);
      const result = await requestOtpService({ phoneE164, requestIp: req.ip || req.socket.remoteAddress || 'unknown' });
      res.status(202).json({
        data: {
          challengeId: result.challenge.id,
          expiresAt: result.challenge.expires_at,
          resendAvailableAt: result.challenge.resend_available_at,
          ...(developmentMode ? { developmentCode: result.code } : {}),
        },
        meta: { requestId: req.id },
      });
    },

    verify: async (req, res) => {
      const body = rejectUnexpectedFields(req.body, ['challengeId', 'phoneNumber', 'code']);
      const result = await verifyOtpService({
        challengeId: requireUuid(body.challengeId, 'challengeId'),
        phoneE164: requirePhone(body.phoneNumber),
        code: requireCode(body.code),
        requestId: req.id,
      });
      res.setHeader('set-cookie', serializeSessionCookie({
        name: config.sessionCookieName,
        token: result.token,
        secure: config.isProduction,
        maxAgeSeconds: config.sessionAbsoluteTtlSeconds,
      }));
      res.status(200).json({
        data: { user: result.user, csrfToken: result.csrfToken },
        meta: { requestId: req.id },
      });
    },

    session: async (req, res) => {
      const csrfToken = await rotateCsrfToken({ pool: req.app.locals.pool, sessionId: req.auth.sessionId });
      if (!csrfToken) throw new AppError(401, 'authentication_required', 'Authentication is required.');
      res.status(200).json({
        data: { user: { id: req.auth.userId, role: req.auth.role }, csrfToken },
        meta: { requestId: req.id },
      });
    },

    logout: async (req, res) => {
      await revokeSession({
        pool: req.app.locals.pool, sessionId: req.auth.sessionId, userId: req.auth.userId,
      });
      await req.app.locals.pool.query(
        `INSERT INTO audit_events (actor_user_id, entity_type, entity_id, action, request_id)
         VALUES ($1, 'session', $2, 'auth.session_revoked', $3)`,
        [req.auth.userId, req.auth.sessionId, req.id],
      );
      res.setHeader('set-cookie', clearSessionCookie({
        name: config.sessionCookieName, secure: config.isProduction,
      }));
      res.status(204).end();
    },
  };
}
