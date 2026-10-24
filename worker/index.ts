interface WorkerEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const API_ORIGIN = 'https://osint-zgg4.onrender.com';

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/health') {
      return env.ASSETS.fetch(request);
    }

    // Keep browser requests on the frontend origin; the destination cannot be supplied by clients.
    const upstreamUrl = new URL(url.pathname + url.search, API_ORIGIN);
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('authorization');
    try {
      const upstreamRequest = new Request(upstreamUrl, request);
      const response = await fetch(new Request(upstreamRequest, { headers, redirect: 'manual' }));
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Cache-Control', 'no-store');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Tarama servisine şu anda ulaşılamıyor.' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }
  }
};
