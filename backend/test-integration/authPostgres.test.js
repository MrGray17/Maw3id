import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { requestPhoneOtp, verifyPhoneOtp } from '../src/auth/otpService.js';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT ? Number(process.env.POSTGRES_PORT) : undefined,
  database: process.env.POSTGRES_DB, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD });
const pepper = 'integration-test-pepper-that-is-never-production';
const phones = [];
const phone = () => { const value = `+2126${String(randomInt(0, 100_000_000)).padStart(8, '0')}`; phones.push(value); return value; };

before(async () => {
  const { rows: [row] } = await pool.query('SELECT current_database() AS name');
  assert.match(row.name, /_(test|validation)$/);
});
after(async () => {
  if (phones.length) {
    await pool.query('DELETE FROM audit_events WHERE actor_user_id IN (SELECT id FROM users WHERE phone_e164 = ANY($1::text[]))', [phones]);
    await pool.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE phone_e164 = ANY($1::text[]))', [phones]);
    await pool.query('DELETE FROM users WHERE phone_e164 = ANY($1::text[])', [phones]);
    await pool.query('DELETE FROM phone_otp_challenges WHERE phone_e164 = ANY($1::text[])', [phones]);
  }
  await pool.end();
});

describe('PostgreSQL phone OTP authentication', () => {
  it('stores only a hash, creates a patient session, and rejects replay', async () => {
    const phoneE164 = phone(); let deliveredCode;
    const requested = await requestPhoneOtp({ pool, phoneE164, requestIp: '127.0.0.1', pepper,
      sendOtp: async ({ code }) => { deliveredCode = code; } });
    const stored = await pool.query('SELECT code_hash::text, attempt_count FROM phone_otp_challenges WHERE id = $1', [requested.challenge.id]);
    assert.equal(stored.rows[0].code_hash.includes(deliveredCode), false);
    assert.equal(stored.rows[0].attempt_count, 0);

    const wrongCode = String((Number(deliveredCode) + 1) % 1_000_000).padStart(6, '0');
    await assert.rejects(
      verifyPhoneOtp({ pool, challengeId: requested.challenge.id, phoneE164, code: wrongCode,
        pepper, idleTtlSeconds: 1800, absoluteTtlSeconds: 604800 }),
      (error) => error.code === 'otp_invalid_or_expired',
    );
    const attempted = await pool.query('SELECT attempt_count FROM phone_otp_challenges WHERE id = $1', [requested.challenge.id]);
    assert.equal(attempted.rows[0].attempt_count, 1);

    const authenticated = await verifyPhoneOtp({ pool, challengeId: requested.challenge.id, phoneE164,
      code: deliveredCode, pepper, idleTtlSeconds: 1800, absoluteTtlSeconds: 604800 });
    assert.equal(authenticated.user.role, 'patient');
    assert.match(authenticated.token, /^[A-Za-z0-9_-]{43}$/);
    const audit = await pool.query(
      "SELECT action FROM audit_events WHERE actor_user_id = $1 AND action = 'auth.phone_otp_succeeded'",
      [authenticated.user.id],
    );
    assert.equal(audit.rowCount, 1);
    await assert.rejects(
      verifyPhoneOtp({ pool, challengeId: requested.challenge.id, phoneE164, code: deliveredCode,
        pepper, idleTtlSeconds: 1800, absoluteTtlSeconds: 604800 }),
      (error) => error.code === 'otp_invalid_or_expired',
    );
  });

  it('serializes simultaneous resend requests so only one challenge is issued', async () => {
    const phoneE164 = phone();
    const attempts = await Promise.allSettled([1, 2].map((index) => requestPhoneOtp({
      pool, phoneE164, requestIp: `127.0.0.${index}`, pepper, sendOtp: async () => {},
    })));
    assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = attempts.find((result) => result.status === 'rejected');
    assert.equal(rejected.reason.code, 'otp_resend_cooldown');
  });

  it('retains throttle state when the SMS provider is unavailable', async () => {
    const phoneE164 = phone();
    await assert.rejects(
      requestPhoneOtp({ pool, phoneE164, requestIp: '127.0.0.10', pepper,
        sendOtp: async () => { throw new Error('provider unavailable'); } }),
      (error) => error.code === 'otp_delivery_unavailable',
    );
    const stored = await pool.query('SELECT count(*)::int AS count FROM phone_otp_challenges WHERE phone_e164 = $1', [phoneE164]);
    assert.equal(stored.rows[0].count, 1);
    await assert.rejects(
      requestPhoneOtp({ pool, phoneE164, requestIp: '127.0.0.10', pepper, sendOtp: async () => {} }),
      (error) => error.code === 'otp_resend_cooldown',
    );
  });
});
