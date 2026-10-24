import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../worker/index';

test('Worker forwards session and CSRF to fixed API and preserves Set-Cookie', async () => {
  const originalFetch = globalThis.fetch;
  let forwarded: Request | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    forwarded = input as Request;
    return new Response('{}', { headers: { 'Set-Cookie': '__Host-osint_session=test; Secure; HttpOnly; Path=/; SameSite=Strict' } });
  }) as typeof fetch;
  try {
    const response = await worker.fetch(new Request('https://osint.busiber.workers.dev/api/auth/logout', {
      method: 'POST', headers: { Cookie: '__Host-osint_session=test', Origin: 'https://osint.busiber.workers.dev', 'X-CSRF-Token': 'csrf', 'X-OSINT-Request': '1', Authorization: 'Bearer discarded' }
    }), { ASSETS: { fetch: async () => new Response('asset') } });
    assert.equal(forwarded!.url, 'https://osint-zgg4.onrender.com/api/auth/logout');
    assert.equal(forwarded!.headers.get('cookie'), '__Host-osint_session=test');
    assert.equal(forwarded!.headers.get('x-csrf-token'), 'csrf');
    assert.equal(forwarded!.headers.get('origin'), 'https://osint.busiber.workers.dev');
    assert.equal(forwarded!.headers.get('authorization'), null);
    assert.match(response.headers.get('set-cookie')!, /HttpOnly/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally { globalThis.fetch = originalFetch; }
});
