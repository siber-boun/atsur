import { Router } from 'express';
import { isValidDomain } from '../lib/validate';
import { resolveMany } from '../lib/dns';
import { detectWildcard, matchesWildcard } from '../lib/wildcard';
import { ALL_SOURCES, runSources } from '../sources';
import { fetchAxfr } from '../sources/axfr';
import type { ScanResponse, SubdomainData } from '../types';

const MAX_INITIAL_VALIDATION = 150;

const router = Router();

router.get('/api/scan', async (req, res) => {
  const domain = req.query.domain as string;
  if (!domain || !isValidDomain(domain)) return res.status(400).json({ error: 'Geçerli bir domain parametresi gerekli' });
  try {
    const normalizedDomain = domain.toLowerCase();
    const validate = req.query.validate === '1';
    const [{ hits, statuses }, wildcard] = await Promise.all([
      runSources(normalizedDomain),
      detectWildcard(normalizedDomain)
    ]);
    if (req.query.axfr === '1') {
      const startedAt = Date.now();
      const axfrHits = await fetchAxfr(normalizedDomain);
      statuses.push({ id: 'axfr', label: 'DNS AXFR', ok: true, count: axfrHits.length, ms: Date.now() - startedAt });
      for (const subdomain of axfrHits) {
        const existing = hits.get(subdomain);
        if (existing) {
          if (!existing.sources.includes('axfr')) existing.sources.push('axfr');
        } else {
          hits.set(subdomain, { subdomain, sources: ['axfr'] });
        }
      }
    }
    const labels = new Map([...ALL_SOURCES.map((source) => [source.id, source.label] as const), ['axfr', 'DNS AXFR'] as const]);
    const passiveResults: SubdomainData[] = Array.from(hits.values()).map((hit) => ({
      subdomain: hit.subdomain,
      source: hit.sources.map((id) => labels.get(id) || id).join(' + '),
      sources: hit.sources,
      ...(hit.ip ? { ip: hit.ip } : {}),
      discoveredBy: hit.sources.includes('axfr') ? 'axfr' as const : hit.sources.includes('certsan') ? 'cert-san' as const : 'passive' as const
    })).sort((a, b) => a.subdomain.localeCompare(b.subdomain));
    const validationCount = validate ? Math.min(passiveResults.length, MAX_INITIAL_VALIDATION) : 0;
    if (validationCount) {
      const resolved = await resolveMany(passiveResults.slice(0, validationCount).map((item) => item.subdomain));
      for (let index = 0; index < validationCount; index += 1) {
        const dns = resolved[index];
        passiveResults[index] = {
          ...passiveResults[index],
          status: dns.status,
          ips: dns.a,
          ...(dns.a[0] ? { ip: dns.a[0] } : {}),
          ...(dns.cname.length ? { cname: dns.cname } : {}),
          ...(matchesWildcard(dns, wildcard) ? { wildcardMatch: true } : {})
        };
      }
    }
    const results = passiveResults.map((result, index) => ({
      ...result,
      ...(index >= validationCount ? { status: 'unknown' as const } : {})
    }));
    const response: ScanResponse = {
      domain: normalizedDomain,
      wildcard,
      sources: statuses,
      results,
      truncatedValidation: validate && passiveResults.length > MAX_INITIAL_VALIDATION
    };
    res.json(response);
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ error: 'Tarama sırasında hata oluştu.' });
  }
});

export default router;
