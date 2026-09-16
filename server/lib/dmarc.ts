export interface DmarcResult {
  hasRecord: boolean;
  policy: 'none' | 'quarantine' | 'reject';
  subdomainPolicy?: 'none' | 'quarantine' | 'reject';
  percentage?: number;
  aggregateReports: boolean;
  forensicReports: boolean;
  adkim?: 'r' | 's';
  aspf?: 'r' | 's';
  raw?: string;
}

const policy = (value: string | undefined): 'none' | 'quarantine' | 'reject' | undefined =>
  value === 'none' || value === 'quarantine' || value === 'reject' ? value : undefined;

export function parseDmarc(records: string[]): DmarcResult {
  const raw = records.find((record) => /^\s*v\s*=\s*DMARC1\b/i.test(record));
  if (!raw) return { hasRecord: false, policy: 'none', aggregateReports: false, forensicReports: false };
  const tags = new Map(raw.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim().toLowerCase(), part.slice(index + 1).trim()];
  }));
  const percentage = Number(tags.get('pct'));
  return {
    hasRecord: true,
    policy: policy(tags.get('p')?.toLowerCase()) || 'none',
    subdomainPolicy: policy(tags.get('sp')?.toLowerCase()),
    percentage: Number.isFinite(percentage) ? Math.max(0, Math.min(100, percentage)) : undefined,
    aggregateReports: Boolean(tags.get('rua')),
    forensicReports: Boolean(tags.get('ruf')),
    adkim: tags.get('adkim')?.toLowerCase() === 's' ? 's' : tags.has('adkim') ? 'r' : undefined,
    aspf: tags.get('aspf')?.toLowerCase() === 's' ? 's' : tags.has('aspf') ? 'r' : undefined,
    raw
  };
}
