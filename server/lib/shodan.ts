import { SOURCE_KEYS } from '../config';
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
