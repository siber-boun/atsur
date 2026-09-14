import { Router } from 'express';
import { BRUTE_MAX_CANDIDATES } from '../config';
import { makePermutations } from '../fingerprints/permutations';
import { WORDLIST } from '../fingerprints/wordlist';
import { resolveMany } from '../lib/dns';
import { isValidDomain } from '../lib/validate';
import { detectWildcard } from '../lib/wildcard';
import type { SubdomainData } from '../types';

const router = Router();
type BruteMode = 'wordlist' | 'permutation' | 'both';

function isMode(value: unknown): value is BruteMode {
  return value === 'wordlist' || value === 'permutation' || value === 'both';
}

export function projectedCandidateCount(mode: BruteMode, seedCount: number): number {
  return (mode === 'both' ? WORDLIST.length : 0) + (mode === 'permutation' || mode === 'both' ? seedCount * 7 : 0);
}

router.post('/api/brute', async (req, res) => {
  const domain = typeof req.body?.domain === 'string' ? req.body.domain.trim().toLowerCase() : '';
  const mode = req.body?.mode;
  const seeds = req.body?.seeds === undefined ? [] : req.body.seeds;
  if (!domain || !isValidDomain(domain)) return res.status(400).json({ error: 'Geçerli bir domain gerekli' });
  if (!isMode(mode)) return res.status(400).json({ error: 'mode wordlist, permutation veya both olmalıdır' });
  if (!Array.isArray(seeds) || seeds.some((seed) => typeof seed !== 'string')) {
    return res.status(400).json({ error: 'seeds isteğe bağlı bir hostname dizisi olmalıdır' });
  }
  try {
    // Bu kapı aday üretiminden ve resolveMany'den önce olmalıdır: wildcard zone'larda DNS sorgusu yoktur.
    const wildcard = await detectWildcard(domain);
    if (wildcard.isWildcard && wildcard.confidence === 'high') {
      return res.json({ skipped: 'wildcard', wildcard, results: [] });
    }

    const candidates = new Map<string, 'brute' | 'permutation'>();
    if (mode === 'wordlist' || mode === 'both') {
      for (const label of WORDLIST) candidates.set(`${label}.${domain}`, 'brute');
    }
    if (mode === 'permutation' || mode === 'both') {
      // Tarama kalitesi için ilk 30 canlı seed kullanılır. Bununla birlikte, çok büyük
      // bir kullanıcı girdisi sessizce kaybolmasın diye olası aday yükünü açıkça reddet.
      const projected = projectedCandidateCount(mode, seeds.length);
      if (projected > BRUTE_MAX_CANDIDATES) {
        return res.status(400).json({ error: `Aday sayısı ${BRUTE_MAX_CANDIDATES} sınırını aşıyor`, candidates: projected });
      }
      for (const host of makePermutations(domain, seeds)) candidates.set(host, 'permutation');
    }
    if (candidates.size > BRUTE_MAX_CANDIDATES) {
      return res.status(400).json({ error: `Aday sayısı ${BRUTE_MAX_CANDIDATES} sınırını aşıyor`, candidates: candidates.size });
    }

    const hosts = [...candidates.keys()];
    const resolved = await resolveMany(hosts);
    const results: SubdomainData[] = resolved.flatMap((result) => {
      if (result.status !== 'live') return [];
      return [{
        subdomain: result.host,
        source: candidates.get(result.host) === 'permutation' ? 'Permutation' : 'Wordlist',
        sources: [candidates.get(result.host) === 'permutation' ? 'permutation' : 'wordlist'],
        ips: result.a,
        ...(result.a[0] ? { ip: result.a[0] } : {}),
        status: 'live' as const,
        ...(result.cname.length ? { cname: result.cname } : {}),
        discoveredBy: candidates.get(result.host)
      }];
    }).sort((a, b) => a.subdomain.localeCompare(b.subdomain));
    res.json({ domain, wildcard, results });
  } catch (error) {
    console.error('Brute-force error:', error);
    res.status(500).json({ error: 'Brute-force DNS taraması sırasında hata oluştu.' });
  }
});

export default router;
