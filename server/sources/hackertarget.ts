import type { SubdomainSource } from './types';

const hackertarget: SubdomainSource = {
  id: 'hackertarget',
  label: 'HackerTarget',
  async fetch(domain, context) {
    const text = await context.fetchText(`https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(domain)}`, { signal: context.signal });
    if (text.includes('error') || text.includes('API count exceeded')) return [];
    return text.split('\n').filter((line) => line.includes(',')).map((line) => ({
      subdomain: line.split(',')[0].trim().toLowerCase(),
      ip: line.split(',')[1].trim()
    }));
  }
};

export default hackertarget;
