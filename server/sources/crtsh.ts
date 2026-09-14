import type { SubdomainSource } from './types';

const crtsh: SubdomainSource = {
  id: 'crtsh',
  label: 'crt.sh',
  async fetch(domain, context) {
    const data = await context.fetchJson<Array<{ name_value?: string }>>(
      `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`,
      { signal: context.signal }
    );
    const hits: { subdomain: string }[] = [];
    data.forEach((item) => {
      const parts = (item.name_value || '').split('\n');
      parts.forEach((part: string) => {
        hits.push({ subdomain: part });
      });
    });
    return hits;
  }
};

export default crtsh;
