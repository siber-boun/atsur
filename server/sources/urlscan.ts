import type { SubdomainSource } from './types';

const urlscan: SubdomainSource = {
  id: 'urlscan',
  label: 'urlscan.io',
  async fetch(domain, context) {
    const data = await context.fetchJson<{ results?: Array<{ page?: { domain?: string } }> }>(
      `https://urlscan.io/api/v1/search/?q=domain:${encodeURIComponent(domain)}&size=100`,
      { signal: context.signal }
    );
    return (data.results || []).flatMap((result) => result.page?.domain ? [{ subdomain: result.page.domain }] : []);
  }
};

export default urlscan;
