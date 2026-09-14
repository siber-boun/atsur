import type { SubdomainSource } from './types';
import { SOURCE_KEYS } from '../config';

const virustotal: SubdomainSource = {
  id: 'virustotal',
  label: 'VirusTotal',
  requiresKey: 'VIRUSTOTAL_API_KEY',
  async fetch(domain, context) {
    const data = await context.fetchJson<{ data?: Array<{ id?: string }> }>(
      `https://www.virustotal.com/api/v3/domains/${encodeURIComponent(domain)}/subdomains?limit=40`,
      { signal: context.signal, headers: { 'x-apikey': SOURCE_KEYS.VIRUSTOTAL_API_KEY || '' } }
    );
    return (data.data || []).flatMap((record) => record.id ? [{ subdomain: record.id }] : []);
  }
};

export default virustotal;
