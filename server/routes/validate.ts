import { Router } from 'express';
import { resolveMany } from '../lib/dns';
import { isValidDomain } from '../lib/validate';
import { detectWildcard, matchesWildcard } from '../lib/wildcard';

const router = Router();
const MAX_HOSTS = 150;

router.post('/api/validate', async (req, res) => {
  const domain = typeof req.body?.domain === 'string' ? req.body.domain.toLowerCase() : '';
  const hosts = req.body?.hosts;
  if (!domain || !isValidDomain(domain)) return res.status(400).json({ error: 'Geçerli bir domain gerekli' });
  if (!Array.isArray(hosts) || hosts.some((host) => typeof host !== 'string')) {
    return res.status(400).json({ error: 'hosts, hostname dizisi olmalıdır' });
  }
  if (hosts.length > MAX_HOSTS) return res.status(400).json({ error: `En fazla ${MAX_HOSTS} host doğrulanabilir` });
  const normalizedHosts = hosts.map((host) => host.trim().toLowerCase());
  if (normalizedHosts.some((host) => !host || !(host === domain || host.endsWith(`.${domain}`)))) {
    return res.status(400).json({ error: 'Her host belirtilen domain altında olmalıdır' });
  }
  try {
    const [wildcard, resolved] = await Promise.all([detectWildcard(domain), resolveMany(normalizedHosts)]);
    const results = resolved.map((result) => ({
      ...result,
      ...(matchesWildcard(result, wildcard) ? { wildcardMatch: true } : {})
    }));
    res.json({ wildcard, results });
  } catch (error) {
    console.error('DNS doğrulama hatası:', error);
    res.status(500).json({ error: 'DNS doğrulaması sırasında hata oluştu.' });
  }
});

export default router;
