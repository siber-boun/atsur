import { Router } from 'express';
import { resolvePublic } from '../lib/ssrf';
import { isValidDomain } from '../lib/validate';
import { detectTechnologies, enrichUrlscanTechnologies } from '../lib/technology';
import { inspectTls } from '../lib/tls';
import { collectRenderEvidence, getCachedEvidence, putEvidence } from '../lib/evidence';
import { collectUrlscanEvidence } from '../lib/urlscan-evidence';

const router = Router();

router.get('/api/advanced', async (req, res) => {
  const subdomain = req.query.subdomain as string;
  if (!subdomain || !isValidDomain(subdomain)) return res.status(400).json({ error: 'Geçerli bir subdomain gerekli' });
  const resolved = await resolvePublic(subdomain);
  if (resolved.blocked) return res.json({ ssl: null, advanced: null, ...(resolved.reason === 'private-ip' ? { blocked: 'private-ip' } : {}) });
  const ip = resolved.ips[0];
  const sslInfo = await inspectTls(subdomain, ip);
  let evidence = getCachedEvidence(subdomain);
  if (!evidence) {
    const renderEvidence = await collectRenderEvidence('https:', subdomain, 443, ip);
    evidence = renderEvidence.ok ? renderEvidence : undefined;
    if (!evidence) {
      const urlscanEvidence = await collectUrlscanEvidence('https:', subdomain, 443);
      if (urlscanEvidence.evidence?.ok) evidence = putEvidence(urlscanEvidence.evidence);
    }
  }
  const sharedEdge = Boolean(evidence?.waf?.detected && /cloudflare|fastly|akamai/i.test(evidence.waf.name || ''));
  const technologies = await detectTechnologies(subdomain, { sharedEdge, skipLiveFetch: true, ...(evidence?.technologies ? { live: evidence.technologies } : {}) });
  const urlscanTechnologies = await enrichUrlscanTechnologies(subdomain);
  res.json({
    ssl: sslInfo,
    advanced: evidence ? { security: evidence.security, waf: evidence.waf, cookies: evidence.cookies } : null,
    technologies: [...technologies, ...urlscanTechnologies],
    ...(evidence ? { evidence: { source: evidence.source, redirected: evidence.redirects.length > 0, finalTarget: evidence.finalTarget, externalRedirect: evidence.externalRedirect } } : {}),
    ...(!sslInfo && evidence?.tlsVerified ? { tlsVerification: { verified: true, source: evidence.source } } : {})
  });
});

export default router;
