import type { SubdomainSource } from './types';
import { SOURCE_KEYS } from '../config';

const otx: SubdomainSource = {
  id: 'otx',
  label: 'AlienVault OTX',
  requiresKey: 'OTX_API_KEY',
  async fetch(domain, context) {
    const data = await context.fetchJson<{ passive_dns?: Array<{ hostname?: string }> }>(
      `https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(domain)}/passive_dns`,
      { signal: context.signal, headers: { 'X-OTX-API-KEY': SOURCE_KEYS.OTX_API_KEY || '' } }
    );
    return (data.passive_dns || []).flatMap((record) => record.hostname ? [{ subdomain: record.hostname }] : []);
  }
};

export default otx;
