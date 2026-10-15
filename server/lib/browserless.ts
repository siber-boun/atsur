import { request } from 'undici';
import { PORT_TARGETS } from '../config';
import { detectWaf } from '../fingerprints/waf';
import { inspectCookies } from './cookies';
import { lightweightTechnologies, publicResponseHeaders, putEvidence, securityFromHeaders, type HttpEvidence, type RedirectEvidence } from './evidence';
import { resolvePublic } from './ssrf';
import { isValidDomain } from './validate';

const BODY_LIMIT = 128 * 1024;
const RESPONSE_LIMIT = BODY_LIMIT + 64 * 1024;
type BrowserlessPayload = { data?: { status?: number; finalUrl?: string; headers?: Record<string, string>; html?: string; truncated?: boolean; navigations?: Array<{ status?: number; url?: string; location?: string }> } };
export interface BrowserlessEvidenceResult { evidence: HttpEvidence | null; code?: string; }

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
type AllowedBrowserlessTarget = { protocol: string; port: number };
export function allowBrowserlessNavigation(urlString: string, hostname: string, targets: AllowedBrowserlessTarget[], isTopNavigation: boolean): boolean {
  if (!isTopNavigation) return false;
  try {
    const target = new URL(urlString);
    const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
    return target.hostname.toLowerCase() === hostname.toLowerCase() &&
      !target.username && !target.password &&
      targets.some((allowed) => allowed.protocol === target.protocol && allowed.port === port);
  } catch { return false; }
}
async function readJson(body: AsyncIterable<Uint8Array> & { destroy?: () => void }): Promise<BrowserlessPayload | null> {
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const chunk of body) { const buffer = Buffer.from(chunk); bytes += buffer.length; if (bytes > RESPONSE_LIMIT) { body.destroy?.(); return null; } chunks.push(buffer); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as BrowserlessPayload; } catch { return null; }
}

const browserlessFunction = `export default async ({ page, context }) => {
  const navigations = [];
  const allowNavigation = ${allowBrowserlessNavigation.toString()};
  await page.route('**/*', async route => {
    const request = route.request();
    const isTopNavigation = request.isNavigationRequest() && request.frame() === page.mainFrame();
    if (!allowNavigation(request.url(), context.hostname, context.allowedTargets, isTopNavigation)) return route.abort('blockedbyclient');
    return route.continue();
  });
  page.on('response', response => {
    const request = response.request();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      const headers = response.headers();
      navigations.push({ status: response.status(), url: response.url(), location: headers.location });
    }
  });
  const response = await page.goto(context.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const html = await page.content();
  return { data: { status: response ? response.status() : undefined, finalUrl: page.url(), headers: response ? response.headers() : {}, navigations, html: html.slice(0, context.bodyLimit), truncated: html.length > context.bodyLimit }, type: 'application/json' };
};`;

/** Browserless, yalnız tarayıcının erişilebilirlik kanıtından sonra çağrılır. */
export async function collectBrowserlessEvidenceResult(protocol: 'http:' | 'https:', hostname: string, port: number): Promise<BrowserlessEvidenceResult> {
  const endpoint = functionEndpoint();
  const origin = new URL(`${protocol}//${hostname}:${port}/`);
  if (!endpoint) return { evidence: null, code: 'BROWSERLESS_UNCONFIGURED' };
  if (!(await validateTarget(origin))) return { evidence: null, code: 'BROWSERLESS_TARGET_BLOCKED' };
  try {
    const allowedTargets = PORT_TARGETS.flatMap((target) => (target.webProtocols || []).map((allowedProtocol) => ({ protocol: allowedProtocol, port: target.port })));
    const response = await request(endpoint, { method: 'POST', headersTimeout: 15_000, bodyTimeout: 20_000, headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ code: browserlessFunction, context: { url: origin.toString(), hostname: hostname.toLowerCase(), bodyLimit: BODY_LIMIT, allowedTargets } }) });
    if (response.statusCode < 200 || response.statusCode >= 300) { response.body.destroy(); return { evidence: null, code: `BROWSERLESS_HTTP_${response.statusCode}` }; }
    const data = (await readJson(response.body))?.data;
    if (!data?.finalUrl || !data.status) return { evidence: null, code: 'BROWSERLESS_INVALID_RESPONSE' };
    const finalUrl = new URL(data.finalUrl);
    if (!(await validateTarget(finalUrl))) return { evidence: null, code: 'BROWSERLESS_REDIRECT_BLOCKED' };
    const navigation = data.navigations || [];
    if (navigation.length > 4) return { evidence: null, code: 'BROWSERLESS_TOO_MANY_REDIRECTS' };
    const redirects: RedirectEvidence[] = [];
    for (const item of navigation.slice(0, -1)) {
      if (!item.url || !item.location || !item.status) continue;
      const target = new URL(item.location, item.url);
      if (!(await validateTarget(target))) return { evidence: null, code: 'BROWSERLESS_REDIRECT_BLOCKED' };
      redirects.push({ status: item.status, target: sanitizedUrl(target), external: target.hostname.toLowerCase() !== hostname.toLowerCase() });
    }
    if (redirects.length > 3) return { evidence: null, code: 'BROWSERLESS_TOO_MANY_REDIRECTS' };
    const headers = Object.fromEntries(Object.entries(data.headers || {}).map(([key, value]) => [key.toLowerCase(), String(value).slice(0, 4096)])) as Record<string, string>;
    const html = String(data.html || '');
    const evidence: HttpEvidence = {
      ok: true, source: 'browserless-live', protocol: finalUrl.protocol as 'http:' | 'https:', hostname: hostname.toLowerCase(), port, status: data.status,
      tlsVerified: finalUrl.protocol === 'https:', redirects, finalTarget: sanitizedUrl(finalUrl),
      ...(headers.server ? { server: headers.server.slice(0, 256) } : {}), ...(headers['x-powered-by'] ? { poweredBy: headers['x-powered-by'].slice(0, 256) } : {}),
      responseHeaders: publicResponseHeaders(headers),
      security: securityFromHeaders(headers), waf: (() => { const name = detectWaf(headers); return name ? { detected: true, name } : { detected: false }; })(),
      cookies: inspectCookies(headers['set-cookie'] ? [headers['set-cookie']] : [], finalUrl.protocol === 'https:'), technologies: lightweightTechnologies(headers, html, 'browserless-live'),
      bodyBytesRead: Buffer.byteLength(html), truncated: Boolean(data.truncated), observedAt: new Date().toISOString()
    };
    if (finalUrl.hostname.toLowerCase() !== hostname.toLowerCase()) {
      evidence.externalRedirect = { target: sanitizedUrl(finalUrl), status: data.status, security: evidence.security, waf: evidence.waf, cookies: evidence.cookies, technologies: evidence.technologies };
      delete evidence.security; delete evidence.waf; delete evidence.cookies; delete evidence.technologies; delete evidence.responseHeaders;
    }
    return { evidence: putEvidence(evidence) };
  } catch { return { evidence: null, code: 'BROWSERLESS_REQUEST_FAILED' }; }
}
