import http from 'node:http';
import https from 'node:https';
import type { Response } from 'node-fetch';
import { SOURCE_KEYS } from '../config';
import { TECH_SIGNATURES } from '../fingerprints/tech';
import { getFetch } from './http';
import { techPool } from './pool';
import { resolvePublic } from './ssrf';

export interface TechnologyFinding {
  name: string;
  category: string;
  version?: string;
  confidence: number;
  sources: Array<'opentechalyzer' | 'builtin' | 'shodan'>;
  evidence?: string[];
  observedAt?: string;
  passive: boolean;
}

type DetectorModule = typeof import('opentechalyzer');

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const BODY_LIMIT_BYTES = 1024 * 1024;
const technologyCache = new Map<string, { expiresAt: number; value: TechnologyFinding[] }>();
const shodanCache = new Map<string, { expiresAt: number; value: TechnologyFinding[] }>();
const shodanInFlight = new Map<string, Promise<TechnologyFinding[]>>();
let detectorModule: Promise<DetectorModule> | undefined;

const categoryLabels: Record<string, string> = {
  cms: 'CMS', ecommerce: 'E-Ticaret', 'ecommerce-app': 'E-Ticaret',
  platform: 'CMS', 'static-site-generator': 'Frontend', 'js-framework': 'Frontend',
  'ui-framework': 'Frontend', 'css-framework': 'Frontend', 'js-library': 'Frontend',
  'web-server': 'Sunucu', 'backend-framework': 'Backend', language: 'Backend', runtime: 'Backend',
  analytics: 'Analitik', 'product-analytics': 'Analitik', 'tag-manager': 'Analitik',
  advertising: 'Analitik', 'marketing-automation': 'Analitik', security: 'Güvenlik',
  captcha: 'Güvenlik', 'bot-protection': 'Güvenlik', cdn: 'CDN', hosting: 'Altyapı', paas: 'Altyapı'
};

