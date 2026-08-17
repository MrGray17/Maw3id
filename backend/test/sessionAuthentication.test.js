import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearSessionCookie,
  createSessionAuthentication,
  readCookie,
  serializeSessionCookie,
} from '../src/auth/sessionAuthentication.js';
import { generateSessionSecret, hashSessionSecret } from '../src/auth/sessionService.js';

function requestWithCookie(cookie) {
  return {
    get(name) {
      return name === 'cookie' ? cookie : undefined;
    },
  };
}

async function runMiddleware(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (error) => resolve(error));
  });
}

describe('session cookie handling', () => {
  it('reads exactly one matching cookie', () => {
    assert.equal(readCookie('theme=dark; maw3id_session=token123', 'maw3id_session'), 'token123');
    assert.equal(
      readCookie('maw3id_session=first; maw3id_session=second', 'maw3id_session'),
      null,
    );
    assert.equal(readCookie('other=value', 'maw3id_session'), null);
  });

  it('serializes production-safe cookie attributes', () => {
    const token = generateSessionSecret();
    const cookie = serializeSessionCookie({
      name: 'maw3id_session',
      token,
      secure: true,
      maxAgeSeconds: 1800,
    });

    assert.match(cookie, /^maw3id_session=/);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Max-Age=1800/);
    assert.match(cookie, /Secure/);
  });

  it('clears a cookie without retaining a session token', () => {
    const cookie = clearSessionCookie({ name: 'maw3id_session', secure: true });

    assert.match(cookie, /^maw3id_session=;/);
    assert.match(cookie, /Max-Age=0/);
  });

  it('rejects unsafe cookie configuration', () => {
    assert.throws(
      () => serializeSessionCookie({ name: undefined, token: '', secure: true, maxAgeSeconds: 0 }),
      /Invalid session cookie name/,
    );
    assert.throws(
      () =>
        serializeSessionCookie({
          name: 'maw3id_session',
          token: 'attacker; Domain=example.com',
          secure: true,
          maxAgeSeconds: 10,
        }),
      /Invalid session token/,
    );
  });
});

describe('session authentication middleware', () => {
  it('does not query the database when the cookie is missing or malformed', async () => {
    let queryCount = 0;
    const pool = {
      async query() {
        queryCount += 1;
        return { rowCount: 0, rows: [] };
      },
    };
    const authenticate = createSessionAuthentication({
      pool,
      cookieName: 'maw3id_session',
      idleTtlSeconds: 1800,
    });

    assert.equal(await runMiddleware(authenticate, requestWithCookie(undefined)), undefined);
    assert.equal(
      await runMiddleware(authenticate, requestWithCookie('maw3id_session=not-a-valid-token')),
      undefined,
    );
    assert.equal(queryCount, 0);
  });

  it('authenticates an active session and periodically extends idle expiry', async () => {
    const token = generateSessionSecret();
    const session = {
      session_id: '0198c071-650d-7fd2-8d81-4fa4008c557e',
      user_id: '0198c071-8a10-7c0c-823d-ddf29fd0ebf0',
      csrf_token_hash: hashSessionSecret(generateSessionSecret()),
      authentication_methods: ['phone_otp'],
      assurance_level: 1,
      role: 'patient',
    };
    const calls = [];
    const pool = {
      async query(sql, values) {
        calls.push({ sql, values });
        if (calls.length === 1) {
          return { rowCount: 1, rows: [session] };
        }
        return { rowCount: 1, rows: [] };
      },
    };
    const req = requestWithCookie(`maw3id_session=${token}`);
    const authenticate = createSessionAuthentication({
      pool,
      cookieName: 'maw3id_session',
      idleTtlSeconds: 1800,
    });

    const error = await runMiddleware(authenticate, req);

    assert.equal(error, undefined);
    assert.deepEqual(req.auth, {
      sessionId: session.session_id,
      userId: session.user_id,
      role: 'patient',
      csrfTokenHash: session.csrf_token_hash,
      authenticationMethods: ['phone_otp'],
      assuranceLevel: 1,
    });
    assert.equal(calls.length, 2);
    assert.match(calls[0].sql, /revoked_at IS NULL/);
    assert.match(calls[0].sql, /idle_expires_at > now\(\)/);
    assert.match(calls[0].sql, /absolute_expires_at > now\(\)/);
    assert.ok(Buffer.isBuffer(calls[0].values[0]));
    assert.deepEqual(calls[0].values[0], hashSessionSecret(token));
    assert.equal(calls[1].values[0], session.session_id);
    assert.equal(calls[1].values[1], 1800);
  });

  it('fails closed when a session is expired, revoked, or unknown', async () => {
    const pool = {
      async query() {
        return { rowCount: 0, rows: [] };
      },
    };
    const req = requestWithCookie(`maw3id_session=${generateSessionSecret()}`);
    const authenticate = createSessionAuthentication({
      pool,
      cookieName: 'maw3id_session',
      idleTtlSeconds: 1800,
    });

    assert.equal(await runMiddleware(authenticate, req), undefined);
    assert.equal(req.auth, undefined);
  });

  it('passes database failures to centralized error handling', async () => {
    const databaseError = new Error('database unavailable');
    const pool = {
      async query() {
        throw databaseError;
      },
    };
    const req = requestWithCookie(`maw3id_session=${generateSessionSecret()}`);
    const authenticate = createSessionAuthentication({
      pool,
      cookieName: 'maw3id_session',
      idleTtlSeconds: 1800,
    });

    assert.equal(await runMiddleware(authenticate, req), databaseError);
    assert.equal(req.auth, undefined);
  });
});
