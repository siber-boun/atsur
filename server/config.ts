export const PORT = process.env.PORT || 3001;

// Tek port envanteri TCP taraması ve HTTP evidence katmanı tarafından paylaşılır.
export { PORT_TARGETS } from '../shared/scanPorts';

const num = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const LIMITS = {
  socket: num(process.env.POOL_SOCKET, 60),
  portsPerHost: num(process.env.POOL_PORTS, 8),
  dns: num(process.env.POOL_DNS, 40),
  http: num(process.env.POOL_HTTP, 25),
  tech: num(process.env.POOL_TECH, 3),
  source: num(process.env.POOL_SOURCE, 4),
  maxInFlight: num(process.env.MAX_INFLIGHT, 40)
};

export const DNS_RESOLVERS = (process.env.DNS_RESOLVERS || '1.1.1.1,8.8.8.8')
  .split(',')
  .map((resolver) => resolver.trim())
  .filter(Boolean);
export const DNS_TIMEOUT_MS = num(process.env.DNS_TIMEOUT_MS, 3000);
export const DNS_CACHE_TTL_MS = num(process.env.DNS_CACHE_TTL_MS, 5 * 60 * 1000);
export const DNS_CACHE_MAX_ENTRIES = num(process.env.DNS_CACHE_MAX_ENTRIES, 5000);
export const SOURCE_TIMEOUT_MS = num(process.env.SOURCE_TIMEOUT_MS, 8000);
export const BRUTE_MAX_CANDIDATES = num(process.env.BRUTE_MAX_CANDIDATES, 2000);
export const SOURCE_KEYS: Record<string, string | undefined> = {
  OTX_API_KEY: process.env.OTX_API_KEY,
  SECURITYTRAILS_API_KEY: process.env.SECURITYTRAILS_API_KEY,
  VIRUSTOTAL_API_KEY: process.env.VIRUSTOTAL_API_KEY,
  CHAOS_API_KEY: process.env.CHAOS_API_KEY,
  SHODAN_API_KEY: process.env.SHODAN_API_KEY
};
