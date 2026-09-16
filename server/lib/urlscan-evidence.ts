import { request } from 'undici';
import { PORT_TARGETS } from '../config';
import { detectWaf } from '../fingerprints/waf';
import { inspectCookies } from './cookies';
import { lightweightTechnologies, putEvidence, securityFromHeaders, type HttpEvidence } from './evidence';
import { resolvePublic } from './ssrf';
import { isValidDomain } from './validate';

const BODY_LIMIT = 128 * 1024;
const JSON_LIMIT = 1024 * 1024;
const SUCCESS_TTL_MS = 15 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;
const cache = new Map<string, { expiresAt: number; result: UrlscanEvidenceResult }>();
const inFlight = new Map<string, Promise<UrlscanEvidenceResult>>();

export interface UrlscanEvidenceResult { evidence: HttpEvidence | null; code?: string; }

type UrlscanResult = {
  page?: { url?: string; status?: number; server?: string; redirected?: boolean };
  task?: { url?: string };
  lists?: { technologies?: string[] };
  data?: { requests?: Array<{ request?: { url?: string }; response?: { status?: number; headers?: Record<string, unknown> } }> };
};

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const sanitizedUrl = (url: URL) => `${url.protocol}//${url.host}${url.pathname}`;

function apiKey() { return process.env.URLSCAN_API_KEY; }

function allowedWebTarget(url: URL) {
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  return PORT_TARGETS.some((target) => target.port === port && target.webProtocols?.includes(url.protocol as 'http:' | 'https:'));
}

async function validateTarget(url: URL) {
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !isValidDomain(url.hostname) || /proxy/i.test(url.hostname) || url.username || url.password || !allowedWebTarget(url)) return false;
  const resolved = await resolvePublic(url.hostname);
  return !resolved.blocked && resolved.ips.length > 0;
}

async function readJson(body: AsyncIterable<Uint8Array> & { destroy?: () => void }): Promise<unknown | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > JSON_LIMIT) { body.destroy?.(); return null; }
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

async function readText(body: AsyncIterable<Uint8Array> & { destroy?: () => void }) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body) {
    const buffer = Buffer.from(chunk);
    const allowed = Math.max(0, BODY_LIMIT - size);
    if (allowed) chunks.push(buffer.subarray(0, allowed));
    size += buffer.length;
    if (size >= BODY_LIMIT) { body.destroy?.(); return { text: Buffer.concat(chunks).toString('utf8'), truncated: true }; }
  }
  return { text: Buffer.concat(chunks).toString('utf8'), truncated: false };
}

function normalizeHeaders(input: Record<string, unknown> | undefined): Record<string, string | string[]> {
  return Object.fromEntries(Object.entries(input || {}).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.map(String) : String(value ?? '')]));
}

async function getDom(uuid: string, key: string) {
  try {
    const response = await request(`https://urlscan.io/dom/${encodeURIComponent(uuid)}/`, { headers: { 'api-key': key }, headersTimeout: 10_000, bodyTimeout: 15_000 });
    if (response.statusCode !== 200) { response.body.destroy(); return { text: '', truncated: false }; }
    return readText(response.body);
  } catch { return { text: '', truncated: false }; }
}

