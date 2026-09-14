import { randomBytes } from 'node:crypto';
import type { DnsResult, WildcardInfo } from '../types';
import { resolveMany } from './dns';

function randomLabel(): string {
  return randomBytes(6).toString('hex');
}

export async function detectWildcard(domain: string): Promise<WildcardInfo> {
  const candidates = Array.from({ length: 3 }, () => `${randomLabel()}.${domain}`);
  const results = await resolveMany(candidates);
  const resolved = results.filter((result) => result.status === 'live' || result.status === 'private');
  const wildcardIps = [...new Set(resolved.flatMap((result) => result.a))];
  const cnameCounts = new Map<string, number>();
  for (const result of resolved) {
    const target = result.cnameTarget;
    if (target) cnameCounts.set(target, (cnameCounts.get(target) || 0) + 1);
  }
  const wildcardCname = [...cnameCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const isWildcard = resolved.length >= 2;
  return {
    isWildcard,
    wildcardIps,
    ...(wildcardCname ? { wildcardCname } : {}),
    confidence: isWildcard ? 'high' : 'low'
  };
}

export function matchesWildcard(result: DnsResult, info: WildcardInfo): boolean {
  if (!info.isWildcard || info.confidence !== 'high' || result.a.length === 0) return false;
  const usesOnlyWildcardIps = result.a.every((ip) => info.wildcardIps.includes(ip));
  const hasDistinctiveCname = result.cname.length > 0 && result.cnameTarget !== info.wildcardCname;
  return usesOnlyWildcardIps && !hasDistinctiveCname;
}
