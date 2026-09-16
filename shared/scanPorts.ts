export type PortTransport = 'tcp' | 'udp';
export type WebProtocol = 'http:' | 'https:';

export interface PortTarget {
  port: number;
  service: string;
  transport: PortTransport;
  webProtocols?: WebProtocol[];
}

// Tek tarama grubu: Render taraması ve Cloudflare Worker bu listeyi paylaşır.
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

export const isHttpsWebPort = (port: number) => Boolean(
  PORT_TARGETS.find((target) => target.port === port)?.webProtocols?.includes('https:')
);
