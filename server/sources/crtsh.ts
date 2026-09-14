import { getFetch } from '../lib/http';
import type { SubdomainSourceResult } from '../types';

export async function fetchCrtSh(domain: string): Promise<SubdomainSourceResult[]> {
  try {
    const fetch = await getFetch();
    const response = await fetch(`https://crt.sh/?q=${domain}&output=json`);
    if (!response.ok) return [];
    const data: any[] = await response.json();
    const uniqueSubdomains = new Set<string>();
    data.forEach((item) => {
      const parts = item.name_value.split('\n');
      parts.forEach((part: string) => {
        const cleaned = part.trim().toLowerCase();
        const finalDomain = cleaned.startsWith('*.') ? cleaned.substring(2) : cleaned;
        if (finalDomain && finalDomain.endsWith(domain)) uniqueSubdomains.add(finalDomain);
      });
    });
    return Array.from(uniqueSubdomains).map((subdomain) => ({ subdomain, source: 'crt.sh' }));
  } catch {
    return [];
  }
}
