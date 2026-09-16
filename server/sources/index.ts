import { LIMITS, SOURCE_KEYS, SOURCE_TIMEOUT_MS } from '../config';
import { HttpError, fetchJson, fetchText } from '../lib/http';
import { mapPool } from '../lib/pool';
import certsan from './certsan';
import certspotter from './certspotter';
import chaos from './chaos';
import crtsh from './crtsh';
import hackertarget from './hackertarget';
import otx from './otx';
import rapiddns from './rapiddns';
import securitytrails from './securitytrails';
import shodan from './shodan';
import urlscan from './urlscan';
import virustotal from './virustotal';
import wayback from './wayback';
import { dedupeSourceHits, type MergedSourceHit, type SourceContext, type SourceStatus, type SubdomainSource } from './types';

export const ALL_SOURCES: SubdomainSource[] = [
  crtsh, hackertarget, certspotter, rapiddns, urlscan,
  otx, securitytrails, virustotal, chaos, shodan, wayback, certsan
];

let latestStatuses: SourceStatus[] = initialStatuses();

function initialStatuses(): SourceStatus[] {
  return ALL_SOURCES.map((source) => {
    if (source.enabledByDefault === false) return { id: source.id, label: source.label, ok: false, count: 0, ms: 0, skipped: 'disabled' };
    if (source.requiresKey && !SOURCE_KEYS[source.requiresKey]) return { id: source.id, label: source.label, ok: false, count: 0, ms: 0, skipped: 'no-key' };
    return { id: source.id, label: source.label, ok: false, count: 0, ms: 0 };
  });
}

function skipStatus(source: SubdomainSource, skipped: NonNullable<SourceStatus['skipped']>): SourceStatus {
  return { id: source.id, label: source.label, ok: false, count: 0, ms: 0, skipped };
}

export function classifySourceError(error: unknown): NonNullable<SourceStatus['skipped']> {
  const name = error instanceof Error ? error.name : '';
  return error instanceof HttpError && error.status === 429 ? 'rate-limited'
    : name === 'AbortError' || name === 'TimeoutError' ? 'timeout' : 'error';
}

function statusForError(source: SubdomainSource, error: unknown, startedAt: number): SourceStatus {
  const skipped = classifySourceError(error);
  return { id: source.id, label: source.label, ok: false, count: 0, ms: Date.now() - startedAt, skipped };
}

export async function runSources(domain: string): Promise<{ hits: Map<string, MergedSourceHit>; statuses: SourceStatus[] }> {
  const normalizedDomain = domain.toLowerCase();
  const settled = await mapPool(ALL_SOURCES, LIMITS.source, async (source) => {
    if (source.enabledByDefault === false) return { source, status: skipStatus(source, 'disabled'), hits: [] };
    if (source.requiresKey && !SOURCE_KEYS[source.requiresKey]) return { source, status: skipStatus(source, 'no-key'), hits: [] };
    const startedAt = Date.now();
    const timeoutMs = source.timeoutMs ?? SOURCE_TIMEOUT_MS;
    const signal = AbortSignal.timeout(timeoutMs);
    const context: SourceContext = {
      signal,
      fetchJson: (url, init) => fetchJson(url, { ...init, signal }, timeoutMs),
      fetchText: (url, init) => fetchText(url, { ...init, signal }, timeoutMs)
    };
    try {
      const hits = dedupeSourceHits(await source.fetch(normalizedDomain, context), normalizedDomain);
      return { source, status: { id: source.id, label: source.label, ok: true, count: hits.length, ms: Date.now() - startedAt } as SourceStatus, hits };
    } catch (error) {
      return { source, status: statusForError(source, error, startedAt), hits: [] };
    }
  });

  const hits = new Map<string, MergedSourceHit>();
  const statuses: SourceStatus[] = [];
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    const { source, status, hits: sourceHits } = result.value;
    statuses.push(status);
    for (const hit of sourceHits) {
      const existing = hits.get(hit.subdomain);
      if (existing) {
        if (!existing.sources.includes(source.id)) existing.sources.push(source.id);
        if (!existing.ip && hit.ip) existing.ip = hit.ip;
      } else {
        hits.set(hit.subdomain, { ...hit, sources: [source.id] });
      }
    }
  }
  latestStatuses = statuses;
  return { hits, statuses };
}

export function getSourceStatuses(): SourceStatus[] {
  return latestStatuses.map((status) => ({ ...status }));
}
