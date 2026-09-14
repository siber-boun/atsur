import { getFetch } from '../lib/http';
import type { SubdomainSourceResult } from '../types';

export async function fetchHackerTarget(domain: string): Promise<SubdomainSourceResult[]> {
  try {
    const fetch = await getFetch();
    const res = await fetch(`https://api.hackertarget.com/hostsearch/?q=${domain}`);
    const text = await res.text();
    if (text.includes('error') || text.includes('API count exceeded')) return [];
    return text.split('\n').filter((line) => line.includes(',')).map((line) => ({
      subdomain: line.split(',')[0].trim().toLowerCase(),
      ip: line.split(',')[1].trim()
    })).filter((item) => item.subdomain.endsWith(`.${domain}`));
  } catch {
    return [];
  }
}