function cacheRead(cache: Map<string, { expiresAt: number; value: TechnologyFinding[] }>, key: string) {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheWrite(cache: Map<string, { expiresAt: number; value: TechnologyFinding[] }>, key: string, value: TechnologyFinding[]) {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

function parseHtml(html: string, baseUrl: string) {
  const metas: Record<string, string> = {};
  const scriptSrcs: string[] = [];
  const stylesheetSrcs: string[] = [];
  for (const tag of html.match(/<meta\\b[^>]*>/gi) || []) {
    const name = /(?:name|property)=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (name && content !== undefined) metas[name] = content;
  }
  for (const tag of html.match(/<script\\b[^>]*>/gi) || []) {
    const src = /src=["']([^"']+)["']/i.exec(tag)?.[1];
    if (src) { try { scriptSrcs.push(new URL(src, baseUrl).toString()); } catch { /* ignore malformed asset */ } }
  }
  for (const tag of html.match(/<link\\b[^>]*>/gi) || []) {
    if (!/rel=["'][^"']*stylesheet/i.test(tag)) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (href) { try { stylesheetSrcs.push(new URL(href, baseUrl).toString()); } catch { /* ignore malformed asset */ } }
  }
  return { metas, scriptSrcs, stylesheetSrcs };
}

async function readBounded(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > BODY_LIMIT_BYTES) throw new Error('response-too-large');
  const chunks: Buffer[] = [];
  let total = 0;
  return new Promise((resolve, reject) => {
    response.body?.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > BODY_LIMIT_BYTES) {
        (response.body as any)?.destroy();
        reject(new Error('response-too-large'));
      } else chunks.push(chunk);
    });
    response.body?.on('error', reject);
    response.body?.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

async function fetchPinned(hostname: string, ip: string): Promise<{ response: Response; html: string; finalUrl: string }> {
  const fetch = await getFetch();
  const pinnedLookup = (_host: string, options: { all?: boolean }, callback: (...args: any[]) => void) => {
    const family = ip.includes(':') ? 6 : 4;
    if (options.all) callback(null, [{ address: ip, family }]);
    else callback(null, ip, family);
  };
  let url = `https://${hostname}`;
  let lastError: unknown;
  for (const firstProtocol of ['https:', 'http:']) {
    url = `${firstProtocol}//${hostname}`;
    try {
      for (let redirects = 0; redirects <= 3; redirects += 1) {
        const parsed = new URL(url);
        const agent = parsed.protocol === 'https:'
          ? new https.Agent({ lookup: pinnedLookup })
          : new http.Agent({ lookup: pinnedLookup });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(url, {
            redirect: 'manual', agent: agent as any, signal: controller.signal as any,
            headers: { 'User-Agent': 'OSINT-Dashboard/1.0 (+technology-discovery)' }
          } as any);
          const location = response.headers.get('location');
          if (response.status >= 300 && response.status < 400 && location) {
            const next = new URL(location, url);
            if (next.hostname.toLowerCase() !== hostname.toLowerCase()) throw new Error('cross-host-redirect-blocked');
            url = next.toString();
            (response.body as any)?.destroy();
            continue;
          }
          return { response, html: await readBounded(response), finalUrl: url };
        } finally { clearTimeout(timeout); }
      }
      throw new Error('too-many-redirects');
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error('technology-fetch-failed');
}

function localFallback(headers: Record<string, string>, html: string): TechnologyFinding[] {
  return TECH_SIGNATURES.filter((tech) => Object.entries(tech.headers).some(([key, pattern]) => pattern.test(headers[key] || '')) || Boolean(tech.html?.test(html)))
    .map((tech) => ({ name: tech.name, category: tech.category, confidence: 65, sources: ['builtin'], passive: false }));
}

async function staticDetections(hostname: string): Promise<TechnologyFinding[]> {
  const cached = cacheRead(technologyCache, hostname);
  if (cached) return cached;
  const resolved = await resolvePublic(hostname);
  if (resolved.blocked || !resolved.ips[0]) return [];
  return techPool.run(async () => {
    try {
      const { response, html, finalUrl } = await fetchPinned(hostname, resolved.ips[0]);
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
      const parsed = parseHtml(html, finalUrl);
      const setCookies = typeof (response.headers as any).raw === 'function'
        ? ((response.headers as any).raw()['set-cookie'] || []) : [];
      try {
        detectorModule ??= import('opentechalyzer');
        const detector = await detectorModule;
        const bundle = {
          url: `https://${hostname}`, finalUrl, status: response.status, headers, setCookies, html,
          scriptSrcs: parsed.scriptSrcs, scriptContents: [], stylesheetSrcs: parsed.stylesheetSrcs,
          cssContents: [], metas: parsed.metas, requestHosts: [], jsGlobals: {}, domSelectors: new Set<string>(),
          dns: { txt: [], mx: [], cname: [], ns: [], a: [] }, certSubdomains: [], npmDeps: [], probes: {},
          warnings: [], timings: {}
        };
        const detections = detector.detect(detector.BUILTIN_FINGERPRINTS, bundle as any, 35)
          .filter((item) => item.categories[0] !== 'cdn')
          .map((item) => ({
            name: item.name,
            category: categoryLabels[item.categories[0]] || 'Diğer',
            ...(item.version ? { version: item.version } : {}),
            confidence: Math.round(item.confidence),
            sources: ['opentechalyzer'] as Array<'opentechalyzer'>,
            evidence: item.evidence.slice(0, 2).map((e) => `${e.subject}: ${e.match}`),
            passive: false
          }));
        const merged = new Map<string, TechnologyFinding>();
        for (const finding of [...detections, ...localFallback(headers, html)]) {
          const key = `${finding.name.toLowerCase()}|${finding.version || ''}`;
          if (!merged.has(key)) merged.set(key, finding);
        }
        return cacheWrite(technologyCache, hostname, [...merged.values()]);
      } catch {
        return cacheWrite(technologyCache, hostname, localFallback(headers, html));
      }
    } catch { return []; }
  });
}

async function fetchShodanDetections(ip: string): Promise<TechnologyFinding[]> {
  if (!SOURCE_KEYS.SHODAN_API_KEY) return [];
  const cached = cacheRead(shodanCache, ip);
  if (cached) return cached;
  try {
    const fetch = await getFetch();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`https://api.shodan.io/shodan/host/${encodeURIComponent(ip)}?key=${encodeURIComponent(SOURCE_KEYS.SHODAN_API_KEY)}&minify=false`, { signal: controller.signal as any });
      if (!response.ok) return [];
      const data = await response.json() as { last_update?: string; data?: Array<{ product?: string; version?: string; port?: number; timestamp?: string; cpe23?: string[] }> };
      const findings = (data.data || []).flatMap((service) => service.product ? [{
        name: service.product, category: 'Sunucu', ...(service.version ? { version: service.version } : {}),
        confidence: 70, sources: ['shodan'] as Array<'shodan'>,
        evidence: [`${service.port || '—'}/tcp · IP pasif gözlemi`],
        observedAt: service.timestamp || data.last_update, passive: true
      }] : []);
      return cacheWrite(shodanCache, ip, findings);
    } finally { clearTimeout(timeout); }
  } catch { return []; }
}

async function shodanDetections(ip: string, sharedEdge: boolean): Promise<TechnologyFinding[]> {
  const cached = cacheRead(shodanCache, ip);
  let findings: TechnologyFinding[];
  if (cached) findings = cached;
  else {
    const existing = shodanInFlight.get(ip);
    const task = existing || fetchShodanDetections(ip).finally(() => shodanInFlight.delete(ip));
    if (!existing) shodanInFlight.set(ip, task);
    findings = await task;
  }
  return sharedEdge ? findings.map((item) => ({
    ...item, confidence: 35,
    evidence: item.evidence?.map((evidence) => evidence.replace('IP pasif gözlemi', 'Ortak/CDN altyapısı'))
  })) : findings;
}

export async function detectTechnologies(hostname: string, options: { sharedEdge?: boolean } = {}): Promise<TechnologyFinding[]> {
  const live = await staticDetections(hostname);
  const resolved = await resolvePublic(hostname);
  const passive = !resolved.blocked && resolved.ips[0] ? await shodanDetections(resolved.ips[0], Boolean(options.sharedEdge)) : [];
  const byKey = new Map<string, TechnologyFinding>();
  for (const item of [...live, ...passive]) {
    const key = `${item.name.toLowerCase()}|${item.version || ''}|${item.passive}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return [...byKey.values()];
}
