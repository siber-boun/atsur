import { Router } from 'express';
import dns from 'node:dns';
import { isValidDomain } from '../lib/validate';

const router = Router();

router.get('/api/email-sec', async (req, res) => {
  const domain = req.query.domain as string;
  if (!domain || !isValidDomain(domain)) return res.status(400).json({ error: 'Geçerli bir domain gerekli' });
  const spf = { hasRecord: false, hasMinusAll: false };
  const dmarc = { hasRecord: false, policy: 'none' };
  const dkim = { hasRecord: false };
  try {
    const records = await dns.promises.resolveTxt(domain);
    for (const record of records) {
      const text = record.join('');
      if (text.includes('v=spf1')) { spf.hasRecord = true; if (text.includes('-all')) spf.hasMinusAll = true; }
    }
  } catch (e) {}
  try {
    const records = await dns.promises.resolveTxt(`_dmarc.${domain}`);
    for (const record of records) {
      const text = record.join('');
      if (text.includes('v=DMARC1')) {
        dmarc.hasRecord = true;
        if (text.includes('p=reject')) dmarc.policy = 'reject';
        else if (text.includes('p=quarantine')) dmarc.policy = 'quarantine';
        else dmarc.policy = 'none';
      }
    }
  } catch (e) {}
  for (const selector of ['default', 'google', 'mail', 'selector1']) {
    try {
      const records = await dns.promises.resolveTxt(`${selector}._domainkey.${domain}`);
      if (records && records.length > 0) { dkim.hasRecord = true; break; }
    } catch (e) {}
  }
  let score = 0;
  if (spf.hasRecord) score += 20;
  if (spf.hasMinusAll) score += 20;
  if (dmarc.hasRecord) score += 20;
  if (dmarc.policy === 'reject' || dmarc.policy === 'quarantine') score += 20;
  if (dkim.hasRecord) score += 20;
  let grade = 'F';
  if (score >= 80) grade = 'A'; else if (score >= 60) grade = 'B'; else if (score >= 40) grade = 'C'; else if (score >= 20) grade = 'D';
  res.json({ spf, dmarc, dkim, score, grade });
});

export default router;
