import { Router } from 'express';
import { getSourceStatuses } from '../sources';

const router = Router();
router.get('/api/sources', (_req, res) => res.json(getSourceStatuses()));

export default router;
