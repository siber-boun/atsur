import type { IncomingHttpHeaders } from 'node:http';
import { Agent, request } from 'undici';
import { detectWaf } from '../fingerprints/waf';
import { TECH_SIGNATURES } from '../fingerprints/tech';
import { inspectCookies, type CookieFinding } from './cookies';
import { httpPool } from './pool';
import { resolvePublic } from './ssrf';
import { isValidDomain } from './validate';
import { PORT_TARGETS } from '../config';

export type EvidenceSource = 'render-live' | 'browserless-live';

export interface RedirectEvidence {
  status: number;
  target: string;
  external: boolean;
}

export interface SecurityFinding {
  score: number;
  grade: string;
  missing: string[];
}

export interface TechnologyFinding {
  name: string;
  category: string;
  version?: string;
  confidence: number;
  sources: Array<'builtin' | 'browserless-live'>;
  passive: false;
}

export interface ExternalRedirectEvidence {
  target: string;
  status?: number;
  security?: SecurityFinding;
  waf?: { detected: boolean; name?: string };
  cookies?: CookieFinding[];
  technologies?: TechnologyFinding[];
}

export interface HttpEvidence {
  ok: boolean;
  source: EvidenceSource;
  protocol: 'http:' | 'https:';
  hostname: string;
  port: number;
  status?: number;
  tlsVerified: boolean;
  server?: string;
  poweredBy?: string;
  redirects: RedirectEvidence[];
  finalTarget?: string;
  externalRedirect?: ExternalRedirectEvidence;
  security?: SecurityFinding;
  waf?: { detected: boolean; name?: string };
  cookies?: CookieFinding[];
  technologies?: TechnologyFinding[];
  bodyBytesRead?: number;
  truncated?: boolean;
  observedAt: string;
  error?: string;
}

const BODY_LIMIT = 128 * 1024;
const CACHE_TTL_MS = 15 * 60 * 1000;
const evidenceCache = new Map<string, { expiresAt: number; value: HttpEvidence }>();

const cacheKey = (protocol: string, hostname: string, port: number) => `${protocol}//${hostname.toLowerCase()}:${port}`;

export function getCachedEvidence(hostname: string, preferredPort?: number): HttpEvidence | undefined {
  const now = Date.now();
  for (const entry of evidenceCache.values()) {
    if (entry.expiresAt < now) evidenceCache.delete(cacheKey(entry.value.protocol, entry.value.hostname, entry.value.port));
  }
  const entries = [...evidenceCache.values()].filter((entry) => entry.expiresAt >= now && entry.value.hostname === hostname.toLowerCase() && entry.value.ok);
  const ordered = entries.map((entry) => entry.value).sort((a, b) => {
    const rank = (item: HttpEvidence) => item.protocol === 'https:' && item.port === 443 ? 0 : item.protocol === 'https:' ? 1 : 2;
    return (preferredPort && a.port === preferredPort ? -1 : preferredPort && b.port === preferredPort ? 1 : rank(a) - rank(b)) || a.port - b.port;
  });
  return ordered[0];
}

export function putEvidence(evidence: HttpEvidence) {
  if (evidence.ok) evidenceCache.set(cacheKey(evidence.protocol, evidence.hostname, evidence.port), { expiresAt: Date.now() + CACHE_TTL_MS, value: evidence });
  return evidence;
}

export function securityFromHeaders(headers: Record<string, string | string[] | undefined>): SecurityFinding {
  let score = 0;
  const missing: string[] = [];
  const has = (name: string, points: number, label: string) => {
    if (headers[name]) score += points; else missing.push(label);
  };
  has('strict-transport-security', 20, 'HSTS');
  has('content-security-policy', 20, 'CSP');
  has('x-frame-options', 20, 'X-Frame-Options');
  has('x-content-type-options', 15, 'X-Content-Type-Options');
  has('referrer-policy', 15, 'Referrer-Policy');
  has('permissions-policy', 5, 'Permissions-Policy');
  has('x-xss-protection', 5, 'X-XSS-Protection');
  // Bunlar mevcut 100 puanlık modelin ağırlıklarını değiştirmez; ek savunma
  // bağlamı olarak eksik-listesinde görünürler.
  if (!headers['cross-origin-opener-policy']) missing.push('Cross-Origin-Opener-Policy');
  if (!headers['cross-origin-resource-policy']) missing.push('Cross-Origin-Resource-Policy');
  if (!headers['cross-origin-embedder-policy']) missing.push('Cross-Origin-Embedder-Policy');
  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F';
  return { score, grade, missing };
}

export function lightweightTechnologies(headers: Record<string, string | string[] | undefined>, html: string, source: 'builtin' | 'browserless-live' = 'builtin'): TechnologyFinding[] {
  const normalized: Record<string, string> = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join('; ') : value || '']));
  const findings: TechnologyFinding[] = TECH_SIGNATURES.filter((tech) => Object.entries(tech.headers).some(([key, pattern]) => pattern.test(normalized[key] || '')) || Boolean(tech.html?.test(html)))
    .map((tech) => {
      const server = normalized.server || '';
      const version = tech.category === 'Sunucu' ? /\/([0-9][\w.-]*)/.exec(server)?.[1] : undefined;
      return { name: tech.name, category: tech.category, ...(version ? { version } : {}), confidence: source === 'browserless-live' ? 65 : 70, sources: [source], passive: false as const };
    });
  return [...new Map(findings.map((item) => [`${item.name}|${item.version || ''}`, item])).values()];
}

const sanitizedUrl = (url: URL) => `${url.protocol}//${url.host}${url.pathname}`;

