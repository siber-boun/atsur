import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeSourceHits } from './types';
import { HttpError } from '../lib/http';
import { classifySourceError } from './index';

test('source normalization excludes lookalike domains while preserving valid names', () => {
  const hits = dedupeSourceHits([
    { subdomain: '*.www.example.com' },
    { subdomain: 'notexample.com' },
    { subdomain: 'api.example.com', ip: '203.0.113.1' },
    { subdomain: 'API.EXAMPLE.COM' }
  ], 'example.com');
  assert.deepEqual(hits, [
    { subdomain: 'www.example.com' },
    { subdomain: 'api.example.com', ip: '203.0.113.1' }
  ]);
});

test('source error classification treats HTTP 429 as rate-limited', () => {
  assert.equal(classifySourceError(new HttpError(429)), 'rate-limited');
  assert.equal(classifySourceError(new HttpError(500)), 'error');
  const timeout = new Error('timeout');
  timeout.name = 'TimeoutError';
  assert.equal(classifySourceError(timeout), 'timeout');
});
