import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectCookies } from './cookies';
import { CORS_PROBE_ORIGIN, inspectCors } from './cors';
import { parseDmarc } from './dmarc';

test('cookie denetimi Secure, HttpOnly ve SameSite bulgularını ayırır', () => {
  const [session, permissive] = inspectCookies([
    'session_id=abc; Path=/; SameSite=Lax',
    'preferences=dark; Path=/; SameSite=None'
  ]);
  assert.deepEqual(session.issues, ['HTTPS üzerinde Secure bayrağı yok', 'Oturum benzeri cookie’de HttpOnly bayrağı yok']);
  assert.equal(permissive.issues.includes('SameSite=None için Secure bayrağı zorunludur'), true);
});

test('CORS yansıtması credentials ile birlikte yüksek önem taşır', () => {
  const finding = inspectCors({
    'access-control-allow-origin': CORS_PROBE_ORIGIN,
    'access-control-allow-credentials': 'true'
  });
  assert.equal(finding.reflectsOrigin, true);
  assert.equal(finding.severity, 'high');
});

test('DMARC parser policy, yüzdelik ve alignment alanlarını ayrıştırır', () => {
  const result = parseDmarc(['v=DMARC1; p=reject; pct=50; rua=mailto:d@example.com; adkim=s; aspf=r']);
  assert.equal(result.policy, 'reject');
  assert.equal(result.percentage, 50);
  assert.equal(result.aggregateReports, true);
  assert.equal(result.adkim, 's');
});
