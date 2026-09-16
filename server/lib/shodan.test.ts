import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShodanPassiveAnalysis } from './shodan';

test('Shodan host gözlemi pasif SSL ve HTTP güvenlik sonucuna dönüştürülür', () => {
  const result = buildShodanPassiveAnalysis({
    last_update: '2026-09-15T12:00:00Z',
    data: [{
      port: 443,
      timestamp: '2026-09-15T11:00:00Z',
      ssl: {
        versions: ['-TLSv1', 'TLSv1.2', 'TLSv1.3'],
        cipher: { name: 'TLS_AES_256_GCM_SHA384', version: 'TLSv1.3' },
        cert: {
          expired: false,
          expires: '2030-01-01T00:00:00Z',
          issuer: { CN: 'Test CA' },
          subject: { CN: 'example.com' },
          subjectAltName: ['example.com']
        }
      },
      http: {
        headers: {
          'strict-transport-security': 'max-age=31536000',
          'x-frame-options': 'DENY',
          'x-content-type-options': 'nosniff'
        }
      }
    }]
  });
  assert.equal(result.source, 'shodan');
  assert.equal(result.ssl?.source, 'shodan');
  assert.equal(result.ssl?.passive, true);
  assert.equal(result.advanced?.security.source, 'shodan');
  assert.equal(result.advanced?.security.score, 55);
});
