import crypto from 'node:crypto';

const SESSION_SECRET_BYTES = 32;
const ALLOWED_AUTHENTICATION_METHODS = new Set([
  'phone_otp',
  'google_oidc',
  'password',
  'passkey',
  'totp',
]);

export function hashSessionSecret(secret) {
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

export function generateSessionSecret() {
  return crypto.randomBytes(SESSION_SECRET_BYTES).toString('base64url');
}

export async function createSession({
  pool,
  userId,
  authenticationMethods,
  assuranceLevel = 1,
  idleTtlSeconds,
  absoluteTtlSeconds,
  now = new Date(),
}) {
  if (!Number.isSafeInteger(idleTtlSeconds) || idleTtlSeconds <= 0) {
    throw new Error('Session idle TTL must be a positive integer.');
  }

  if (!Number.isSafeInteger(absoluteTtlSeconds) || absoluteTtlSeconds <= 0) {
    throw new Error('Session absolute TTL must be a positive integer.');
  }

  if (
    !Array.isArray(authenticationMethods) ||
    authenticationMethods.length === 0 ||
    authenticationMethods.some((method) => !ALLOWED_AUTHENTICATION_METHODS.has(method))
  ) {
    throw new Error('Authentication methods contain an unsupported value.');
  }

  const token = generateSessionSecret();
  const csrfToken = generateSessionSecret();
  const idleExpiresAt = new Date(now.getTime() + idleTtlSeconds * 1000);
  const absoluteExpiresAt = new Date(now.getTime() + absoluteTtlSeconds * 1000);

  if (idleExpiresAt > absoluteExpiresAt) {
    throw new Error('Session idle expiry cannot exceed absolute expiry.');
  }

  const result = await pool.query(
    `
      INSERT INTO auth_sessions (
        user_id,
        token_hash,
        csrf_token_hash,
        authentication_methods,
        assurance_level,
        created_at,
        last_seen_at,
        idle_expires_at,
        absolute_expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8)
      RETURNING id, user_id, assurance_level, created_at, idle_expires_at, absolute_expires_at
    `,
    [
      userId,
      hashSessionSecret(token),
      hashSessionSecret(csrfToken),
      authenticationMethods,
      assuranceLevel,
      now,
      idleExpiresAt,
      absoluteExpiresAt,
    ],
  );

  return {
    session: result.rows[0],
    token,
    csrfToken,
  };
}

export async function revokeSession({ pool, sessionId, userId, reason = 'user_logout' }) {
  const result = await pool.query(
    `
      UPDATE auth_sessions
      SET revoked_at = COALESCE(revoked_at, now()),
          revocation_reason = COALESCE(revocation_reason, $3)
      WHERE id = $1
        AND user_id = $2
      RETURNING id, revoked_at
    `,
    [sessionId, userId, reason],
  );

  return result.rows[0] ?? null;
}
