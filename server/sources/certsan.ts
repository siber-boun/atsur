import tls from 'node:tls';
import { httpPool } from '../lib/pool';
import { resolvePublic } from '../lib/ssrf';
import type { SubdomainSource } from './types';

const certsan: SubdomainSource = {
  id: 'certsan',
  label: 'TLS Certificate SAN',
  async fetch(domain, context) {
    const resolved = await resolvePublic(domain);
    const ip = resolved.ips[0];
    if (resolved.blocked || !ip) return [];
    const san = await httpPool.run(() => new Promise<string>((resolve, reject) => {
      const socket = tls.connect(443, ip, { servername: domain, rejectUnauthorized: false }, () => {
        const certificate = socket.getPeerCertificate();
        socket.destroy();
        resolve(certificate?.subjectaltname || '');
      });
      const abort = () => { socket.destroy(); reject(new Error('TLS certificate timeout')); };
      context.signal.addEventListener('abort', abort, { once: true });
      socket.once('error', reject);
      socket.setTimeout(5000, abort);
    }));
    return san.split(',').flatMap((entry) => {
      const match = entry.trim().match(/^DNS:(.+)$/i);
      return match ? [{ subdomain: match[1] }] : [];
    });
  }
};

export default certsan;
