export const PORT = process.env.PORT || 3001;

export const HTTP_HTTPS_PORTS = [
  80, 8080, 8000, 8008, 8888, 8081, 8082, 8083, 8084, 8090,
  443, 8443, 8444, 9443, 4443,
  3000, 3001, 4000, 5000, 9000, 9090, 9200, 7080, 7443
];

export const HTTPS_PORTS = [443, 8443, 8444, 9443, 4443, 7443];

const num = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const LIMITS = {
  socket: num(process.env.POOL_SOCKET, 60),
  portsPerHost: num(process.env.POOL_PORTS, 8),
  dns: num(process.env.POOL_DNS, 40),
  http: num(process.env.POOL_HTTP, 25),
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
export const SOURCE_KEYS: Record<string, string | undefined> = {
  OTX_API_KEY: process.env.OTX_API_KEY,
  SECURITYTRAILS_API_KEY: process.env.SECURITYTRAILS_API_KEY,
  VIRUSTOTAL_API_KEY: process.env.VIRUSTOTAL_API_KEY,
  CHAOS_API_KEY: process.env.CHAOS_API_KEY,
  SHODAN_API_KEY: process.env.SHODAN_API_KEY
};
