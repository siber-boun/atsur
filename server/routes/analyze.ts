import { Router } from 'express';
import { LIMITS, PORT_TARGETS } from '../config';
import { checkHttp, checkPort, checkSqlBrowser } from '../lib/net';
import { createPool } from '../lib/pool';
import { isValidDomain } from '../lib/validate';
import { resolvePublic } from '../lib/ssrf';
import type { PortResult } from '../types';

const router = Router();

router.get('/api/analyze', async (req, res) => {
  const domain = req.query.domain as string;
  if (!domain || !isValidDomain(domain)) return res.status(400).json({ error: 'Geçerli bir domain parametresi gerekli' });
  const resolved = await resolvePublic(domain);
  const ip = resolved.ips[0] || null;
  if (resolved.blocked) return res.json({ ip: null, ports: [], isCloudflare: false, ...(resolved.reason === 'private-ip' ? { blocked: 'private-ip' } : {}) });
  const activePorts: PortResult[] = [];
  if (ip) {
    const portsPerHostPool = createPool(LIMITS.portsPerHost);
    const portChecks = PORT_TARGETS.map(async (target) => {
      const isOpen = await portsPerHostPool.run(() => target.transport === 'udp'
        ? checkSqlBrowser(ip)
        : checkPort(target.port, ip));
      if (isOpen) {
        let status: number | string = target.transport === 'udp' ? 'UDP Yanıtı' : 'TCP Açık';
        let isCloudflare = false;
        let finalProtocol = target.transport === 'udp' ? 'udp:' : 'tcp:';
        for (const protocol of target.webProtocols || []) {
          try {
            const result = await checkHttp(protocol, domain, target.port, ip);
            status = result.status;
            isCloudflare = result.isCloudflare;
            finalProtocol = result.protocolUsed;
            break;
          } catch {
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
          isWeb: finalProtocol === 'http:' || finalProtocol === 'https:'
        });
      }
    });
    await Promise.all(portChecks);
  }
  activePorts.sort((a, b) => a.port - b.port);
  res.json({ ip, ports: activePorts, isCloudflare: activePorts.some((port) => port.isCloudflare) });
});

export default router;
