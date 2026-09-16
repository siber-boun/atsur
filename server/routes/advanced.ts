import { Router } from 'express';
import https from 'node:https';
import { detectWaf } from '../fingerprints/waf';
import { httpPool } from '../lib/pool';
import { resolvePublic } from '../lib/ssrf';
import { isValidDomain } from '../lib/validate';
import { detectTechnologies } from '../lib/technology';
import { inspectCookies } from '../lib/cookies';
import { CORS_PROBE_ORIGIN, inspectCors } from '../lib/cors';
import { inspectTls } from '../lib/tls';
import { getShodanPassiveAnalysis } from '../lib/shodan';

const router = Router();

router.get('/api/advanced', async (req, res) => {
  const subdomain = req.query.subdomain as string;
  if (!subdomain || !isValidDomain(subdomain)) return res.status(400).json({ error: 'Geçerli bir subdomain gerekli' });
  const resolved = await resolvePublic(subdomain);
  if (resolved.blocked) return res.json({ ssl: null, advanced: null, ...(resolved.reason === 'private-ip' ? { blocked: 'private-ip' } : {}) });
  const ip = resolved.ips[0];
  const sslInfo = await inspectTls(subdomain, ip);
  const headerWafInfo = await httpPool.run(() => new Promise<object | null>((resolve) => {
    const requestObj = https.request({ hostname: ip, port: 443, servername: subdomain, method: 'GET', timeout: 3500, rejectUnauthorized: false, headers: {
      Host: subdomain,
      Origin: CORS_PROBE_ORIGIN,
      Range: 'bytes=0-4095',
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8'
    } }, (response) => {
      const headers = response.headers;
      let score = 0;
      const missing: string[] = [];
      if (headers['strict-transport-security']) score += 20; else missing.push('HSTS');
      if (headers['content-security-policy']) score += 20; else missing.push('CSP');
      if (headers['x-frame-options']) score += 20; else missing.push('X-Frame-Options');
      if (headers['x-content-type-options']) score += 15; else missing.push('X-Content-Type-Options');
      if (headers['referrer-policy']) score += 15; else missing.push('Referrer-Policy');
      if (headers['permissions-policy']) score += 5; else missing.push('Permissions-Policy');
      if (headers['x-xss-protection']) score += 5; else missing.push('X-XSS-Protection');
      let grade = 'F';
      if (score >= 80) grade = 'A'; else if (score >= 60) grade = 'B'; else if (score >= 40) grade = 'C'; else if (score >= 20) grade = 'D';
      const waf = detectWaf(headers);
      const rawCookies = headers['set-cookie'];
      const cookies = inspectCookies(Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : []);
      const cors = inspectCors(headers);
      resolve({ security: { score, grade, missing }, waf: waf ? { detected: true, name: waf } : { detected: false }, cookies, cors });
      response.destroy();
    });
    requestObj.on('error', () => resolve(null));
    requestObj.on('timeout', () => { requestObj.destroy(); resolve(null); });
    requestObj.end();
  }));
  const passive = !sslInfo || !headerWafInfo ? await getShodanPassiveAnalysis(ip) : null;
  const effectiveSsl = sslInfo || passive?.ssl || null;
  const effectiveAdvanced = headerWafInfo || passive?.advanced || null;
  const sharedEdge = Boolean((effectiveAdvanced as any)?.waf?.detected && /cloudflare|fastly|akamai/i.test((effectiveAdvanced as any).waf.name || ''));
  const technologies = await detectTechnologies(subdomain, { sharedEdge });
  const usedFor = [!sslInfo && passive?.ssl ? 'ssl' : null, !headerWafInfo && passive?.advanced ? 'http-security' : null].filter(Boolean);
  res.json({
    ssl: effectiveSsl,
    advanced: effectiveAdvanced,
    technologies,
    ...(usedFor.length ? { passiveFallback: { source: 'shodan', usedFor, observedAt: passive?.observedAt } } : {})
  });
});

export default router;
