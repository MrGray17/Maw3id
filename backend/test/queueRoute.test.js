import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { hashSessionSecret } from '../src/auth/sessionService.js';

const QUEUE_SESSION_ID = '0198b8be-b3ae-7d24-8f8a-6550de959f01';
const PATIENT_ID = '0198b8be-f9a1-7659-bb8a-e07b3fef1d28';
const CSRF_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function testConfig() {
  return {
    env: 'test',
    isProduction: false,
    port: 0,
    serviceName: 'maw3id-api-test',
    allowedOrigins: ['http://localhost:5173'],
    databaseUrl: null,
    sessionCookieName: 'maw3id_session',
    sessionIdleTtlSeconds: 1800,
    sessionAbsoluteTtlSeconds: 604800,
  };
}

async function listen(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe('POST /api/v1/queue-sessions/:queueSessionId/tickets', () => {
  let server;
  let baseUrl;
  let receivedCommand;
  let serviceCallCount;

  before(async () => {
    const authenticate = (req, _res, next) => {
      const role = req.get('x-test-role');
      if (role) {
        req.auth = {
          userId: PATIENT_ID,
          role,
          csrfTokenHash: hashSessionSecret(CSRF_TOKEN),
        };
      }
      next();
    };

    const joinQueueService = async (command) => {
      serviceCallCount += 1;
      receivedCommand = command;
      return {
        ticket: {
          id: '0198b8c0-4283-7794-b814-8b4fbb8b2cea',
          queue_session_id: QUEUE_SESSION_ID,
          patient_id: PATIENT_ID,
          ticket_number: 12,
          status: 'waiting',
          source: 'online',
        },
        position: 4,
        estimatedWaitMinutes: 45,
      };
    };

    const started = await listen(
      createApp(testConfig(), {
        authenticate,
        joinQueueService,
        pool: { name: 'test-pool' },
      }),
    );

    server = started.server;
    baseUrl = started.baseUrl;
  });

  after(async () => {
    await close(server);
  });

  it('rejects unauthenticated requests before calling the queue service', async () => {
    serviceCallCount = 0;

    const response = await fetch(`${baseUrl}/api/v1/queue-sessions/${QUEUE_SESSION_ID}/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error.code, 'authentication_required');
    assert.equal(serviceCallCount, 0);
  });

  it('rejects authenticated users who are not patients', async () => {
    serviceCallCount = 0;

    const response = await fetch(`${baseUrl}/api/v1/queue-sessions/${QUEUE_SESSION_ID}/tickets`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': CSRF_TOKEN,
        'x-test-role': 'doctor',
      },
      body: '{}',
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error.code, 'insufficient_permissions');
    assert.equal(serviceCallCount, 0);
  });

  it('rejects invalid queue session ids', async () => {
    serviceCallCount = 0;

    const response = await fetch(`${baseUrl}/api/v1/queue-sessions/not-a-uuid/tickets`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': CSRF_TOKEN,
        'x-test-role': 'patient',
      },
      body: '{}',
    });
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.error.code, 'validation_failed');
    assert.equal(body.error.details.fields.queueSessionId, 'Must be a valid UUID.');
    assert.equal(serviceCallCount, 0);
  });

  it('returns a client error for malformed JSON', async () => {
    serviceCallCount = 0;

    const response = await fetch(`${baseUrl}/api/v1/queue-sessions/${QUEUE_SESSION_ID}/tickets`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': CSRF_TOKEN,
        'x-test-role': 'patient',
      },
      body: '{"broken":',
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'invalid_json');
    assert.equal(serviceCallCount, 0);
  });

  it('rejects request bodies above the API limit', async () => {
    serviceCallCount = 0;

    const response = await fetch(`${baseUrl}/api/v1/queue-sessions/${QUEUE_SESSION_ID}/tickets`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': CSRF_TOKEN,
        'x-test-role': 'patient',
      },
      body: JSON.stringify({ padding: 'x'.repeat(33 * 1024) }),
    });
    const body = await response.json();

    assert.equal(response.status, 413);
    assert.equal(body.error.code, 'payload_too_large');
    assert.equal(serviceCallCount, 0);
  });

  it('rejects client-supplied identity fields', async () => {
    serviceCallCount = 0;

    const response = await fetch(`${baseUrl}/api/v1/queue-sessions/${QUEUE_SESSION_ID}/tickets`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': CSRF_TOKEN,
        'x-test-role': 'patient',
      },
      body: JSON.stringify({ patientId: 'someone-else' }),
    });
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.error.code, 'validation_failed');
    assert.equal(body.error.details.fields.patientId, 'Field is not allowed.');
    assert.equal(serviceCallCount, 0);
  });

  it('creates an online ticket using the authenticated patient identity', async () => {
    serviceCallCount = 0;

    const response = await fetch(`${baseUrl}/api/v1/queue-sessions/${QUEUE_SESSION_ID}/tickets`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': CSRF_TOKEN,
        'x-request-id': 'queue-route-test',
        'x-test-role': 'patient',
      },
      body: '{}',
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.data.ticket.ticket_number, 12);
    assert.equal(body.data.position, 4);
    assert.equal(body.data.estimatedWaitMinutes, 45);
    assert.equal(body.meta.requestId, 'queue-route-test');
    assert.equal(serviceCallCount, 1);
    assert.deepEqual(receivedCommand, {
      pool: { name: 'test-pool' },
      queueSessionId: QUEUE_SESSION_ID,
      patientId: PATIENT_ID,
      actorUserId: PATIENT_ID,
      source: 'online',
      requestId: 'queue-route-test',
    });
  });

  it('rejects a missing or incorrect CSRF token', async () => {
    serviceCallCount = 0;

    const response = await fetch(`${baseUrl}/api/v1/queue-sessions/${QUEUE_SESSION_ID}/tickets`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-role': 'patient',
      },
      body: '{}',
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error.code, 'csrf_validation_failed');
    assert.equal(serviceCallCount, 0);
  });
});
