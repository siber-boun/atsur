import { Router } from 'express';
import https from 'node:https';
import { TECH_SIGNATURES } from '../fingerprints/tech';
import { getFetch } from '../lib/http';
import { httpPool } from '../lib/pool';
import { resolvePublic } from '../lib/ssrf';
import { isValidDomain } from '../lib/validate';

const router = Router();

router.get('/api/tech', async (req, res) => {
  const subdomain = req.query.subdomain as string;
  if (!subdomain || !isValidDomain(subdomain)) return res.status(400).json({ error: 'Geçerli bir subdomain gerekli' });
  const resolved = await resolvePublic(subdomain);
  if (resolved.blocked) return res.json({ technologies: [], ...(resolved.reason === 'private-ip' ? { blocked: 'private-ip' } : {}) });
  const ip = resolved.ips[0];
  try {
    const detected = await httpPool.run(async () => {
      const fetch = await getFetch();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(`https://${subdomain}`, {
          signal: controller.signal as any,
          agent: new https.Agent({
            lookup: (_hostname, _options, callback) => callback(null, ip, ip.includes(':') ? 6 : 4)
          }),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const html = await response.text();
        const headersObj: Record<string, string> = {};
        response.headers.forEach((value, key) => { headersObj[key.toLowerCase()] = value; });
        return TECH_SIGNATURES.filter((tech) => {
          const headerMatch = Object.entries(tech.headers).some(([key, pattern]) => pattern.test(headersObj[key.toLowerCase()] || ''));
          const htmlMatch = tech.html ? tech.html.test(html) : false;
          return headerMatch || htmlMatch;
        });
      } finally {
        clearTimeout(timeoutId);
      }
    });
    res.json(detected.map((tech) => ({ name: tech.name, category: tech.category })));
  } catch (err) {
    res.json([]);
  }
});

export default router;
