import { Router } from 'express';
import { isValidDomain } from '../lib/validate';
import { fetchCrtSh } from '../sources/crtsh';
import { fetchHackerTarget } from '../sources/hackertarget';

const router = Router();

router.get('/api/scan', async (req, res) => {
  const domain = req.query.domain as string;
  if (!domain || !isValidDomain(domain)) return res.status(400).json({ error: 'Geçerli bir domain parametresi gerekli' });
  try {
    const [crtResult, htResult] = await Promise.allSettled([fetchCrtSh(domain), fetchHackerTarget(domain)]);
    const crtSubs = crtResult.status === 'fulfilled' ? crtResult.value : [];
    const htSubs = htResult.status === 'fulfilled' ? htResult.value : [];
    const merged = new Map<string, { subdomain: string; source: string; ip?: string }>();
    crtSubs.forEach((s) => merged.set(s.subdomain, { subdomain: s.subdomain, source: 'crt.sh' }));
    htSubs.forEach((s) => {
      if (merged.has(s.subdomain)) {
        const existing = merged.get(s.subdomain)!;
        existing.source = 'crt.sh + HackerTarget';
        if (!existing.ip && s.ip) existing.ip = s.ip;
      } else {
        merged.set(s.subdomain, { subdomain: s.subdomain, ip: s.ip, source: 'HackerTarget' });
      }
    });
    res.json(Array.from(merged.values()).sort((a, b) => a.subdomain.localeCompare(b.subdomain)));
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ error: 'Tarama sırasında hata oluştu.' });
  }
});

export default router;
