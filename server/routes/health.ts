import { Router } from 'express';
import { httpPool, socketPool, dnsPool } from '../lib/pool';

const router = Router();
router.get('/health', (req, res) => res.json({
  status: 'ok',
  pools: {
    socket: `${socketPool.inFlight()}/${socketPool.limit}`,
    dns: `${dnsPool.inFlight()}/${dnsPool.limit}`,
    http: `${httpPool.inFlight()}/${httpPool.limit}`
  },
  inFlight: res.locals.inFlight
}));

export default router;
