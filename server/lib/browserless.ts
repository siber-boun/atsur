import { request } from 'undici';
import { PORT_TARGETS } from '../config';
import { detectWaf } from '../fingerprints/waf';
import { inspectCookies } from './cookies';
import { lightweightTechnologies, putEvidence, securityFromHeaders, type HttpEvidence, type RedirectEvidence } from './evidence';
import { resolvePublic } from './ssrf';
import { isValidDomain } from './validate';

const BODY_LIMIT = 128 * 1024;
const RESPONSE_LIMIT = BODY_LIMIT + 64 * 1024;

type BrowserlessPayload = { data?: { status?: number; finalUrl?: string; headers?: Record<string, string>; html?: string; truncated?: boolean; navigations?: Array<{ status?: number; url?: string; location?: string }> } };

function functionEndpoint(): URL | undefined {
  const value = process.env.BROWSERLESS_URL;
  if (!value || !process.env.BROWSERLESS_API_KEY) return undefined;
  try {
    const url = new URL(value);
    url.pathname = `${url.pathname.replace(/\/(?:content|function)\/?$/, '').replace(/\/$/, '')}/function`;
    url.searchParams.set('token', process.env.BROWSERLESS_API_KEY);
    return url;
  } catch { return undefined; }
}

const sanitizedUrl = (url: URL) => `${url.protocol}//${url.host}${url.pathname}`;

function allowedWebPort(url: URL) {
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  return PORT_TARGETS.some((target) => target.port === port && target.webProtocols?.includes(url.protocol as 'http:' | 'https:'));
}

async function validateTarget(url: URL): Promise<boolean> {
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !isValidDomain(url.hostname) || /proxy/i.test(url.hostname) || url.username || url.password || !allowedWebPort(url)) return false;
  const resolved = await resolvePublic(url.hostname);
  return !resolved.blocked && resolved.ips.length > 0;
}

async function readJson(body: AsyncIterable<Uint8Array> & { destroy?: () => void }): Promise<BrowserlessPayload | null> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of body) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > RESPONSE_LIMIT) { body.destroy?.(); return null; }
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as BrowserlessPayload; } catch { return null; }
}

// The raw target URL stays inside this adapter. Only sanitized URLs and derived
// header/cookie findings can leave it through HttpEvidence.
const browserlessFunction = `export default async ({ page, context }) => {
  const navigations = [];
  page.on('response', response => {
    const request = response.request();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      const headers = response.headers();
      navigations.push({ status: response.status(), url: response.url(), location: headers.location });
    }
  });
  const response = await page.goto(context.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const html = await page.content();
  return { data: {
    status: response ? response.status() : undefined, finalUrl: page.url(),
    headers: response ? response.headers() : {}, navigations,
    html: html.slice(0, context.bodyLimit), truncated: html.length > context.bodyLimit
  }, type: 'application/json' };
};`;

/** Browserless is a rendering fallback, never a user-controlled proxy. */
export async function collectBrowserlessEvidence(protocol: 'http:' | 'https:', hostname: string, port: number): Promise<HttpEvidence | null> {
  const endpoint = functionEndpoint();
  const origin = new URL(`${protocol}//${hostname}:${port}/`);
  if (!endpoint || !(await validateTarget(origin))) return null;
  try {
    const response = await request(endpoint, {
      method: 'POST', headersTimeout: 15_000, bodyTimeout: 20_000,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ code: browserlessFunction, context: { url: origin.toString(), bodyLimit: BODY_LIMIT } })
    });
    if (response.statusCode < 200 || response.statusCode >= 300) { response.body.destroy(); return null; }
    const data = (await readJson(response.body))?.data;
    if (!data?.finalUrl || !data.status) return null;
    const finalUrl = new URL(data.finalUrl);
    if (!(await validateTarget(finalUrl))) return null;
    const navigation = data.navigations || [];
    if (navigation.length > 4) return null;
    const redirects: RedirectEvidence[] = [];
    for (const item of navigation.slice(0, -1)) {
      if (!item.url || !item.location || !item.status) continue;
      const target = new URL(item.location, item.url);
      if (!(await validateTarget(target))) return null;
      redirects.push({ status: item.status, target: sanitizedUrl(target), external: target.hostname.toLowerCase() !== hostname.toLowerCase() });
    }
    if (redirects.length > 3) return null;
    const headers = Object.fromEntries(Object.entries(data.headers || {}).map(([key, value]) => [key.toLowerCase(), String(value).slice(0, 4096)])) as Record<string, string>;
    const html = String(data.html || '');
    const evidence: HttpEvidence = {
      ok: true, source: 'browserless-live', protocol: finalUrl.protocol as 'http:' | 'https:', hostname: hostname.toLowerCase(), port,
      status: data.status, tlsVerified: finalUrl.protocol === 'https:', redirects, finalTarget: sanitizedUrl(finalUrl),
      ...(headers.server ? { server: headers.server.slice(0, 256) } : {}),
      ...(headers['x-powered-by'] ? { poweredBy: headers['x-powered-by'].slice(0, 256) } : {}),
      security: securityFromHeaders(headers),
      waf: (() => { const name = detectWaf(headers); return name ? { detected: true, name } : { detected: false }; })(),
      cookies: inspectCookies(headers['set-cookie'] ? [headers['set-cookie']] : [], finalUrl.protocol === 'https:'),
      technologies: lightweightTechnologies(headers, html, 'browserless-live'),
      bodyBytesRead: Buffer.byteLength(html), truncated: Boolean(data.truncated), observedAt: new Date().toISOString()
    };
    if (finalUrl.hostname.toLowerCase() !== hostname.toLowerCase()) {
      evidence.externalRedirect = { target: sanitizedUrl(finalUrl), status: data.status, security: evidence.security, waf: evidence.waf, cookies: evidence.cookies, technologies: evidence.technologies };
      delete evidence.security; delete evidence.waf; delete evidence.cookies; delete evidence.technologies;
    }
    return putEvidence(evidence);
  } catch { return null; }
}
