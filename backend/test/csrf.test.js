import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { requireCsrfToken } from '../src/auth/csrf.js';
import { generateSessionSecret, hashSessionSecret } from '../src/auth/sessionService.js';

function runMiddleware(req) {
  return new Promise((resolve) => {
    requireCsrfToken(req, {}, (error) => resolve(error));
  });
}

function request(token, expectedToken) {
  return {
    auth: {
      csrfTokenHash: expectedToken ? hashSessionSecret(expectedToken) : undefined,
    },
    get(name) {
      return name === 'x-csrf-token' ? token : undefined;
    },
  };
}

describe('CSRF validation', () => {
  it('accepts the token bound to the authenticated session', async () => {
    const token = generateSessionSecret();
    assert.equal(await runMiddleware(request(token, token)), undefined);
  });

  it('rejects missing, malformed, and incorrect tokens with the same public error', async () => {
    const expected = generateSessionSecret();
    const attempts = [undefined, 'invalid', generateSessionSecret()];

    for (const attempt of attempts) {
      const error = await runMiddleware(request(attempt, expected));
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, 'csrf_validation_failed');
      assert.equal(error.message, 'Request could not be verified.');
    }
  });
});
