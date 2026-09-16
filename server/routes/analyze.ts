import { Router } from 'express';
import { LIMITS, PORT_TARGETS } from '../config';
import { checkHttp, checkPort, checkSqlBrowser } from '../lib/net';
import { collectBrowserlessEvidenceResult } from '../lib/browserless';
import { putEvidence } from '../lib/evidence';
import { createPool } from '../lib/pool';
import { isValidDomain } from '../lib/validate';
import { resolvePublic } from '../lib/ssrf';
import type { PortResult, ProbeError } from '../types';

const router = Router();

const errorCode = (error: unknown): string => {
  if (error && typeof error === 'object' && 'code' in error) return String(error.code);
  return error instanceof Error ? error.name : 'UNKNOWN';
};

router.get('/api/analyze', async (req, res) => {
  const domain = req.query.domain as string;
  if (!domain || !isValidDomain(domain)) return res.status(400).json({ error: 'Geçerli bir domain parametresi gerekli' });
  const resolved = await resolvePublic(domain);
  const ip = resolved.ips[0] || null;
  if (resolved.blocked) return res.json({ ip: null, ports: [], isCloudflare: false, ...(resolved.reason === 'private-ip' ? { blocked: 'private-ip' } : {}) });
  const activePorts: PortResult[] = [];
  const probeErrors: ProbeError[] = [];
  if (ip) {
    const portsPerHostPool = createPool(LIMITS.portsPerHost);
    const portChecks = PORT_TARGETS.map(async (target) => {
      let status: number | string = target.transport === 'udp' ? 'UDP Yanıtı' : 'TCP Açık';
      let isCloudflare = false;
      let finalProtocol = target.transport === 'udp' ? 'udp:' : 'tcp:';
      let verificationSource: 'render' | 'browserless' | undefined;
      let redirected = false;
      let finalHost: string | undefined;
      // TCP taraması application-layer probe'dan önce çalışır. HTTP(S) yalnız
      // açık ve web-adayı portlarda denenir; SQL/RTSP gibi servislere GET atılmaz.
      let isOpen = await portsPerHostPool.run(() => target.transport === 'udp'
        ? checkSqlBrowser(ip)
        : checkPort(target.port, ip));
      const tryBrowserless = async (): Promise<{ verified: boolean; code?: string }> => {
        let code: string | undefined;
        for (const protocol of target.webProtocols || []) {
          const browserlessResult = await collectBrowserlessEvidenceResult(protocol, domain, target.port);
          const browserlessEvidence = browserlessResult.evidence;
          if (browserlessEvidence?.ok) {
            putEvidence(browserlessEvidence);
            status = browserlessEvidence.status || 'Tarayıcı doğruladı';
            isCloudflare = browserlessEvidence.waf?.name === 'Cloudflare' || /cloudflare/i.test(browserlessEvidence.server || '');
            finalProtocol = browserlessEvidence.protocol;
            verificationSource = 'browserless';
            redirected = browserlessEvidence.redirects.length > 0;
            finalHost = browserlessEvidence.externalRedirect?.target || browserlessEvidence.finalTarget;
            return { verified: true };
          }
          code = browserlessResult.code || code;
        }
        return { verified: false, ...(code ? { code } : {}) };
      };
      if (isOpen) {
        let webResponded = false;
        for (const protocol of target.webProtocols || []) {
          try {
            const result = await checkHttp(protocol, domain, target.port, ip);
            status = result.status;
            isCloudflare = result.isCloudflare;
            finalProtocol = result.protocolUsed;
            verificationSource = 'render';
            webResponded = true;
            break;
          } catch (error) {
            probeErrors.push({ port: target.port, protocol, code: errorCode(error) });
            // Açık TCP portu HTTP yanıtı vermese bile servis envanterinde tutulur.
          }
        }
        // Browserless yalnız Render gerçek bir HTTP yanıt üretemediğinde devreye
        // girer. Browserless yoksa veya başarısızsa açık TCP hizmeti korunur.
        if (!webResponded && target.webProtocols?.length) {
          const browserless = await tryBrowserless();
          webResponded = browserless.verified;
          if (!webResponded && browserless.code) probeErrors.push({ port: target.port, protocol: target.webProtocols[0], code: browserless.code });
        }
        activePorts.push({
          port: target.port,
          status,
          isCloudflare,
          protocol: finalProtocol,
          transport: target.transport,
          service: target.service,
          isWeb: finalProtocol === 'http:' || finalProtocol === 'https:',
          isWebCandidate: Boolean(target.webProtocols?.length),
          ...(verificationSource ? { verificationSource } : {}),
          ...(redirected ? { redirected } : {}),
          ...(finalHost ? { finalHost } : {})
        });
      } else if ((target.port === 80 || target.port === 443) && target.webProtocols?.length) {
        // Render'ın egress ağında TCP SYN/CONNECT başarısız görünse bile bu iki
        // birincil web portu Browserless üzerinden canlı olarak doğrulanabilir.
        // Diğer tüm portlar TCP-first davranışını aynen korur.
        const browserless = await tryBrowserless();
        if (browserless.verified) {
          isOpen = true;
          activePorts.push({
            port: target.port,
            status,
            isCloudflare,
            protocol: finalProtocol,
            transport: target.transport,
            service: target.service,
            isWeb: true,
            isWebCandidate: true,
            verificationSource: 'browserless',
            ...(redirected ? { redirected } : {}),
            ...(finalHost ? { finalHost } : {})
          });
        } else if (browserless.code) {
          probeErrors.push({ port: target.port, protocol: target.webProtocols[0], code: browserless.code });
        }
      }
    });
    await Promise.all(portChecks);
  }
  activePorts.sort((a, b) => a.port - b.port);
  res.json({
    ip,
    ports: activePorts,
    isCloudflare: activePorts.some((port) => port.isCloudflare),
    ...(probeErrors.length ? { probeErrors } : {})
  });
});

export default router;
