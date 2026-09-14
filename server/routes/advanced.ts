import { Router } from 'express';
import https from 'node:https';
import tls from 'node:tls';
import { detectWaf } from '../fingerprints/waf';
import { httpPool } from '../lib/pool';
import { resolvePublic } from '../lib/ssrf';
import { isValidDomain } from '../lib/validate';

const router = Router();

router.get('/api/advanced', async (req, res) => {
  const subdomain = req.query.subdomain as string;
  if (!subdomain || !isValidDomain(subdomain)) return res.status(400).json({ error: 'Geçerli bir subdomain gerekli' });
  const resolved = await resolvePublic(subdomain);
  if (resolved.blocked) return res.json({ ssl: null, advanced: null, ...(resolved.reason === 'private-ip' ? { blocked: 'private-ip' } : {}) });
  const ip = resolved.ips[0];
  const sslInfo = await httpPool.run(() => new Promise<object | null>((resolve) => {
    const socket = tls.connect(443, ip, { servername: subdomain, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.destroy();
      if (!cert || Object.keys(cert).length === 0) return resolve(null);
      const daysLeft = Math.floor((new Date(cert.valid_to).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      let grade = 'F';
      if (daysLeft >= 30) grade = 'A'; else if (daysLeft >= 7) grade = 'B'; else if (daysLeft >= 0) grade = 'C';
      const isSelfSigned = cert.issuer?.CN === cert.subject?.CN;
      if (isSelfSigned) grade = 'F';
      resolve({ valid: daysLeft >= 0 && !isSelfSigned, daysLeft, issuer: cert.issuer?.O || cert.issuer?.CN || 'Bilinmiyor', isSelfSigned, grade });
    });
    socket.on('error', () => resolve(null));
    socket.setTimeout(3000, () => { socket.destroy(); resolve(null); });
  }));
  const headerWafInfo = await httpPool.run(() => new Promise<object | null>((resolve) => {
    const requestObj = https.request({ hostname: ip, port: 443, servername: subdomain, method: 'HEAD', timeout: 3500, rejectUnauthorized: false, headers: { Host: subdomain } }, (response) => {
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
      resolve({ security: { score, grade, missing }, waf: waf ? { detected: true, name: waf } : { detected: false } });
    });
    requestObj.on('error', () => resolve(null));
    requestObj.on('timeout', () => { requestObj.destroy(); resolve(null); });
    requestObj.end();
  }));
  res.json({ ssl: sslInfo, advanced: headerWafInfo });
});

export default router;
