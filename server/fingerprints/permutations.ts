const PREFIXES = ['dev', 'staging'];
const SUFFIXES = ['dev', 'test', 'old', 'new'];

function seedLabel(seed: string, domain: string): string | null {
  const normalized = seed.trim().toLowerCase().replace(/\.$/, '');
  if (!normalized || normalized === domain) return null;
  const suffix = `.${domain}`;
  if (!normalized.endsWith(suffix)) return null;
  const label = normalized.slice(0, -suffix.length);
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) ? label : null;
}

export function makePermutations(domain: string, seeds: string[]): string[] {
  const candidates = new Set<string>();
  for (const seed of seeds.slice(0, 30)) {
    const label = seedLabel(seed, domain);
    if (!label) continue;
    for (const prefix of PREFIXES) candidates.add(`${prefix}-${label}.${domain}`);
    for (const suffix of SUFFIXES) candidates.add(`${label}-${suffix}.${domain}`);
    candidates.add(`${label}2.${domain}`);
  }
  return [...candidates];
}