const isAllowedWebTarget = (url: URL) => {
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  return PORT_TARGETS.some((target) => target.port === port && target.webProtocols?.includes(url.protocol as 'http:' | 'https:'));
};

async function readBounded(body: AsyncIterable<Uint8Array> & { destroy?: (error?: Error) => void }): Promise<{ html: string; bytes: number; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of body) {
    const buffer = Buffer.from(chunk);
    const allowed = Math.max(0, BODY_LIMIT - bytes);
    if (allowed > 0) chunks.push(buffer.subarray(0, allowed));
    bytes += buffer.length;
    if (bytes >= BODY_LIMIT) {
      body.destroy?.();
      return { html: Buffer.concat(chunks).toString('utf8'), bytes: BODY_LIMIT, truncated: true };
    }
  }
  return { html: Buffer.concat(chunks).toString('utf8'), bytes, truncated: false };
}

async function requestPinned(url: URL, hostname: string, ip: string) {
  const lookup = (_hostname: string, options: { all?: boolean }, callback: (...args: any[]) => void) => {
    const family = ip.includes(':') ? 6 : 4;
    if (options.all) callback(null, [{ address: ip, family }]);
    else callback(null, ip, family);
  };
  const dispatcher = new Agent({ connect: { lookup } });
  try {
    const response = await request(url, {
      dispatcher,
      headersTimeout: 8_000,
      bodyTimeout: 8_000,
      headers: {
        'user-agent': 'OSINT-Dashboard/1.0 (+live-evidence)',
        accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        range: `bytes=0-${BODY_LIMIT - 1}`
      }
    });
    return { response, body: await readBounded(response.body) };
  } finally {
    await dispatcher.close();
  }
}

export async function collectRenderEvidence(protocol: 'http:' | 'https:', hostname: string, port: number, initialIp?: string): Promise<HttpEvidence> {
  return httpPool.run(async () => {
    const originalHost = hostname.toLowerCase();
    const redirects: RedirectEvidence[] = [];
    let current = new URL(`${protocol}//${originalHost}:${port}/`);
    let ip = initialIp;
    try {
      for (let hop = 0; hop <= 3; hop += 1) {
        if (!isValidDomain(current.hostname) || /proxy/i.test(current.hostname) || current.username || current.password) throw Object.assign(new Error('invalid-target'), { code: /proxy/i.test(current.hostname) ? 'PROXY_HOST_BLOCKED' : 'INVALID_TARGET' });
        const resolved = current.hostname === originalHost && ip ? { ips: [ip], blocked: false } : await resolvePublic(current.hostname);
        if (resolved.blocked || !resolved.ips[0]) throw Object.assign(new Error(resolved.reason || 'dns-failed'), { code: resolved.reason || 'DNS_FAILED' });
        ip = resolved.ips[0];
        const { response, body } = await requestPinned(current, current.hostname, ip);
        const location = Array.isArray(response.headers.location) ? response.headers.location[0] : response.headers.location;
        const status = response.statusCode || 0;
        if (status >= 300 && status < 400 && location) {
          if (hop === 3) throw Object.assign(new Error('too-many-redirects'), { code: 'TOO_MANY_REDIRECTS' });
          const next = new URL(location, current);
          if (next.protocol !== 'https:' && next.protocol !== 'http:') throw Object.assign(new Error('redirect-protocol'), { code: 'REDIRECT_PROTOCOL' });
          if (!isAllowedWebTarget(next)) throw Object.assign(new Error('redirect-port'), { code: 'REDIRECT_PORT' });
          redirects.push({ status, target: sanitizedUrl(next), external: next.hostname.toLowerCase() !== originalHost });
          current = next;
          continue;
        }
        const headers = response.headers as Record<string, string | string[] | undefined>;
        const evidence: HttpEvidence = {
          ok: true, source: 'render-live', protocol: current.protocol as 'http:' | 'https:', hostname: originalHost, port, status,
          tlsVerified: current.protocol === 'https:', redirects, finalTarget: sanitizedUrl(current),
          ...(headers.server ? { server: String(headers.server).slice(0, 256) } : {}),
          ...(headers['x-powered-by'] ? { poweredBy: String(headers['x-powered-by']).slice(0, 256) } : {}),
          security: securityFromHeaders(headers),
          waf: (() => { const name = detectWaf(headers as IncomingHttpHeaders); return name ? { detected: true, name } : { detected: false }; })(),
          cookies: inspectCookies(Array.isArray(headers['set-cookie']) ? headers['set-cookie'] : headers['set-cookie'] ? [headers['set-cookie']] : [], current.protocol === 'https:'),
          technologies: lightweightTechnologies(headers, body.html),
          bodyBytesRead: body.bytes, truncated: body.truncated, observedAt: new Date().toISOString()
        };
        if (current.hostname.toLowerCase() !== originalHost) {
          evidence.externalRedirect = { target: sanitizedUrl(current), status, security: evidence.security, waf: evidence.waf, cookies: evidence.cookies, technologies: evidence.technologies };
          delete evidence.security; delete evidence.waf; delete evidence.cookies; delete evidence.technologies;
        }
        return putEvidence(evidence);
      }
      throw Object.assign(new Error('too-many-redirects'), { code: 'TOO_MANY_REDIRECTS' });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : error instanceof Error ? error.message : 'UNKNOWN';
      return { ok: false, source: 'render-live', protocol, hostname: originalHost, port, tlsVerified: false, redirects, observedAt: new Date().toISOString(), error: code };
    }
  });
}
