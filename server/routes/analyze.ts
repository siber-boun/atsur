import { Router } from 'express';
import { LIMITS, PORT_TARGETS } from '../config';
import { checkHttp, checkPort, checkSqlBrowser } from '../lib/net';
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
      let verificationSource: 'render' | undefined;
      // TCP taraması application-layer probe'dan önce çalışır. HTTP(S) yalnız
      // açık ve web-adayı portlarda denenir; SQL/RTSP gibi servislere GET atılmaz.
      const isOpen = await portsPerHostPool.run(() => target.transport === 'udp'
        ? checkSqlBrowser(ip)
        : checkPort(target.port, ip));
      if (isOpen) {
        for (const protocol of target.webProtocols || []) {
          try {
            const result = await checkHttp(protocol, domain, target.port, ip);
            status = result.status;
            isCloudflare = result.isCloudflare;
            finalProtocol = result.protocolUsed;
            verificationSource = 'render';
            break;
          } catch (error) {
            probeErrors.push({ port: target.port, protocol, code: errorCode(error) });
            // Açık TCP portu HTTP yanıtı vermese bile servis envanterinde tutulur.
          }
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
          ...(verificationSource ? { verificationSource } : {})
        });
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