async function submitAndCollect(protocol: 'http:' | 'https:', hostname: string, port: number): Promise<UrlscanEvidenceResult> {
  const key = apiKey();
  const origin = new URL(`${protocol}//${hostname}:${port}/`);
  if (!key) return { evidence: null, code: 'URLSCAN_UNCONFIGURED' };
  if (!(await validateTarget(origin))) return { evidence: null, code: 'URLSCAN_TARGET_BLOCKED' };
  let uuid: string | undefined;
  try {
    const submitted = await request('https://urlscan.io/api/v1/scan/', {
      method: 'POST', headersTimeout: 10_000, bodyTimeout: 15_000,
      headers: { 'content-type': 'application/json', 'api-key': key, 'user-agent': 'OSINT-Dashboard/1.0' },
      // Kullanıcının hedefi veya olası yol bilgisi urlscan genel aramasına düşmez.
      body: JSON.stringify({ url: origin.toString(), visibility: 'private', tags: ['osint-dashboard'] })
    });
    if (submitted.statusCode < 200 || submitted.statusCode >= 300) { submitted.body.destroy(); return { evidence: null, code: `URLSCAN_HTTP_${submitted.statusCode}` }; }
    const payload = await readJson(submitted.body) as { uuid?: string } | null;
    uuid = payload?.uuid;
    if (!uuid) return { evidence: null, code: 'URLSCAN_INVALID_SUBMISSION' };
  } catch { return { evidence: null, code: 'URLSCAN_REQUEST_FAILED' }; }

  // urlscan sonucu tipik olarak en erken 30 saniye sonra hazır olur; sınırlı
  // polling Render isteğini sonsuza kadar bekletmez.
  await delay(30_000);
  let result: UrlscanResult | undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await request(`https://urlscan.io/api/v1/result/${encodeURIComponent(uuid)}/`, { headers: { 'api-key': key }, headersTimeout: 10_000, bodyTimeout: 15_000 });
      if (response.statusCode === 404) { response.body.destroy(); await delay(5_000); continue; }
      if (response.statusCode !== 200) { response.body.destroy(); return { evidence: null, code: `URLSCAN_RESULT_${response.statusCode}` }; }
      result = await readJson(response.body) as UrlscanResult | undefined;
      break;
    } catch { return { evidence: null, code: 'URLSCAN_RESULT_FAILED' }; }
  }
  if (!result?.page?.url || typeof result.page.status !== 'number') return { evidence: null, code: 'URLSCAN_TIMEOUT' };

  let finalUrl: URL;
  try { finalUrl = new URL(result.page.url); } catch { return { evidence: null, code: 'URLSCAN_INVALID_RESULT' }; }
  if (!(await validateTarget(finalUrl))) return { evidence: null, code: 'URLSCAN_REDIRECT_BLOCKED' };
  const responseEntry = result.data?.requests?.find((item) => item.request?.url === result?.page?.url && item.response)
    || result.data?.requests?.find((item) => item.response?.status === result?.page?.status);
  const headers = normalizeHeaders(responseEntry?.response?.headers);
  if (result.page.server && !headers.server) headers.server = result.page.server;
  const dom = await getDom(uuid, key);
  const technologies = lightweightTechnologies(headers, dom.text, 'urlscan');
  for (const name of result.lists?.technologies || []) {
    if (!technologies.some((item) => item.name.toLowerCase() === name.toLowerCase())) technologies.push({ name: String(name).slice(0, 128), category: 'Diğer', confidence: 60, sources: ['urlscan'], passive: false });
  }
  const evidence: HttpEvidence = {
    ok: true, source: 'urlscan', protocol: finalUrl.protocol as 'http:' | 'https:', hostname: hostname.toLowerCase(), port,
    status: result.page.status, tlsVerified: finalUrl.protocol === 'https:', redirects: [], finalTarget: sanitizedUrl(finalUrl),
    ...(headers.server ? { server: String(headers.server).slice(0, 256) } : {}),
    ...(headers['x-powered-by'] ? { poweredBy: String(headers['x-powered-by']).slice(0, 256) } : {}),
    security: securityFromHeaders(headers),
    waf: (() => { const name = detectWaf(headers); return name ? { detected: true, name } : { detected: false }; })(),
    cookies: inspectCookies(Array.isArray(headers['set-cookie']) ? headers['set-cookie'] : headers['set-cookie'] ? [String(headers['set-cookie'])] : [], finalUrl.protocol === 'https:'),
    technologies, bodyBytesRead: Buffer.byteLength(dom.text), truncated: dom.truncated, observedAt: new Date().toISOString()
  };
  if (finalUrl.hostname.toLowerCase() !== hostname.toLowerCase()) {
    evidence.externalRedirect = { target: sanitizedUrl(finalUrl), status: evidence.status, security: evidence.security, waf: evidence.waf, cookies: evidence.cookies, technologies: evidence.technologies };
    delete evidence.security; delete evidence.waf; delete evidence.cookies; delete evidence.technologies;
  }
  return { evidence: putEvidence(evidence) };
}

export async function collectUrlscanEvidence(protocol: 'http:' | 'https:', hostname: string, port: number): Promise<UrlscanEvidenceResult> {
  const cacheKey = `${protocol}//${hostname.toLowerCase()}:${port}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const running = inFlight.get(cacheKey);
  if (running) return running;
  const task = submitAndCollect(protocol, hostname, port).then((result) => {
    cache.set(cacheKey, { result, expiresAt: Date.now() + (result.evidence ? SUCCESS_TTL_MS : FAILURE_TTL_MS) });
    return result;
  }).finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, task);
  return task;
}
