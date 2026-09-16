import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSpf } from './spf';

const records = (map: Record<string, string[]>) => async (host: string) => (map[host] || []).map((entry) => [entry]);

test('SPF include zincirindeki lookup sayısını hesaplar', async () => {
  const result = await evaluateSpf('example.com', { resolveTxt: records({
    'example.com': ['v=spf1 include:_spf.example.net -all'],
    '_spf.example.net': ['v=spf1 a mx ~all']
  }) });
  assert.equal(result.hasRecord, true);
  assert.equal(result.lookupCount, 3);
  assert.equal(result.all, '-all');
  assert.equal(result.permerror, false);
});

test('SPF on lookup sınırını permerror olarak işaretler', async () => {
  const result = await evaluateSpf('example.com', { resolveTxt: records({
    'example.com': [`v=spf1 ${Array.from({ length: 11 }, () => 'a').join(' ')} -all`]
  }) });
  assert.equal(result.permerror, true);
  assert.equal(result.permerrorReason, 'too-many-lookups');
  assert.equal(result.lookupCount, 11);
});

test('SPF include döngüsünü syntax permerror olarak işaretler', async () => {
  const result = await evaluateSpf('example.com', { resolveTxt: records({
    'example.com': ['v=spf1 include:a.example.com -all'],
    'a.example.com': ['v=spf1 include:example.com -all']
  }) });
  assert.equal(result.permerror, true);
  assert.equal(result.permerrorReason, 'syntax');
});
