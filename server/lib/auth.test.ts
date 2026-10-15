import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { createSessionToken, revokeSessionToken, sessionFromToken, verifyLogin } from './auth';

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

test('restore auth environment after this file completes', () => {
  for (const [key, value] of Object.entries({
    OSINT_LOGIN_EMAIL: original.email,
    OSINT_LOGIN_PASSWORD_HASH: original.hash,
    OSINT_SESSION_SECRET: original.secret
  })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
