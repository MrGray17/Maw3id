import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../src/app.js';

const config = {
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

describe('GET /api/v1/doctors/nearby', () => {
  let server;
  let baseUrl;
  const calls = [];

  before(async () => {
    const app = createApp(config, {
      doctorSearchService: async (input) => {
        calls.push(input);
        return [];
      },
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('accepts a bounded city search and returns the public response envelope', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/doctors/nearby?specialty=Cardiologie&city=Rabat&acceptingOnly=true&limit=10&page=2`,
      { headers: { 'x-request-id': 'doctor-search-test' } },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.data, []);
    assert.equal(body.meta.requestId, 'doctor-search-test');
    assert.ok(Date.parse(body.meta.generatedAt));
    assert.equal(calls.at(-1).criteria.specialty, 'Cardiologie');
    assert.equal(calls.at(-1).criteria.city, 'Rabat');
    assert.equal(calls.at(-1).criteria.acceptingOnly, true);
    assert.equal(calls.at(-1).criteria.limit, 10);
    assert.equal(calls.at(-1).criteria.offset, 10);
  });

  it('accepts paired coordinates and ignores city when coordinates are authoritative', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/doctors/nearby?specialty=Cardiologie&city=Rabat&latitude=34.02&longitude=-6.84`,
    );

    assert.equal(response.status, 200);
    assert.equal(calls.at(-1).criteria.city, undefined);
    assert.equal(calls.at(-1).criteria.latitude, 34.02);
    assert.equal(calls.at(-1).criteria.longitude, -6.84);
  });

  it('rejects incomplete locations, invalid booleans, and excessive limits', async () => {
    const cases = [
      'specialty=Cardiologie&latitude=34.02',
      'specialty=Cardiologie&city=Rabat&acceptingOnly=yes',
      'specialty=Cardiologie&city=Rabat&limit=500',
      'specialty=C&city=Rabat',
    ];

    for (const query of cases) {
      const response = await fetch(`${baseUrl}/api/v1/doctors/nearby?${query}`);
      const body = await response.json();
      assert.equal(response.status, 422);
      assert.equal(body.error.code, 'validation_failed');
    }
  });
});
