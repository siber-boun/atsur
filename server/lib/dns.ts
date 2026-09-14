import dns from 'node:dns';
import { DNS_CACHE_MAX_ENTRIES, DNS_CACHE_TTL_MS, DNS_RESOLVERS, DNS_TIMEOUT_MS } from '../config';
import type { DnsResult } from '../types';
import { isPrivateIp } from './ssrf';
import { dnsPool } from './pool';

type CachedResult = { expiresAt: number; value: DnsResult };
const cache = new Map<string, CachedResult>();
const nxdomainCodes = new Set(['ENOTFOUND', 'NXDOMAIN']);
const noDataCodes = new Set(['ENODATA', 'ENOTFOUND', 'NXDOMAIN']);

function cloneResult(value: DnsResult): DnsResult {
  return { ...value, a: [...value.a], cname: [...value.cname] };
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code) : undefined;
}

function isNoData(error: unknown): boolean {
  return noDataCodes.has(errorCode(error) || '');
}

function isNxDomain(error: unknown): boolean {
  return nxdomainCodes.has(errorCode(error) || '');
}

async function withTimeout<T>(operation: () => Promise<T>): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          const error = new Error('DNS timeout') as Error & { code?: string };
          error.code = 'ETIMEOUT';
          reject(error);
        }, DNS_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function createPublicResolver(): dns.promises.Resolver {
  const resolver = new dns.promises.Resolver();
  resolver.setServers(DNS_RESOLVERS);
  return resolver;
}

async function query<T>(method: 'resolve4' | 'resolve6' | 'resolveCname', host: string): Promise<T> {
  const publicResolver = createPublicResolver();
  try {
    return await withTimeout(() => publicResolver[method](host) as Promise<T>);
  } catch (publicError) {
    if (isNxDomain(publicError) || isNoData(publicError)) throw publicError;
    console.warn(`Açık DNS resolver başarısız (${method} ${host}), sistem resolver kullanılacak:`, errorCode(publicError) || publicError);
    return withTimeout(() => dns.promises[method](host) as Promise<T>);
  }
}

async function resolveHostUncached(host: string): Promise<DnsResult> {
  const normalizedHost = normalizeHost(host);
  const cname: string[] = [];
  const visited = new Set<string>([normalizedHost]);
  let current = normalizedHost;

  for (let depth = 0; depth < 10; depth += 1) {
    try {
      const targets = await query<string[]>('resolveCname', current);
      if (targets.length === 0) break;
      const target = normalizeHost(targets[0]);
      if (!target || visited.has(target)) break;
      cname.push(target);
      visited.add(target);
      current = target;
    } catch (error) {
      if (isNoData(error)) break;
      return { host: normalizedHost, status: 'error', a: [], cname };
    }
  }

  try {
    const [a, aaaa] = await Promise.all([
      query<string[]>('resolve4', current).catch((error) => {
        if (isNoData(error)) return [];
        throw error;
      }),
      query<string[]>('resolve6', current).catch((error) => {
        if (isNoData(error)) return [];
        throw error;
      })
    ]);
    const allIps = [...a, ...aaaa];
    if (allIps.length === 0) {
      return {
        host: normalizedHost, status: 'dead', a, cname,
        ...(cname.length > 0 ? { cnameTarget: cname[cname.length - 1], nxdomainAtEnd: true } : {})
      };
    }
    const status = allIps.every(isPrivateIp) ? 'private' : 'live';
    return {
      host: normalizedHost, status, a, cname,
      ...(cname.length > 0 ? { cnameTarget: cname[cname.length - 1] } : {})
    };
  } catch (error) {
    if (isNxDomain(error)) {
      return {
        host: normalizedHost, status: 'dead', a: [], cname,
        ...(cname.length > 0 ? { cnameTarget: cname[cname.length - 1], nxdomainAtEnd: true } : {})
      };
    }
    return { host: normalizedHost, status: 'error', a: [], cname };
  }
}

export async function resolveHost(host: string): Promise<DnsResult> {
  const normalizedHost = normalizeHost(host);
  const cached = cache.get(normalizedHost);
  if (cached && cached.expiresAt > Date.now()) return cloneResult(cached.value);
  if (cached) cache.delete(normalizedHost);

  const result = await dnsPool.run(() => resolveHostUncached(normalizedHost));
  if (cache.size >= DNS_CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(normalizedHost, { expiresAt: Date.now() + DNS_CACHE_TTL_MS, value: cloneResult(result) });
  return cloneResult(result);
}

export async function resolveMany(hosts: string[]): Promise<DnsResult[]> {
  return Promise.all(hosts.map((host) => resolveHost(host)));
}
