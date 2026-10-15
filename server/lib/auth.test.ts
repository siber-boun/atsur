import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { allowApiRequest, createSessionToken, revokeSessionToken, sessionFromToken, verifyLogin } from './auth';

const original = {
  email: process.env.OSINT_LOGIN_EMAIL,
  hash: process.env.OSINT_LOGIN_PASSWORD_HASH,
  secret: process.env.OSINT_SESSION_SECRET
};
const password = 'unit-test-password-12';
const salt = randomBytes(16);
process.env.OSINT_LOGIN_EMAIL = 'owner@example.test';
process.env.OSINT_LOGIN_PASSWORD_HASH = `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 64).toString('base64url')}`;
process.env.OSINT_SESSION_SECRET = randomBytes(48).toString('base64url');

test('login verifies the configured email and scrypt password hash', () => {
  assert.equal(verifyLogin(' OWNER@example.test ', password), true);
  assert.equal(verifyLogin('other@example.test', password), false);
  assert.equal(verifyLogin('owner@example.test', 'wrong-password'), false);
});

test('session tokens expire, reject tampering, and can be revoked', () => {
  const now = Date.now();
  const token = createSessionToken('owner@example.test', now);
  assert.equal(sessionFromToken(token, now)?.email, 'owner@example.test');
  assert.equal(sessionFromToken(token, now + 2 * 60 * 60 * 1000), null);
  assert.equal(sessionFromToken(`${token}x`, now), null);

  const session = sessionFromToken(token, now);
  assert.ok(session);
  revokeSessionToken(token, session.expiresAt);
  assert.equal(sessionFromToken(token, now), null);
});

test('API requests have a per-user fixed-window limit and reopen after the window', () => {
  const now = Date.now() + 1_000_000;
  process.env.USER_API_REQUESTS = '2';
  process.env.USER_API_WINDOW_MS = '5000';
  assert.equal(allowApiRequest('user@example.test', now).allowed, true);
  assert.equal(allowApiRequest('user@example.test', now + 1).allowed, true);
  assert.equal(allowApiRequest('user@example.test', now + 2).allowed, false);
  assert.equal(allowApiRequest('another@example.test', now + 2).allowed, true);
  assert.equal(allowApiRequest('user@example.test', now + 5000).allowed, true);
  delete process.env.USER_API_REQUESTS;
  delete process.env.USER_API_WINDOW_MS;
});

test('restore auth environment after this file completes', () => {
  for (const [key, value] of Object.entries({
    OSINT_LOGIN_EMAIL: original.email,
    OSINT_LOGIN_PASSWORD_HASH: original.hash,
    OSINT_SESSION_SECRET: original.secret
  })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
