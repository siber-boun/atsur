import assert from 'node:assert/strict';
import test from 'node:test';
import { PORT_TARGETS } from './config';

test('servis taraması tam ve benzersiz 45 portu içerir', () => {
  assert.equal(PORT_TARGETS.length, 45);
  assert.equal(new Set(PORT_TARGETS.map((target) => target.port)).size, 45);
});

test('SQL Server Browser 1434 UDP, diğer ERP veritabanları TCP taranır', () => {
  assert.equal(PORT_TARGETS.find((target) => target.port === 1434)?.transport, 'udp');
  for (const port of [1433, 1521, 1708, 3200, 3300, 3600]) {
    assert.equal(PORT_TARGETS.find((target) => target.port === port)?.transport, 'tcp');
  }
});

test('istenen yeni güvenlik, panel ve kamera portları listede bulunur', () => {
  const ports = new Set(PORT_TARGETS.map((target) => target.port));
  for (const port of [10443, 2082, 2083, 2086, 2087, 554, 37777, 8931, 7000, 7001, 8181, 7047, 7048, 7085]) {
    assert.ok(ports.has(port), `${port} listede yok`);
  }
});
