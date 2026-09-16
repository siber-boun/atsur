import type { IncomingHttpHeaders } from 'node:http';
import { SOURCE_KEYS } from '../config';
import { detectWaf } from '../fingerprints/waf';
import { getFetch } from './http';
import { httpPool } from './pool';

export interface ShodanBanner {
  port?: number;
  transport?: string;
  product?: string;
  version?: string;
  timestamp?: string;
  cpe23?: string[];
  http?: {
    status?: number;
    server?: string;
    headers?: Record<string, string | string[]>;
    components?: Record<string, { versions?: string[]; categories?: string[] }>;
  };
  ssl?: {
    versions?: string[];
    cipher?: { name?: string; version?: string; bits?: number };
    cert?: {
      expired?: boolean;
      expires?: string;
      issued?: string;
      issuer?: Record<string, string>;
      subject?: Record<string, string>;
      subjectAltName?: string[];
    };
  };
}

export interface ShodanHostData {
  ip_str?: string;
  last_update?: string;
  org?: string;
  isp?: string;
  asn?: string;
  os?: string | null;
  ports?: number[];
  data?: ShodanBanner[];
}

export interface ShodanPassiveAnalysis {
  source: 'shodan';
  observedAt?: string;
  ssl: Record<string, unknown> | null;
  advanced: { security: Record<string, unknown>; waf: { detected: boolean; name?: string }; passive: true; source: 'shodan'; observedAt?: string } | null;
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: ShodanHostData | null }>();
const inFlight = new Map<string, Promise<ShodanHostData | null>>();

export async function getShodanHost(ip: string): Promise<ShodanHostData | null> {
  if (!SOURCE_KEYS.SHODAN_API_KEY) return null;
  const cached = cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) cache.delete(ip);
  const existing = inFlight.get(ip);
  if (existing) return existing;
  const task = httpPool.run(async () => {
    try {
      const fetch = await getFetch();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`https://api.shodan.io/shodan/host/${encodeURIComponent(ip)}?key=${encodeURIComponent(SOURCE_KEYS.SHODAN_API_KEY || '')}&minify=false`, { signal: controller.signal as any });
        if (!response.ok) return null;
        return await response.json() as ShodanHostData;
      } finally { clearTimeout(timeout); }
    } catch { return null; }
  }).then((value) => {
    // Geçici Shodan/API hataları 12 saat boyunca kalıcı "veri yok" sonucuna dönüşmesin.
    cache.set(ip, { expiresAt: Date.now() + (value ? CACHE_TTL_MS : 15 * 60 * 1000), value });
    return value;
  }).finally(() => inFlight.delete(ip));
  inFlight.set(ip, task);
  return task;
}

const certificateName = (value: Record<string, string> | undefined) => value?.CN || value?.O || 'Bilinmiyor';
const weakCipher = (name: string) => /(?:RC4|3DES|DES-CBC3|CBC.*SHA(?:$|1)|NULL|EXPORT)/i.test(name);

function securityFromHeaders(headers: Record<string, string | string[]>) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  let score = 0;
  const missing: string[] = [];
  if (normalized['strict-transport-security']) score += 20; else missing.push('HSTS');
  if (normalized['content-security-policy']) score += 20; else missing.push('CSP');
  if (normalized['x-frame-options']) score += 20; else missing.push('X-Frame-Options');
  if (normalized['x-content-type-options']) score += 15; else missing.push('X-Content-Type-Options');
  if (normalized['referrer-policy']) score += 15; else missing.push('Referrer-Policy');
  if (normalized['permissions-policy']) score += 5; else missing.push('Permissions-Policy');
  if (normalized['x-xss-protection']) score += 5; else missing.push('X-XSS-Protection');
  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F';
  return { score, grade, missing, passive: true, source: 'shodan' as const };
}

export function buildShodanPassiveAnalysis(host: ShodanHostData): ShodanPassiveAnalysis {
  const banners = host.data || [];
  const sslBanner = banners.find((banner) => banner.port === 443 && banner.ssl?.cert) || banners.find((banner) => banner.ssl?.cert);
  const httpBanner = banners.find((banner) => banner.port === 443 && banner.http?.headers) || banners.find((banner) => banner.http?.headers);
  const observedAt = [sslBanner?.timestamp, httpBanner?.timestamp, host.last_update].filter(Boolean).sort().at(-1);

  let ssl: Record<string, unknown> | null = null;
  if (sslBanner?.ssl?.cert) {
    const cert = sslBanner.ssl.cert;
    const expiresAt = cert.expires ? new Date(cert.expires).getTime() : Number.NaN;
    const daysLeft = Number.isFinite(expiresAt) ? Math.floor((expiresAt - Date.now()) / 86_400_000) : null;
    const isSelfSigned = certificateName(cert.subject) === certificateName(cert.issuer);
    const validByDate = daysLeft !== null ? daysLeft >= 0 : cert.expired === false;
    const valid = validByDate && !isSelfSigned;
    let grade = daysLeft === null ? '—' : daysLeft >= 30 ? 'A' : daysLeft >= 7 ? 'B' : daysLeft >= 0 ? 'C' : 'F';
    if (isSelfSigned || cert.expired === true) grade = 'F';
    const cipherName = sslBanner.ssl.cipher?.name || 'Bilinmiyor';
    ssl = {
      valid,
      daysLeft,
      issuer: certificateName(cert.issuer),
      isSelfSigned,
      grade,
      protocol: sslBanner.ssl.cipher?.version || sslBanner.ssl.versions?.filter((version) => !version.startsWith('-')).at(-1),
      cipher: { name: cipherName, version: sslBanner.ssl.cipher?.version || '', weak: weakCipher(cipherName) },
      san: cert.subjectAltName || [],
      passive: true,
      source: 'shodan',
      observedAt: sslBanner.timestamp || host.last_update
    };
  }

  let advanced: ShodanPassiveAnalysis['advanced'] = null;
  if (httpBanner?.http?.headers) {
    const headers = Object.fromEntries(Object.entries(httpBanner.http.headers).map(([key, value]) => [key.toLowerCase(), value]));
    const wafName = detectWaf(headers as IncomingHttpHeaders);
    advanced = {
      security: { ...securityFromHeaders(headers), observedAt: httpBanner.timestamp || host.last_update },
      waf: wafName ? { detected: true, name: wafName } : { detected: false },
      passive: true,
      source: 'shodan',
      observedAt: httpBanner.timestamp || host.last_update
    };
  }
  return { source: 'shodan', observedAt, ssl, advanced };
}

export async function getShodanPassiveAnalysis(ip: string): Promise<ShodanPassiveAnalysis | null> {
  const host = await getShodanHost(ip);
  return host ? buildShodanPassiveAnalysis(host) : null;
}
