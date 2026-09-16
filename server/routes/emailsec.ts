import { Router } from 'express';
import dns from 'node:dns';
import https from 'node:https';
import { parseDmarc } from '../lib/dmarc';
import { httpPool } from '../lib/pool';
import { resolvePublic } from '../lib/ssrf';
import { evaluateSpf } from '../lib/spf';
import { isValidDomain } from '../lib/validate';

const router = Router();

const txt = async (host: string): Promise<string[]> => {
  try { return (await dns.promises.resolveTxt(host)).map((record) => record.join('')); } catch { return []; }
};

async function getDnssec(domain: string): Promise<boolean | null> {
  try {
    return await httpPool.run(async () => {
      const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`, {
        headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return null;
      const result = await response.json() as { AD?: boolean };
      return typeof result.AD === 'boolean' ? result.AD : null;
    });
  } catch { return null; }
}

async function getMtaSts(domain: string): Promise<{ hasRecord: boolean; mode?: 'enforce' | 'testing' | 'none'; policyFetched: boolean }> {
  const records = await txt(`_mta-sts.${domain}`);
  const hasRecord = records.some((record) => /^\s*v\s*=\s*STSv1\b/i.test(record));
  if (!hasRecord) return { hasRecord: false, policyFetched: false };
  const host = `mta-sts.${domain}`;
  const resolved = await resolvePublic(host);
  if (resolved.blocked) return { hasRecord: true, policyFetched: false };
  return httpPool.run(() => new Promise((resolve) => {
    let body = '';
    let settled = false;
    const finish = (value: { hasRecord: boolean; mode?: 'enforce' | 'testing' | 'none'; policyFetched: boolean }) => {
      if (!settled) { settled = true; resolve(value); }
    };
    const request = https.request({ hostname: resolved.ips[0], port: 443, servername: host, method: 'GET', timeout: 5000, headers: { Host: host, Accept: 'text/plain' } }, (response) => {
      if (response.statusCode !== 200) { response.destroy(); return finish({ hasRecord: true, policyFetched: false }); }
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
        if (body.length > 16_384) response.destroy();
      });
      response.once('end', () => {
        const mode = body.match(/^\s*mode\s*:\s*(enforce|testing|none)\s*$/im)?.[1] as 'enforce' | 'testing' | 'none' | undefined;
        finish({ hasRecord: true, mode, policyFetched: true });
      });
      response.once('error', () => finish({ hasRecord: true, policyFetched: false }));
      response.once('close', () => {
        if (body.length > 16_384) finish({ hasRecord: true, policyFetched: false });
      });
    });
    request.once('error', () => finish({ hasRecord: true, policyFetched: false }));
    request.once('timeout', () => { request.destroy(); finish({ hasRecord: true, policyFetched: false }); });
    request.end();
  }));
}

router.get('/api/email-sec', async (req, res) => {
  const domain = req.query.domain as string;
  if (!domain || !isValidDomain(domain)) return res.status(400).json({ error: 'Geçerli bir domain gerekli' });

  const [spf, dmarcRecords, dkim, dnssec, mtaSts, tlsRptRecords, caaRecords] = await Promise.all([
    evaluateSpf(domain),
    txt(`_dmarc.${domain}`),
    (async () => {
      for (const selector of ['default', 'google', 'mail', 'selector1']) {
        if ((await txt(`${selector}._domainkey.${domain}`)).length) return { hasRecord: true };
      }
      return { hasRecord: false };
    })(),
    getDnssec(domain),
    getMtaSts(domain),
    txt(`_smtp._tls.${domain}`),
    dns.promises.resolveCaa(domain).catch(() => [])
  ]);
  const dmarc = parseDmarc(dmarcRecords);
  const tlsRpt = { hasRecord: tlsRptRecords.some((record) => /^\s*v\s*=\s*TLSRPTv1\b/i.test(record)) };
  const caa = { hasRecord: caaRecords.length > 0, issuers: caaRecords.flatMap((record) => [record.issue, record.issuewild].filter((value): value is string => Boolean(value))) };

  let score = 0;
  if (spf.hasRecord) score += 15;
  if (spf.all === '-all') score += 15; else if (spf.all === '~all') score += 8;
  if (spf.hasRecord && !spf.permerror) score += 10;
  if (dmarc.hasRecord) score += 15;
  if (dmarc.policy === 'reject') score += dmarc.percentage !== undefined && dmarc.percentage < 100 ? 7 : 15;
  else if (dmarc.policy === 'quarantine') score += 10;
  if (dmarc.aggregateReports) score += 5;
  if (dkim.hasRecord) score += 10;
  if (dnssec) score += 5;
  if (mtaSts.mode === 'enforce') score += 5;
  if (tlsRpt.hasRecord) score += 5;
  let grade = 'F';
  if (score >= 80) grade = 'A'; else if (score >= 60) grade = 'B'; else if (score >= 40) grade = 'C'; else if (score >= 20) grade = 'D';
  // hasMinusAll eski istemcilerin sözleşmesidir; ayrıntılı `all` alanı bunun yerini alır.
  res.json({ spf: { ...spf, hasMinusAll: spf.all === '-all' }, dmarc, dkim, dnssec, mtaSts, tlsRpt, caa, score, grade });
});

export default router;
