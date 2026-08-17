import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSession,
  generateSessionSecret,
  hashSessionSecret,
  revokeSession,
} from '../src/auth/sessionService.js';

describe('session service', () => {
  it('generates cryptographically sized URL-safe secrets', () => {
    const first = generateSessionSecret();
    const second = generateSessionSecret();

    assert.match(first, /^[A-Za-z0-9_-]{43}$/);
    assert.match(second, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(first, second);
    assert.equal(hashSessionSecret(first).length, 32);
  });

  it('stores only token hashes with bounded expirations', async () => {
    let captured;
    const pool = {
      async query(sql, values) {
        captured = { sql, values };
        return {
          rowCount: 1,
          rows: [
            {
              id: '0198c09c-0946-71b7-9c7a-43c2888cb87b',
              user_id: values[0],
              assurance_level: values[4],
              created_at: values[5],
              idle_expires_at: values[6],
              absolute_expires_at: values[7],
            },
          ],
        };
      },
    };
    const now = new Date('2026-08-17T12:00:00.000Z');

    const result = await createSession({
      pool,
      userId: '0198c09c-3a87-73d1-9b21-5f4b6aa7359d',
      authenticationMethods: ['phone_otp'],
      assuranceLevel: 1,
      idleTtlSeconds: 1800,
      absoluteTtlSeconds: 604800,
      now,
    });

    assert.match(result.token, /^[A-Za-z0-9_-]{43}$/);
    assert.match(result.csrfToken, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(result.token, result.csrfToken);
    assert.ok(Buffer.isBuffer(captured.values[1]));
    assert.ok(Buffer.isBuffer(captured.values[2]));
    assert.equal(captured.values[1].length, 32);
    assert.equal(captured.values[2].length, 32);
    assert.equal(captured.values[6].toISOString(), '2026-08-17T12:30:00.000Z');
    assert.equal(captured.values[7].toISOString(), '2026-08-24T12:00:00.000Z');
    assert.equal(captured.sql.includes(result.token), false);
    assert.equal(captured.sql.includes(result.csrfToken), false);
  });

  it('rejects invalid expiry policy before accessing the database', async () => {
    let queryCount = 0;
    const pool = {
      async query() {
        queryCount += 1;
      },
    };

    await assert.rejects(
      createSession({
        pool,
        userId: '0198c09c-3a87-73d1-9b21-5f4b6aa7359d',
        authenticationMethods: ['phone_otp'],
        idleTtlSeconds: 7200,
        absoluteTtlSeconds: 3600,
      }),
      /idle expiry cannot exceed absolute expiry/i,
    );
    assert.equal(queryCount, 0);
  });

  it('rejects unknown authentication methods before accessing the database', async () => {
    let queryCount = 0;
    const pool = {
      async query() {
        queryCount += 1;
      },
    };

    await assert.rejects(
      createSession({
        pool,
        userId: '0198c09c-3a87-73d1-9b21-5f4b6aa7359d',
        authenticationMethods: ['client_supplied_role'],
        idleTtlSeconds: 1800,
        absoluteTtlSeconds: 3600,
      }),
      /unsupported value/,
    );
    assert.equal(queryCount, 0);
  });

  it('revokes only a session owned by the authenticated user', async () => {
    let capturedValues;
    const pool = {
      async query(_sql, values) {
        capturedValues = values;
        return { rowCount: 1, rows: [{ id: values[0], revoked_at: new Date() }] };
      },
    };

    const result = await revokeSession({
      pool,
      sessionId: '0198c0b4-6f9c-74e1-b206-1c3c3ba0470a',
      userId: '0198c0b4-a2e3-7abf-9d9c-35c95a3f5322',
      reason: 'user_logout',
    });

    assert.equal(result.id, capturedValues[0]);
    assert.deepEqual(capturedValues, [
      '0198c0b4-6f9c-74e1-b206-1c3c3ba0470a',
      '0198c0b4-a2e3-7abf-9d9c-35c95a3f5322',
      'user_logout',
    ]);
  });
});
