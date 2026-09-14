import { Router } from 'express';
import { getFetch } from '../lib/http';
import { isValidDomain } from '../lib/validate';

const router = Router();

router.get('/api/crt', async (req, res) => {
  const domain = req.query.q as string;
  if (!domain || !isValidDomain(domain)) return res.status(400).json({ error: 'Geçerli bir domain parametresi (q) gerekli' });
  try {
    const fetch = await getFetch();
    const response = await fetch(`https://crt.sh/?q=${domain}&output=json`);
    if (!response.ok) throw new Error(`crt.sh responded with status ${response.status}`);
    res.json(await response.json());
  } catch (error) {
    console.error('crt.sh proxy error:', error);
    res.status(500).json({ error: "crt.sh API'sine erişilemedi." });
  }
});

export default router;
