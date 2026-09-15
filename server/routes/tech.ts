import { Router } from 'express';
import { detectTechnologies } from '../lib/technology';
import { isValidDomain } from '../lib/validate';

const router = Router();

router.get('/api/tech', async (req, res) => {
  const subdomain = req.query.subdomain as string;
  if (!subdomain || !isValidDomain(subdomain)) return res.status(400).json({ error: 'Geçerli bir subdomain gerekli' });
  try {
    res.json(await detectTechnologies(subdomain));
  } catch (err) {
    res.json([]);
  }
});

export default router;
