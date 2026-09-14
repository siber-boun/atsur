import type { SubdomainSource } from './types';

export function parseRapidDns(html: string): string[] {
  const names = new Set<string>();
  for (const match of html.matchAll(/<td[^>]*>\s*([a-z0-9*][a-z0-9*.-]*\.[a-z0-9.-]+)\s*<\/td>/gi)) names.add(match[1]);
  return [...names];
}

const rapiddns: SubdomainSource = {
  id: 'rapiddns',
  label: 'RapidDNS',
  async fetch(domain, context) {
    const html = await context.fetchText(`https://rapiddns.io/subdomain/${encodeURIComponent(domain)}?full=1`, { signal: context.signal });
    return parseRapidDns(html).map((subdomain) => ({ subdomain }));
  }
};

export default rapiddns;
