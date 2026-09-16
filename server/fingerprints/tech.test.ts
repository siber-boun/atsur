import assert from 'node:assert/strict';
import test from 'node:test';
import { TECH_SIGNATURES } from './tech';

test('CommuniGate Pro mail paneli Server başlığından tanınır', () => {
  const signature = TECH_SIGNATURES.find((item) => item.name === 'CommuniGate Pro');
  assert.ok(signature);
  assert.equal(signature.category, 'Mail Sunucusu');
  assert.equal(signature.headers.server.test('CommuniGatePro/7.1.10'), true);
});
