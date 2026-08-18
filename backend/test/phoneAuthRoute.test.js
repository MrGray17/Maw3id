import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../src/app.js';
import { hashSessionSecret } from '../src/auth/sessionService.js';

const challengeId = '0198c09c-0946-71b7-9c7a-43c2888cb87b';
const userId = '0198c09c-3a87-73d1-9b21-5f4b6aa7359d';
const config = {
  env: 'test', isProduction: false, port: 0, serviceName: 'test',
  allowedOrigins: ['http://localhost:5173'], databaseUrl: null,
  sessionCookieName: 'maw3id_session', sessionIdleTtlSeconds: 1800,
  sessionAbsoluteTtlSeconds: 604800, otpDeliveryMode: 'development',
  otpHashPepper: 'test-pepper', otpProviderUrl: null, otpProviderToken: null,
};

describe('phone OTP routes', () => {
  let server; let baseUrl; const requests = [];
  before(async () => {
    const app = createApp(config, {
      pool: { query: async () => ({ rowCount: 0, rows: [] }) },
      requestOtpService: async (input) => {
        requests.push(input);
        return { challenge: { id: challengeId, expires_at: '2026-08-18T15:05:00Z', resend_available_at: '2026-08-18T15:01:00Z' }, code: '123456' };
      },
      verifyOtpService: async () => ({
        token: 'a'.repeat(43), csrfToken: 'b'.repeat(43),
        user: { id: userId, fullName: 'Patient Maw3id', role: 'patient' },
      }),
    });
    server = app.listen(0); await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  it('normalizes a Moroccan mobile and returns development code only in development mode', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/phone/request`, {
      method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
      body: JSON.stringify({ phoneNumber: '06 12 34 56 78' }),
    });
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.equal(requests[0].phoneE164, '+212612345678');
    assert.equal(body.data.developmentCode, '123456');
  });

  it('sets an HttpOnly session cookie after successful verification', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/phone/verify`, {
      method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId, phoneNumber: '+212612345678', code: '123456' }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    assert.equal(body.data.user.role, 'patient');
    assert.equal(body.data.csrfToken, 'b'.repeat(43));
  });

  it('rejects untrusted origins and invalid phone numbers', async () => {
    const untrusted = await fetch(`${baseUrl}/api/v1/auth/phone/request`, {
      method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ phoneNumber: '0612345678' }),
    });
    assert.equal(untrusted.status, 403);
    const invalid = await fetch(`${baseUrl}/api/v1/auth/phone/request`, {
      method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
      body: JSON.stringify({ phoneNumber: '+33123456789' }),
    });
    assert.equal(invalid.status, 422);
  });
});

describe('authenticated session routes', () => {
  let server; let baseUrl;
  before(async () => {
    const pool = { query: async (sql) => ({ rowCount: 1, rows: [{ id: String(sql).includes('csrf_token_hash') ? 'session' : 'session' }] }) };
    const app = createApp(config, {
      pool,
      authenticate: (req, _res, next) => {
        req.auth = { sessionId: challengeId, userId, role: 'patient', csrfTokenHash: hashSessionSecret('c'.repeat(43)) };
        next();
      },
      requestOtpService: async () => {}, verifyOtpService: async () => {},
    });
    server = app.listen(0); await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  it('rotates CSRF on session restore and clears the cookie on logout', async () => {
    const session = await fetch(`${baseUrl}/api/v1/auth/session`);
    const body = await session.json();
    assert.equal(session.status, 200);
    assert.match(body.data.csrfToken, /^[A-Za-z0-9_-]{43}$/);
    const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST', headers: { origin: 'http://localhost:5173', 'x-csrf-token': 'c'.repeat(43) },
    });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  });
});
