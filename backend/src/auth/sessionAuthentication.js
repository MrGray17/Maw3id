import { hashSessionSecret } from './sessionService.js';

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const COOKIE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function isValidCookieName(value) {
  return typeof value === 'string' && COOKIE_NAME_PATTERN.test(value);
}

export function readCookie(cookieHeader, cookieName) {
  if (!cookieHeader || !isValidCookieName(cookieName)) {
    return null;
  }

  const matches = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${cookieName}=`))
    .map((part) => part.slice(cookieName.length + 1));

  // Duplicate names can be interpreted differently by proxies and servers.
  // Fail closed rather than authenticating an ambiguous request.
  return matches.length === 1 ? matches[0] : null;
}

export function serializeSessionCookie({ name, token, secure, maxAgeSeconds }) {
  if (!isValidCookieName(name)) {
    throw new Error('Invalid session cookie name.');
  }

  if (token !== '' && (typeof token !== 'string' || !SESSION_TOKEN_PATTERN.test(token))) {
    throw new Error('Invalid session token.');
  }

  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 0) {
    throw new Error('Cookie Max-Age must be a non-negative integer.');
  }

  const attributes = [
    `${name}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeSeconds)}`,
  ];

  if (secure) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

export function clearSessionCookie({ name, secure }) {
  return serializeSessionCookie({ name, token: '', secure, maxAgeSeconds: 0 });
}

export function createSessionAuthentication({ pool, cookieName, idleTtlSeconds }) {
  if (!isValidCookieName(cookieName)) {
    throw new Error('Invalid session cookie name.');
  }

  if (!Number.isSafeInteger(idleTtlSeconds) || idleTtlSeconds <= 0) {
    throw new Error('Session idle TTL must be a positive integer.');
  }

  return async (req, _res, next) => {
    try {
      const token = readCookie(req.get('cookie'), cookieName);

      if (!token || !SESSION_TOKEN_PATTERN.test(token)) {
        return next();
      }

      const result = await pool.query(
        `
          SELECT
            sessions.id AS session_id,
            sessions.user_id,
            sessions.csrf_token_hash,
            sessions.authentication_methods,
            sessions.assurance_level,
            users.role
          FROM auth_sessions AS sessions
          JOIN users ON users.id = sessions.user_id
          WHERE sessions.token_hash = $1
            AND sessions.revoked_at IS NULL
            AND sessions.idle_expires_at > now()
            AND sessions.absolute_expires_at > now()
            AND users.is_active = true
            AND users.deleted_at IS NULL
          LIMIT 1
        `,
        [hashSessionSecret(token)],
      );

      if (result.rowCount === 0) {
        return next();
      }

      const session = result.rows[0];

      req.auth = {
        sessionId: session.session_id,
        userId: session.user_id,
        role: session.role,
        csrfTokenHash: session.csrf_token_hash,
        authenticationMethods: session.authentication_methods,
        assuranceLevel: session.assurance_level,
      };

      await pool.query(
        `
          UPDATE auth_sessions
          SET last_seen_at = now(),
              idle_expires_at = LEAST(
                absolute_expires_at,
                now() + ($2::integer * interval '1 second')
              )
          WHERE id = $1
            AND last_seen_at < now() - interval '5 minutes'
            AND revoked_at IS NULL
        `,
        [session.session_id, idleTtlSeconds],
      );

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
