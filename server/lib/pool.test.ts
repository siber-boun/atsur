import test from 'node:test';
import assert from 'node:assert/strict';
import { createPool, mapPool } from './pool';

test('createPool respects its concurrency limit and serves queued work FIFO', async () => {
  const pool = createPool(2);
  let active = 0;
  let maxActive = 0;
  const started: number[] = [];
  const jobs = [0, 1, 2, 3].map((id) => pool.run(async () => {
    started.push(id);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    return id;
  }));
  await new Promise((resolve) => setTimeout(resolve, 1));
  assert.deepEqual(started, [0, 1]);
  assert.equal(pool.inFlight(), 2);
  assert.equal(pool.queued(), 2);
  await Promise.all(jobs);
  assert.deepEqual(started, [0, 1, 2, 3]);
  assert.equal(maxActive, 2);
  assert.equal(pool.inFlight(), 0);
});

test('mapPool returns settled results without failing the batch', async () => {
  const results = await mapPool([1, 2, 3], 2, async (value) => {
    if (value === 2) throw new Error('expected');
    return value * 2;
  });
  assert.deepEqual(results.map((result) => result.status), ['fulfilled', 'rejected', 'fulfilled']);
});
