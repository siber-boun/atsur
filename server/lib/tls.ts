import tls from 'node:tls';
import { httpPool } from './pool';

export interface SslInfo {
  valid: boolean;
  daysLeft: number;
  issuer: string;
  isSelfSigned: boolean;
  grade: string;
  protocol?: string;
  cipher?: { name: string; version: string; weak: boolean };
  legacyProtocols?: { tls10: 'yes' | 'no' | 'unknown'; tls11: 'yes' | 'no' | 'unknown' };
  chain?: { subject: string; issuer: string }[];
  chainComplete?: boolean;
  san?: string[];
  hostnameMatch?: boolean;
}

const weakCipher = (name: string) => /(?:RC4|3DES|DES-CBC3|CBC.*SHA(?:$|1)|NULL|EXPORT)/i.test(name);
const label = (value: tls.Certificate | undefined) => {
  const preferred = value?.CN || value?.O;
  if (typeof preferred === 'string') return preferred;
  return Object.entries(value || {}).map(([key, entry]) => `${key}=${Array.isArray(entry) ? entry.join(',') : entry}`).join(', ') || 'Bilinmiyor';
};

function legacyProbe(ip: string, host: string, version: 'TLSv1' | 'TLSv1.1'): Promise<'yes' | 'unknown'> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: 'yes' | 'unknown') => { if (!settled) { settled = true; resolve(result); } };
    const socket = tls.connect({ host: ip, port: 443, servername: host, rejectUnauthorized: false, minVersion: version, maxVersion: version, ciphers: 'DEFAULT:@SECLEVEL=0' }, () => {
      socket.destroy(); finish('yes');
    });
    socket.once('error', () => finish('unknown'));
    socket.setTimeout(3000, () => { socket.destroy(); finish('unknown'); });
  });
}

export async function inspectTls(host: string, ip: string): Promise<SslInfo | null> {
  return httpPool.run(() => new Promise<SslInfo | null>((resolve) => {
    let settled = false;
    const finish = (result: SslInfo | null) => { if (!settled) { settled = true; resolve(result); } };
    const socket = tls.connect({ host: ip, port: 443, servername: host, rejectUnauthorized: false }, async () => {
      try {
        const cert = socket.getPeerCertificate(true) as tls.PeerCertificate & { issuerCertificate?: tls.PeerCertificate };
        const cipher = socket.getCipher();
        const daysLeft = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000);
        const isSelfSigned = cert.issuer?.CN === cert.subject?.CN;
        const chain: { subject: string; issuer: string }[] = [];
        const seen = new Set<object>();
        let current: (tls.PeerCertificate & { issuerCertificate?: tls.PeerCertificate }) | undefined = cert;
        let chainComplete = false;
        while (current && Object.keys(current).length && !seen.has(current)) {
          seen.add(current);
          chain.push({ subject: label(current.subject), issuer: label(current.issuer) });
          if (current === current.issuerCertificate || current.subject?.CN === current.issuer?.CN) { chainComplete = true; break; }
          current = current.issuerCertificate as (tls.PeerCertificate & { issuerCertificate?: tls.PeerCertificate }) | undefined;
        }
        const protocol = socket.getProtocol() || undefined;
        socket.destroy();
        const hostnameMatch = !tls.checkServerIdentity(host, cert);
        const [tls10, tls11] = await Promise.all([legacyProbe(ip, host, 'TLSv1'), legacyProbe(ip, host, 'TLSv1.1')]);
        const cipherName = cipher?.name || 'Bilinmiyor';
        const cipherIsWeak = weakCipher(cipherName);
        let grade = daysLeft >= 30 ? 'A' : daysLeft >= 7 ? 'B' : daysLeft >= 0 ? 'C' : 'F';
        if (isSelfSigned) grade = 'F';
        else if (tls10 === 'yes' || tls11 === 'yes') grade = ['D', 'E', 'F'].includes(grade) ? grade : 'D';
        else if (cipherIsWeak || !hostnameMatch || !chainComplete) grade = ['A', 'B'].includes(grade) ? 'C' : grade;
        finish({ valid: daysLeft >= 0 && !isSelfSigned, daysLeft, issuer: label(cert.issuer), isSelfSigned, grade, protocol, cipher: { name: cipherName, version: cipher?.version || '', weak: cipherIsWeak }, legacyProtocols: { tls10, tls11 }, chain, chainComplete, san: cert.subjectaltname?.split(', ').map((entry) => entry.replace(/^DNS:/, '')) || [], hostnameMatch });
      } catch { socket.destroy(); finish(null); }
    });
    socket.once('error', () => finish(null));
    socket.setTimeout(5000, () => { socket.destroy(); finish(null); });
  }));
}
