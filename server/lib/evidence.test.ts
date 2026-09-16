import assert from 'node:assert/strict';
import test from 'node:test';
import { lightweightTechnologies, publicResponseHeaders, securityFromHeaders } from './evidence';

test('canlı kanıt güvenlik header puanını hesaplar', () => {
  const result = securityFromHeaders({
    'strict-transport-security': 'max-age=31536000',
    'content-security-policy': "default-src 'self'",
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
    'permissions-policy': 'geolocation=()',
    'x-xss-protection': '0',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp'
  });
  assert.equal(result.score, 100);
  assert.equal(result.grade, 'A');
  assert.deepEqual(result.missing, []);
});

test('hafif teknoloji tespiti WordPress ve IIS kanıtını tanır', () => {
  const result = lightweightTechnologies({ server: 'Microsoft-IIS/10.0' }, '<link href="/wp-content/theme.css">', 'browserless-live');
  assert.deepEqual(result.map((item) => item.name).sort(), ['IIS', 'WordPress']);
  assert.ok(result.every((item) => item.sources[0] === 'browserless-live' && item.passive === false));
});

test('sunucu sürümünü ve Spring/Java header kanıtını korur', () => {
  const result = lightweightTechnologies({ server: 'Caddy/2.8.4', 'x-application-context': 'app:prod', 'x-powered-by': 'Java' }, '');
  assert.deepEqual(result.map((item) => item.name).sort(), ['Caddy', 'Java', 'Spring']);
  assert.equal(result.find((item) => item.name === 'Caddy')?.version, '2.8.4');
});

test('gösterilen HTTP başlıklarından hassas kimlik bilgilerini çıkarır', () => {
  const headers = publicResponseHeaders({
    server: 'nginx', 'content-type': 'text/html', 'set-cookie': 'session=secret',
    authorization: 'Bearer secret', 'www-authenticate': 'Basic realm=private'
  });
  assert.deepEqual(headers, { server: 'nginx', 'content-type': 'text/html' });
});
