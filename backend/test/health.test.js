import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';

describe('health endpoints', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp({
      env: 'test',
      isProduction: false,
      port: 0,
      serviceName: 'maw3id-api-test',
      allowedOrigins: ['http://localhost:5173'],
      databaseUrl: null,
      sessionCookieName: 'maw3id_session',
      sessionIdleTtlSeconds: 1800,
      sessionAbsoluteTtlSeconds: 604800,
    });

    server = app.listen(0);

    await new Promise((resolve) => server.once('listening', resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  it('returns service health without touching private data', async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'maw3id-api-test');
    assert.equal(body.environment, 'test');
    assert.ok(body.timestamp);
  });

  it('adds request ids and security headers', async () => {
    const response = await fetch(`${baseUrl}/healthz`, {
      headers: {
        'x-request-id': 'test-request-id',
      },
    });

    assert.equal(response.headers.get('x-request-id'), 'test-request-id');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
  });

  it('replaces unsafe caller-provided request ids', async () => {
    const response = await fetch(`${baseUrl}/healthz`, {
      headers: {
        'x-request-id': 'unsafe request id with spaces',
      },
    });

    const requestId = response.headers.get('x-request-id');
    assert.notEqual(requestId, 'unsafe request id with spaces');
    assert.match(requestId, /^[0-9a-f-]{36}$/);
  });

  it('returns structured errors for unknown routes', async () => {
    const response = await fetch(`${baseUrl}/missing`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.code, 'route_not_found');
    assert.ok(body.error.requestId);
  });
});
