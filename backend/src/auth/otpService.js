import crypto from 'node:crypto';

import { AppError } from '../http/errors.js';
import { createSession } from './sessionService.js';

const OTP_TTL_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const MAX_PHONE_REQUESTS_PER_HOUR = 5;
const MAX_IP_REQUESTS_PER_HOUR = 20;
const MAX_PLATFORM_REQUESTS_PER_HOUR = 1_000;

export function normalizeMoroccanPhone(value) {
  if (typeof value !== 'string') return null;
  const compact = value.trim().replace(/[\s().-]/g, '');
  const normalized = compact.startsWith('0') ? `+212${compact.slice(1)}` : compact.startsWith('212') ? `+${compact}` : compact;
  return /^[+]212[5-7][0-9]{8}$/.test(normalized) ? normalized : null;
}

function hmac(value, pepper) {
  return crypto.createHmac('sha256', pepper).update(value, 'utf8').digest();
}

function genericOtpError() {
  return new AppError(422, 'otp_invalid_or_expired', 'The verification code is invalid or expired.');
}

export function createHttpOtpSender({ url, token }) {
  return async ({ phoneE164, code }) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ to: phoneE164, message: `Votre code Maw3id est ${code}. Il expire dans 5 minutes.` }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`OTP provider returned status ${response.status}.`);
  };
}

export async function requestPhoneOtp({ pool, phoneE164, requestIp, pepper, sendOtp, now = new Date() }) {
  const requestIpHash = hmac(requestIp, pepper);
  const client = await pool.connect();
  let challenge;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [phoneE164]);
    const limits = await client.query(
    `SELECT
       count(*) FILTER (WHERE phone_e164 = $1)::int AS phone_count,
       count(*) FILTER (WHERE request_ip_hash = $2)::int AS ip_count,
       count(*)::int AS platform_count,
       max(resend_available_at) FILTER (WHERE phone_e164 = $1) AS resend_available_at
     FROM phone_otp_challenges
     WHERE created_at >= $3::timestamptz - interval '1 hour'`,
    [phoneE164, requestIpHash, now],
  );
    const row = limits.rows[0];
    if (
      row.phone_count >= MAX_PHONE_REQUESTS_PER_HOUR ||
      row.ip_count >= MAX_IP_REQUESTS_PER_HOUR ||
      row.platform_count >= MAX_PLATFORM_REQUESTS_PER_HOUR
    ) {
      throw new AppError(429, 'otp_rate_limited', 'Too many verification attempts. Try again later.');
    }
    if (row.resend_available_at && new Date(row.resend_available_at) > now) {
      throw new AppError(429, 'otp_resend_cooldown', 'Please wait before requesting another code.');
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const result = await client.query(
    `INSERT INTO phone_otp_challenges (
       phone_e164, code_hash, request_ip_hash, expires_at, resend_available_at, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, expires_at, resend_available_at`,
    [
      phoneE164,
      hmac(code, pepper),
      requestIpHash,
      new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
      new Date(now.getTime() + RESEND_COOLDOWN_SECONDS * 1000),
      now,
    ],
    );
    challenge = { ...result.rows[0], code };
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  try {
    await sendOtp({ phoneE164, code: challenge.code });
  } catch (error) {
    throw new AppError(503, 'otp_delivery_unavailable', 'The verification code could not be sent. Try again later.');
  }

  return { challenge, code: challenge.code };
}

export async function verifyPhoneOtp({
  pool, challengeId, phoneE164, code, pepper, idleTtlSeconds, absoluteTtlSeconds, now = new Date(),
  requestId,
}) {
  const client = await pool.connect();
  let transactionOpen = true;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, code_hash, attempt_count, expires_at, consumed_at
       FROM phone_otp_challenges WHERE id = $1 AND phone_e164 = $2 FOR UPDATE`,
      [challengeId, phoneE164],
    );
    const challenge = result.rows[0];
    if (!challenge || challenge.consumed_at || new Date(challenge.expires_at) <= now || challenge.attempt_count >= MAX_ATTEMPTS) {
      throw genericOtpError();
    }

    const receivedHash = hmac(code, pepper);
    if (!crypto.timingSafeEqual(receivedHash, challenge.code_hash)) {
      await client.query('UPDATE phone_otp_challenges SET attempt_count = attempt_count + 1 WHERE id = $1', [challengeId]);
      await client.query('COMMIT');
      transactionOpen = false;
      throw genericOtpError();
    }

    await client.query('UPDATE phone_otp_challenges SET consumed_at = $2 WHERE id = $1', [challengeId, now]);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [phoneE164]);
    let user = (await client.query(
      `SELECT u.id, u.full_name, u.role
       FROM user_identities i JOIN users u ON u.id = i.user_id
       WHERE i.provider = 'phone' AND i.provider_subject = $1
         AND u.is_active = true AND u.deleted_at IS NULL FOR UPDATE OF u`,
      [phoneE164],
    )).rows[0];

    if (!user) {
      user = (await client.query(
        `SELECT id, full_name, role FROM users
         WHERE phone_e164 = $1 AND is_active = true AND deleted_at IS NULL
         FOR UPDATE`,
        [phoneE164],
      )).rows[0];
    }

    if (!user) {
      user = (await client.query(
        `INSERT INTO users (full_name, phone_e164, phone_verified_at, role)
         VALUES ('Patient Maw3id', $1, $2, 'patient') RETURNING id, full_name, role`,
        [phoneE164, now],
      )).rows[0];
    } else if (user.role !== 'patient') {
      throw new AppError(403, 'otp_insufficient_assurance', 'This account requires a stronger sign-in method.');
    }

    await client.query(
      `INSERT INTO user_identities (user_id, provider, provider_subject, verified_at)
       VALUES ($1, 'phone', $2, $3)
       ON CONFLICT (provider, provider_subject) DO NOTHING`,
      [user.id, phoneE164, now],
    );
    await client.query(
      `UPDATE users SET phone_verified_at = COALESCE(phone_verified_at, $2) WHERE id = $1`,
      [user.id, now],
    );

    const session = await createSession({
      pool: client, userId: user.id, authenticationMethods: ['phone_otp'], assuranceLevel: 1,
      idleTtlSeconds, absoluteTtlSeconds, now,
    });
    await client.query(
      `INSERT INTO audit_events (actor_user_id, entity_type, entity_id, action, request_id)
       VALUES ($1, 'user', $1, 'auth.phone_otp_succeeded', $2)`,
      [user.id, requestId ?? null],
    );
    await client.query('COMMIT');
    transactionOpen = false;
    return { ...session, user: { id: user.id, fullName: user.full_name, role: user.role } };
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
