import type { SubdomainSource } from './types';
import { SOURCE_KEYS } from '../config';

const chaos: SubdomainSource = {
  id: 'chaos',
  label: 'ProjectDiscovery Chaos',
  requiresKey: 'CHAOS_API_KEY',
  async fetch(domain, context) {
    const data = await context.fetchJson<{ subdomains?: string[] }>(
      `https://dns.projectdiscovery.io/dns/${encodeURIComponent(domain)}/subdomains`,
      { signal: context.signal, headers: { Authorization: SOURCE_KEYS.CHAOS_API_KEY || '' } }
    );
    return (data.subdomains || []).map((subdomain) => ({ subdomain }));
  }
};

export default chaos;
