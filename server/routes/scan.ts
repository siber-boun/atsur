import { Router } from 'express';
import { isValidDomain } from '../lib/validate';
import { ALL_SOURCES, runSources } from '../sources';

const router = Router();

router.get('/api/scan', async (req, res) => {
  const domain = req.query.domain as string;
  if (!domain || !isValidDomain(domain)) return res.status(400).json({ error: 'Geçerli bir domain parametresi gerekli' });
  try {
    const { hits } = await runSources(domain);
    const labels = new Map(ALL_SOURCES.map((source) => [source.id, source.label]));
    const results = Array.from(hits.values()).map((hit) => ({
      subdomain: hit.subdomain,
      source: hit.sources.map((id) => labels.get(id) || id).join(' + '),
      sources: hit.sources,
      ...(hit.ip ? { ip: hit.ip } : {})
    })).sort((a, b) => a.subdomain.localeCompare(b.subdomain));
    res.json(results);
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ error: 'Tarama sırasında hata oluştu.' });
  }
});

export default router;
