import { URL } from 'node:url';
import type { SubdomainSource } from './types';

const wayback: SubdomainSource = {
  id: 'wayback',
  label: 'Wayback CDX',
  enabledByDefault: false,
  timeoutMs: 8000,
  async fetch(domain, context) {
    const rows = await context.fetchJson<string[][]>(
      `https://web.archive.org/cdx/search/cdx?url=*.${encodeURIComponent(domain)}/*&output=json&fl=original&filter=statuscode:200&collapse=urlkey`,
      { signal: context.signal }
    );
    return rows.slice(1).flatMap((row) => {
      try { return row[0] ? [{ subdomain: new URL(row[0]).hostname }] : []; } catch { return []; }
    });
  }
};

export default wayback;
