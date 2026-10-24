import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomBytes, scryptSync } from 'node:crypto';
import authRoute from '../routes/auth';
import { requireAuthentication, requireTrustedRequest, validateAuthConfig } from './auth';

test('cookie login, protected API, CSRF, rotation and logout', async () => {
  process.env.OSINT_LOGIN_EMAIL = 'owner@example.test';
  const salt = randomBytes(16);
  const password = 'http-test-only-password';
  process.env.OSINT_LOGIN_PASSWORD_HASH = `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString('base64url')}`;
  validateAuthConfig();
  const app = express();
  app.use(requireTrustedRequest, express.json(), requireAuthentication, authRoute);
  app.get('/api/scan', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    assert.equal((await fetch(base + '/api/scan')).status, 401);
    const login = (extra = {}, suppliedPassword = password) => fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OSINT-Request': '1', ...extra },
      body: JSON.stringify({ email: 'owner@example.test', password: suppliedPassword })
    });
    assert.equal((await login({ Origin: 'https://evil.example' })).status, 403);
    assert.equal((await login({}, 'wrong')).status, 401);
    const response = await login();
    assert.equal(response.status, 200);
    const header = response.headers.get('set-cookie')!;
    for (const flag of [/HttpOnly/, /Secure/, /SameSite=Strict/]) assert.match(header, flag);
    const cookie = header.split(';')[0];
    const session = await response.json() as { csrfToken: string; token?: string };
    assert.equal(session.token, undefined);
    assert.equal((await fetch(base + '/api/scan', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, 'X-OSINT-Request': '1' } })).status, 403);
    const rotated = await login({ Cookie: cookie });
    assert.equal((await fetch(base + '/api/scan', { headers: { Cookie: cookie } })).status, 401);
    const nextCookie = rotated.headers.get('set-cookie')!.split(';')[0];
    const next = await rotated.json() as { csrfToken: string };
    assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: nextCookie, 'X-OSINT-Request': '1', 'X-CSRF-Token': next.csrfToken } })).status, 204);
    assert.equal((await fetch(base + '/api/scan', { headers: { Cookie: nextCookie } })).status, 401);
  } finally { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
});
