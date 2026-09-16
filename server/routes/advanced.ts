import { Router } from 'express';
import { resolvePublic } from '../lib/ssrf';
import { isValidDomain } from '../lib/validate';
import { detectTechnologies } from '../lib/technology';
import { inspectTls } from '../lib/tls';
import { collectRenderEvidence, getCachedEvidence, putEvidence } from '../lib/evidence';
import { collectBrowserlessEvidenceResult } from '../lib/browserless';

const router = Router();

router.get('/api/advanced', async (req, res) => {
  const subdomain = req.query.subdomain as string;
  const browserVerified = req.query.browserVerified === '1';
  if (!subdomain || !isValidDomain(subdomain)) return res.status(400).json({ error: 'Geçerli bir subdomain gerekli' });
  const resolved = await resolvePublic(subdomain);
  if (resolved.blocked) return res.json({ ssl: null, advanced: null, ...(resolved.reason === 'private-ip' ? { blocked: 'private-ip' } : {}) });
  const ip = resolved.ips[0];
  const sslInfo = await inspectTls(subdomain, ip);
  let evidence = getCachedEvidence(subdomain);
  let browserlessError: string | undefined;
  if (!evidence) {
    const renderEvidence = await collectRenderEvidence('https:', subdomain, 443, ip);
    evidence = renderEvidence.ok ? renderEvidence : undefined;
    if (!evidence) {
      // Browserless yalnız kullanıcının tarayıcısı hedefe eriştiğini doğruladığı
      // anda çalışır. Genel advanced çağrıları dış tarayıcı trafiği üretmez.
      if (browserVerified) {
        const browserless = await collectBrowserlessEvidenceResult('https:', subdomain, 443);
        if (browserless.evidence?.ok) evidence = putEvidence(browserless.evidence);
        else browserlessError = browserless.code;
      }
    }
  }
  const sharedEdge = Boolean(evidence?.waf?.detected && /cloudflare|fastly|akamai/i.test(evidence.waf.name || ''));
  const technologies = await detectTechnologies(subdomain, { sharedEdge, skipLiveFetch: true, ...(evidence?.technologies ? { live: evidence.technologies } : {}) });
  res.json({
    ssl: sslInfo,
    advanced: evidence ? { security: evidence.security, waf: evidence.waf, cookies: evidence.cookies, responseHeaders: evidence.responseHeaders } : null,
    technologies,
    ...(evidence ? { evidence: { source: evidence.source, redirected: evidence.redirects.length > 0, finalTarget: evidence.finalTarget, externalRedirect: evidence.externalRedirect } } : {}),
    ...(!sslInfo && evidence?.tlsVerified ? { tlsVerification: { verified: true, source: evidence.source } } : {}),
    ...(browserlessError ? { browserlessError } : {})
  });
});

export default router;
