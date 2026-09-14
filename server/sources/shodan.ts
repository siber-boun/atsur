import type { SubdomainSource } from './types';
import { SOURCE_KEYS } from '../config';

const shodan: SubdomainSource = {
  id: 'shodan',
  label: 'Shodan',
  requiresKey: 'SHODAN_API_KEY',
  async fetch(domain, context) {
    const data = await context.fetchJson<{ subdomains?: string[] }>(
      `https://api.shodan.io/dns/domain/${encodeURIComponent(domain)}?key=${encodeURIComponent(SOURCE_KEYS.SHODAN_API_KEY || '')}`,
      { signal: context.signal }
    );
    return (data.subdomains || []).map((label) => ({ subdomain: `${label}.${domain}` }));
  }
};

export default shodan;
