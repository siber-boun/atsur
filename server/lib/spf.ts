import dns from 'node:dns';

export interface SpfResult {
  hasRecord: boolean;
  all: '-all' | '~all' | '?all' | '+all' | null;
  lookupCount: number;
  permerror: boolean;
  permerrorReason?: 'too-many-lookups' | 'multiple-records' | 'syntax';
  truncated: boolean;
  raw?: string;
}

type TxtResolver = (host: string) => Promise<string[][]>;
export interface SpfOptions { resolveTxt?: TxtResolver; }

const flatten = (records: string[][]) => records.map((record) => record.join(''));

/**
 * Evaluates the SPF lookup budget and follows include/redirect records. DNS mechanisms are
 * counted exactly once per evaluation path; the 10-query ceiling is the RFC receiver limit.
 */
export async function evaluateSpf(domain: string, options: SpfOptions = {}): Promise<SpfResult> {
  const resolveTxt = options.resolveTxt || dns.promises.resolveTxt;
  let lookupCount = 0;
  let permerrorReason: SpfResult['permerrorReason'];
  let truncated = false;
  let rootRaw: string | undefined;
  const active = new Set<string>();

  const consumeLookup = () => {
    lookupCount += 1;
    if (lookupCount > 10) {
      permerrorReason = 'too-many-lookups';
      truncated = true;
      return false;
    }
    return true;
  };

  const evaluate = async (host: string, root = false): Promise<{ record?: string; all: SpfResult['all'] }> => {
    if (active.has(host)) {
      permerrorReason ||= 'syntax';
      return { all: null };
    }
    active.add(host);
    let records: string[] = [];
    try { records = flatten(await resolveTxt(host)); } catch { active.delete(host); return { all: null }; }
    const spfRecords = records.filter((record) => /^\s*v=spf1(?:\s|$)/i.test(record));
    if (spfRecords.length > 1) {
      permerrorReason ||= 'multiple-records';
      active.delete(host);
      return { all: null };
    }
    const record = spfRecords[0];
    if (!record) { active.delete(host); return { all: null }; }
    if (root) rootRaw = record;
    let all: SpfResult['all'] = null;
    const terms = record.trim().split(/\s+/).slice(1);
    for (const term of terms) {
      const qualifier = /^[+\-~?]/.test(term) ? term[0] : '+';
      const mechanism = term.replace(/^[+\-~?]/, '');
      if (mechanism === 'all') all = `${qualifier}all` as SpfResult['all'];
      const separator = mechanism.indexOf(':');
      const name = (separator === -1 ? mechanism : mechanism.slice(0, separator)).toLowerCase();
      const value = separator === -1 ? '' : mechanism.slice(separator + 1).split('/')[0];
      if (name === 'include' || name === 'redirect') {
        if (!value) { permerrorReason ||= 'syntax'; continue; }
        if (!consumeLookup()) break;
        await evaluate(value);
      } else if (['a', 'mx', 'ptr', 'exists'].includes(name)) {
        if (!consumeLookup()) break;
      }
      if (lookupCount >= 30) { truncated = true; break; }
    }
    active.delete(host);
    return { record, all };
  };

  const result = await evaluate(domain, true);
  return {
    hasRecord: Boolean(rootRaw), all: result.all, lookupCount,
    permerror: Boolean(permerrorReason), permerrorReason, truncated, raw: rootRaw
  };
}
