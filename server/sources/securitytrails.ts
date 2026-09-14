import type { SubdomainSource } from './types';
import { SOURCE_KEYS } from '../config';

const securitytrails: SubdomainSource = {
  id: 'securitytrails',
  label: 'SecurityTrails',
  requiresKey: 'SECURITYTRAILS_API_KEY',
  async fetch(domain, context) {
    const data = await context.fetchJson<{ subdomains?: string[] }>(
      `https://api.securitytrails.com/v1/domain/${encodeURIComponent(domain)}/subdomains`,
      { signal: context.signal, headers: { APIKEY: SOURCE_KEYS.SECURITYTRAILS_API_KEY || '' } }
    );
    return (data.subdomains || []).map((label) => ({ subdomain: `${label}.${domain}` }));
  }
};

export default securitytrails;
