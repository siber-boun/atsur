export const PORT = process.env.PORT || 3001;

export type PortTransport = 'tcp' | 'udp';
export type WebProtocol = 'http:' | 'https:';

export interface PortTarget {
  port: number;
  service: string;
  transport: PortTransport;
  webProtocols?: WebProtocol[];
}

// Servis envanteri: genel web, yönetim paneli, VPN, kamera ve ERP portları.
// webProtocols bulunmayan hedeflerde yalnızca TCP/UDP erişilebilirliği kontrol edilir.
export const PORT_TARGETS: PortTarget[] = [
  { port: 80, service: 'HTTP', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 3000, service: 'Node.js / React / Grafana', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 3001, service: 'Node.js alternatif', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 4000, service: 'Geliştirme / API', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 5000, service: 'Flask / Synology / UPnP', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 7080, service: 'Alternatif HTTP', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 8000, service: 'Kamera yönetimi / HTTP', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 8008, service: 'Google Cast / HTTP', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 8080, service: 'Tomcat / Jenkins / Proxy', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 8081, service: 'İkincil web servisi', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 8082, service: 'Üçüncül web servisi', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 8083, service: 'Alternatif web / panel', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 8084, service: 'Alternatif web / panel', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 8090, service: 'Atlassian / yönetim paneli', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 8888, service: 'Jupyter / Proxy / Panel', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 9000, service: 'Portainer / SonarQube', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 9090, service: 'Cockpit / Prometheus', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 9200, service: 'Elasticsearch', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 443, service: 'HTTPS', transport: 'tcp', webProtocols: ['https:', 'http:'] },
  { port: 4443, service: 'Alternatif HTTPS / Oracle EBS', transport: 'tcp', webProtocols: ['https:', 'http:'] },
  { port: 7443, service: 'Yedek HTTPS / yönetim paneli', transport: 'tcp', webProtocols: ['https:', 'http:'] },
  { port: 8443, service: 'Tomcat SSL / Sophos SSL VPN', transport: 'tcp', webProtocols: ['https:', 'http:'] },
  { port: 8444, service: 'Alternatif HTTPS', transport: 'tcp', webProtocols: ['https:', 'http:'] },
  { port: 9443, service: 'VMware / yönetim paneli', transport: 'tcp', webProtocols: ['https:', 'http:'] },
  { port: 10443, service: 'Fortinet SSL VPN', transport: 'tcp', webProtocols: ['https:', 'http:'] },
  { port: 2082, service: 'cPanel', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 2083, service: 'cPanel SSL', transport: 'tcp', webProtocols: ['https:', 'http:'] },
  { port: 2086, service: 'WHM', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 2087, service: 'WHM SSL', transport: 'tcp', webProtocols: ['https:', 'http:'] },
  { port: 554, service: 'RTSP kamera akışı', transport: 'tcp' },
  { port: 37777, service: 'Dahua kamera / NVR', transport: 'tcp' },
  { port: 8931, service: 'Kamera WebSocket', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 7000, service: 'Oracle WebLogic', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 7001, service: 'Oracle WebLogic / EBS', transport: 'tcp', webProtocols: ['https:', 'http:'] },
  { port: 8181, service: 'Oracle HTTP Server', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 1433, service: 'Microsoft SQL Server', transport: 'tcp' },
  { port: 1434, service: 'SQL Server Browser', transport: 'udp' },
  { port: 1521, service: 'Oracle TNS Listener', transport: 'tcp' },
  { port: 1708, service: 'NetSuite SuiteAnalytics', transport: 'tcp' },
  { port: 3200, service: 'SAP Dispatcher', transport: 'tcp' },
  { port: 3300, service: 'SAP Gateway', transport: 'tcp' },
  { port: 3600, service: 'SAP Message Server', transport: 'tcp' },
  { port: 7047, service: 'Dynamics 365 BC SOAP', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 7048, service: 'Dynamics 365 BC OData', transport: 'tcp', webProtocols: ['http:', 'https:'] },
  { port: 7085, service: 'Dynamics 365 BC Client', transport: 'tcp' }
];

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
