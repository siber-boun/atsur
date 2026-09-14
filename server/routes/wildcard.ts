import { Router } from 'express';
import { isValidDomain } from '../lib/validate';
import { detectWildcard } from '../lib/wildcard';

const router = Router();

router.get('/api/wildcard', async (req, res) => {
  const domain = req.query.domain as string;
  if (!domain || !isValidDomain(domain)) return res.status(400).json({ error: 'Geçerli bir domain parametresi gerekli' });
  try {
    res.json(await detectWildcard(domain.toLowerCase()));
  } catch (error) {
    console.error('Wildcard tespit hatası:', error);
    res.status(500).json({ error: 'Wildcard tespiti sırasında hata oluştu.' });
  }
});

export default router;
