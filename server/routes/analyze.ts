import { Router } from 'express';
import { HTTP_HTTPS_PORTS, HTTPS_PORTS, LIMITS } from '../config';
import { checkHttp, checkPort } from '../lib/net';
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
    const portChecks = HTTP_HTTPS_PORTS.map(async (port) => {
      const isOpen = await portsPerHostPool.run(() => checkPort(port, ip));
      if (isOpen) {
        let status: number | string = 'Açık (Yanıt Yok)';
        let isCloudflare = false;
        const isHttps = HTTPS_PORTS.includes(port);
        let finalProtocol = isHttps ? 'https:' : 'http:';
        try {
          const result = await checkHttp(isHttps ? 'https:' : 'http:', domain, port, ip);
          status = result.status; isCloudflare = result.isCloudflare; finalProtocol = result.protocolUsed;
        } catch (e: any) {
          if (isHttps) {
            try {
              const result = await checkHttp('http:', domain, port, ip);
              status = result.status; isCloudflare = result.isCloudflare; finalProtocol = result.protocolUsed;
            } catch (e2: any) {}
          } else {
            try {
              const result = await checkHttp('https:', domain, port, ip);
              status = result.status; isCloudflare = result.isCloudflare; finalProtocol = result.protocolUsed;
            } catch (e2: any) {}
          }
        }
        activePorts.push({ port, status, isCloudflare, protocol: finalProtocol });
      }
    });
    await Promise.all(portChecks);
  }
  activePorts.sort((a, b) => a.port - b.port);
  const filteredPorts = activePorts.filter((port) => port.status !== 'Açık (Yanıt Yok)');
  res.json({ ip, ports: filteredPorts, isCloudflare: filteredPorts.some((port) => port.isCloudflare) });
});

export default router;
