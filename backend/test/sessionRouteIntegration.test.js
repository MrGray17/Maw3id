import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { generateSessionSecret, hashSessionSecret } from '../src/auth/sessionService.js';
import { createApp } from '../src/app.js';

const QUEUE_SESSION_ID = '0198c148-e4dd-7337-bdaa-803584ee90a8';
const PATIENT_ID = '0198c149-12fa-738d-b96e-ae3deebdb8f9';
const SESSION_ID = '0198c149-31db-7ed5-b91b-1a2d6690c1b6';

describe('cookie session to protected queue route', () => {
  let server;
  let baseUrl;
  let token;
  let csrfToken;
  let receivedCommand;
  const databaseCalls = [];

  before(async () => {
    token = generateSessionSecret();
    csrfToken = generateSessionSecret();
    const pool = {
      async query(sql, values) {
        databaseCalls.push({ sql, values });

        if (/FROM auth_sessions AS sessions/.test(sql)) {
          return {
            rowCount: 1,
            rows: [
              {
                session_id: SESSION_ID,
                user_id: PATIENT_ID,
                csrf_token_hash: hashSessionSecret(csrfToken),
                authentication_methods: ['phone_otp'],
                assurance_level: 1,
                role: 'patient',
              },
            ],
          };
        }

        return { rowCount: 1, rows: [] };
      },
    };
    const joinQueueService = async (command) => {
      receivedCommand = command;
      return {
        ticket: { id: '0198c149-82e2-7b2c-8658-91dfd718d8e3', ticket_number: 1 },
        position: 1,
        estimatedWaitMinutes: 0,
      };
    };
    const app = createApp(
      {
        env: 'test',
        isProduction: false,
        port: 0,
        serviceName: 'maw3id-api-test',
        allowedOrigins: ['http://localhost:5173'],
        databaseUrl: null,
        sessionCookieName: 'maw3id_session',
        sessionIdleTtlSeconds: 1800,
        sessionAbsoluteTtlSeconds: 604800,
      },
      { pool, joinQueueService },
    );

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('derives patient identity from a valid server-side session', async () => {
    const response = await fetch(`${baseUrl}/api/v1/queue-sessions/${QUEUE_SESSION_ID}/tickets`, {
      method: 'POST',
      headers: {
        cookie: `maw3id_session=${token}`,
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: '{}',
    });

    assert.equal(response.status, 201);
    assert.equal(receivedCommand.patientId, PATIENT_ID);
    assert.equal(receivedCommand.actorUserId, PATIENT_ID);
    assert.deepEqual(databaseCalls[0].values, [hashSessionSecret(token)]);
    assert.equal(databaseCalls[0].sql.includes(token), false);
  });
});
