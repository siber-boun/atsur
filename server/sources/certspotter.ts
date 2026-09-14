import type { SubdomainSource } from './types';

const certspotter: SubdomainSource = {
  id: 'certspotter',
  label: 'Certspotter',
  async fetch(domain, context) {
    const url = `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names`;
    const issuances = await context.fetchJson<Array<{ dns_names?: string[] }>>(url, { signal: context.signal });
    return issuances.flatMap((issuance) => (issuance.dns_names || []).map((subdomain) => ({ subdomain })));
  }
};

export default certspotter;
