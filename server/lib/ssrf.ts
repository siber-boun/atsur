import dns from 'node:dns';
import { dnsPool } from './pool';

const isPrivateIpv4 = (ip: string): boolean => {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  return a >= 224;
};

export const isPrivateIp = (ip: string): boolean => {
  if (!ip.includes(':')) return isPrivateIpv4(ip);
  const low = ip.toLowerCase();
  if (low === '::' || low === '::1') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(low) || /^fe[89ab]/.test(low)) return true;
  const mapped = low.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIpv4(mapped[1]) : false;
};

export async function resolvePublic(host: string): Promise<{ ips: string[]; blocked: boolean; reason?: 'private-ip' | 'no-record' }> {
  try {
    const [v4, v6] = await Promise.all([
      dnsPool.run(() => dns.promises.resolve4(host)).catch(() => []),
      dnsPool.run(() => dns.promises.resolve6(host)).catch(() => [])
    ]);
    const all = [...v4, ...v6];
    if (all.length === 0) return { ips: [], blocked: true, reason: 'no-record' };
    const ips = all.filter((ip) => !isPrivateIp(ip));
    if (ips.length === 0) return { ips: [], blocked: true, reason: 'private-ip' };
    return { ips, blocked: false };
  } catch { return { ips: [], blocked: true, reason: 'no-record' }; }
}

export async function getPublicHostIp(domain: string): Promise<string | null> {
  const result = await resolvePublic(domain);
  return result.blocked ? null : result.ips[0] || null;
}
