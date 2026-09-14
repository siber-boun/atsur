import assert from 'node:assert/strict';
import test from 'node:test';
import { makePermutations } from './permutations';
import { WORDLIST } from './wordlist';
import { projectedCandidateCount } from '../routes/brute';

test('wordlist is inline and has the planned curated size', () => {
  assert.ok(WORDLIST.length >= 400);
  assert.ok(WORDLIST.length <= 600);
  assert.ok(WORDLIST.includes('admin'));
  assert.ok(WORDLIST.includes('grafana'));
});

test('permutations only use the first 30 valid in-domain seeds', () => {
  const seeds = Array.from({ length: 40 }, (_, index) => `host${index}.example.com`);
  const candidates = makePermutations('example.com', [...seeds, 'outside.invalid', 'example.com']);
  assert.equal(candidates.length, 30 * 7);
  assert.ok(candidates.includes('dev-host0.example.com'));
  assert.ok(candidates.includes('host29-new.example.com'));
  assert.ok(!candidates.some((candidate) => candidate.includes('host30')));
});

test('large supplied seed lists exceed the explicit 2000-candidate ceiling', () => {
  assert.ok(projectedCandidateCount('permutation', 3000) > 2000);
  assert.ok(projectedCandidateCount('both', 3000) > 2000);
});
