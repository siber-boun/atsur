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
