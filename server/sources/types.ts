import type { RequestInit } from 'node-fetch';

export interface SourceHit {
  subdomain: string;
  ip?: string;
}

export interface SourceContext {
  fetchJson: <T>(url: string, init?: RequestInit) => Promise<T>;
  fetchText: (url: string, init?: RequestInit) => Promise<string>;
  signal: AbortSignal;
}

export interface SubdomainSource {
  id: string;
  label: string;
  requiresKey?: string;
  enabledByDefault?: boolean;
  timeoutMs?: number;
  fetch(domain: string, context: SourceContext): Promise<SourceHit[]>;
}

export interface SourceStatus {
  id: string;
  label: string;
  ok: boolean;
  count: number;
  ms: number;
  skipped?: 'no-key' | 'timeout' | 'error' | 'disabled' | 'rate-limited';
}

export interface MergedSourceHit extends SourceHit {
  sources: string[];
}

export function normalizeSourceHit(hit: SourceHit, domain: string): SourceHit | null {
  const subdomain = hit.subdomain.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
  const normalizedDomain = domain.toLowerCase();
  if (!subdomain || !(subdomain === normalizedDomain || subdomain.endsWith(`.${normalizedDomain}`))) return null;
  return { subdomain, ...(hit.ip ? { ip: hit.ip.trim() } : {}) };
}

export function dedupeSourceHits(hits: SourceHit[], domain: string): SourceHit[] {
  const unique = new Map<string, SourceHit>();
  for (const hit of hits) {
    const normalized = normalizeSourceHit(hit, domain);
    if (!normalized) continue;
    const existing = unique.get(normalized.subdomain);
    unique.set(normalized.subdomain, existing?.ip ? existing : normalized);
  }
  return [...unique.values()];
}
