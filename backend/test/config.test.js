import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertProductionConfig, loadConfig } from '../src/config.js';

describe('configuration', () => {
  it('loads safe local defaults', () => {
    const config = loadConfig({});

    assert.equal(config.env, 'development');
    assert.equal(config.sessionCookieName, 'maw3id_session');
    assert.equal(config.sessionIdleTtlSeconds, 1800);
    assert.equal(config.sessionAbsoluteTtlSeconds, 604800);
    assert.deepEqual(config.allowedOrigins, ['http://localhost:5173', 'http://127.0.0.1:5173']);
  });

  it('rejects origins with paths or unsupported schemes', () => {
    assert.throws(
      () => loadConfig({ CORS_ALLOWED_ORIGINS: 'https://app.maw3id.ma/path' }),
      /scheme and authority/,
    );
    assert.throws(
      () => loadConfig({ CORS_ALLOWED_ORIGINS: 'javascript:alert(1)' }),
      /scheme and authority/,
    );
  });

  it('rejects an idle session lifetime above the absolute lifetime', () => {
    assert.throws(
      () =>
        loadConfig({
          SESSION_IDLE_TTL_SECONDS: '7200',
          SESSION_ABSOLUTE_TTL_SECONDS: '3600',
        }),
      /idle TTL cannot exceed/i,
    );
  });

  it('rejects invalid network ports', () => {
    assert.throws(() => loadConfig({ PORT: 'not-a-number' }), /PORT must be an integer/);
    assert.throws(() => loadConfig({ PORT: '70000' }), /PORT must be an integer/);
  });

  it('requires a database and HTTPS origins in production', () => {
    const missingDatabase = loadConfig({
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://app.maw3id.ma',
    });
    assert.throws(() => assertProductionConfig(missingDatabase), /requires DATABASE_URL/);

    const insecureOrigin = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://example',
      CORS_ALLOWED_ORIGINS: 'http://app.maw3id.ma',
    });
    assert.throws(() => assertProductionConfig(insecureOrigin), /must use HTTPS/);

    const valid = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://example',
      CORS_ALLOWED_ORIGINS: 'https://app.maw3id.ma',
      SESSION_COOKIE_NAME: '__Host-maw3id_session',
      OTP_HASH_PEPPER: 'a-secure-production-pepper-value-123456789',
      OTP_DELIVERY_MODE: 'http',
      OTP_PROVIDER_URL: 'https://sms.example.test/send',
      OTP_PROVIDER_TOKEN: 'provider-secret',
    });
    assert.doesNotThrow(() => assertProductionConfig(valid));
  });

  it('requires host-bound session cookies and non-loopback origins in production', () => {
    const weakCookie = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://example',
      CORS_ALLOWED_ORIGINS: 'https://app.maw3id.ma',
      SESSION_COOKIE_NAME: 'maw3id_session',
    });
    assert.throws(() => assertProductionConfig(weakCookie), /__Host-/);

    const loopback = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://example',
      CORS_ALLOWED_ORIGINS: 'https://localhost:5173',
      SESSION_COOKIE_NAME: '__Host-maw3id_session',
    });
    assert.throws(() => assertProductionConfig(loopback), /loopback/);

    const wrongDatabaseProtocol = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'https://database.example.com',
      CORS_ALLOWED_ORIGINS: 'https://app.maw3id.ma',
      SESSION_COOKIE_NAME: '__Host-maw3id_session',
    });
    assert.throws(() => assertProductionConfig(wrongDatabaseProtocol), /PostgreSQL protocol/);
  });

  it('rejects unsafe production OTP delivery configuration', () => {
    const config = loadConfig({
      NODE_ENV: 'production', DATABASE_URL: 'postgresql://example',
      CORS_ALLOWED_ORIGINS: 'https://app.maw3id.ma', SESSION_COOKIE_NAME: '__Host-maw3id_session',
      OTP_HASH_PEPPER: 'a-secure-production-pepper-value-123456789', OTP_DELIVERY_MODE: 'http',
      OTP_PROVIDER_URL: 'http://sms.example.test/send', OTP_PROVIDER_TOKEN: 'provider-secret',
    });
    assert.throws(() => assertProductionConfig(config), /valid HTTPS URL/);
  });
});
