import type { EmailSecurityInfo, PortInfo, ScanMeta, SubdomainData, SubdomainDetail, TechInfo } from '../types';
import { deriveFindings, findingsByHost, outdatedLabel, riskScore, type Finding } from './findings';

export type AssetStatus = 'live' | 'dead' | 'private' | 'error' | 'unknown' | 'wildcard';

export interface AssetRow {
  name: string;
  record: SubdomainData;
  detail?: SubdomainDetail;
  status: AssetStatus;
  ip?: string;
  ports: PortInfo[];
  /** Kanıt ya da servis taramasından gelen ana HTTP yanıtı. */
  http?: { status: number; protocol?: string };
  tlsGrade?: string;
  headerGrade?: string;
  headerScore?: number;
  wafName?: string;
  wafDetected?: boolean;
  technologies: TechInfo[];
  sources: string[];
  findings: Finding[];
  risk: number;
  busy: boolean;
}

export interface TechSummary {
  key: string;
  name: string;
  category: string;
  versions: string[];
  hosts: string[];
  outdated: boolean;
}

export interface Workspace {
  domain: string;
  rows: AssetRow[];
  findings: Finding[];
  technologies: TechSummary[];
  stats: {
    total: number;
    live: number;
    unknown: number;
    dead: number;
    webServices: number;
    openPorts: number;
    analyzed: number;
    headerAverage: number | null;
    validTls: number;
    waf: number;
  };
  email?: EmailSecurityInfo;
  meta?: ScanMeta;
}

function rowStatus(record: SubdomainData): AssetStatus {
  if (record.wildcardMatch) return 'wildcard';
  return record.status || 'unknown';
}

function primaryHttp(detail?: SubdomainDetail): AssetRow['http'] {
  if (detail?.evidence?.status !== undefined) return { status: detail.evidence.status, protocol: detail.evidence.protocol };
  const http = (detail?.ports || []).filter(port => typeof port.status === 'number' && (port.protocol === 'http:' || port.protocol === 'https:'));
  const preferred = http.find(port => port.protocol === 'https:') || http[0];
  return preferred ? { status: preferred.status as number, protocol: preferred.protocol } : undefined;
}

/** Aynı ürünün farklı adlarla gelmesini ("Apache", "Apache httpd", "Apache HTTP Server") tek anahtarda toplar. */
const TECH_ALIASES: Array<[RegExp, string]> = [
  [/^apache(?: http(?:d| server))?$/i, 'Apache HTTP Server'],
  [/^nginx(?: web server)?$/i, 'Nginx'],
  [/^microsoft[- ]iis(?: httpd)?$|^iis$/i, 'Microsoft IIS'],
  [/^postfix(?: smtpd)?$/i, 'Postfix'],
  [/^openssh$/i, 'OpenSSH']
];

export function canonicalTechName(name: string): string {
  const trimmed = name.trim();
  for (const [pattern, canonical] of TECH_ALIASES) if (pattern.test(trimmed)) return canonical;
  return trimmed;
}

/** Bir hostun teknoloji listesini CDN kayıtlarını çıkarıp aynı ürünleri birleştirerek döndürür. */
export function visibleTechnologies(detail?: SubdomainDetail): TechInfo[] {
  const merged = new Map<string, TechInfo>();
  for (const tech of detail?.technologies || []) {
    if (tech.category === 'CDN') continue;
    if (detail?.waf?.detected && /cloudflare/i.test(detail.waf.name || '') && /cloudflare/i.test(tech.name)) continue;
    const name = canonicalTechName(tech.name);
    const key = name.toLowerCase();
    const current = merged.get(key);
    if (!current) merged.set(key, { ...tech, name });
    else if (!current.version && tech.version) merged.set(key, { ...current, version: tech.version });
  }
  return [...merged.values()];
}

export function isWebPort(port: PortInfo): boolean {
  return port.isWeb === true || port.protocol === 'http:' || port.protocol === 'https:';
}

/** Web portu için tıklanabilir adres; web dışı portlarda undefined. */
export function portHref(host: string, port: PortInfo): string | undefined {
  if (!isWebPort(port)) return undefined;
  const scheme = port.protocol === 'https:' ? 'https' : 'http';
  const suffix = (scheme === 'https' && port.port === 443) || (scheme === 'http' && port.port === 80) ? '' : `:${port.port}`;
  return `${scheme}://${host}${suffix}`;
}

export function buildWorkspace(
  domain: string,
  records: SubdomainData[],
  details: Record<string, SubdomainDetail>,
  email?: EmailSecurityInfo,
  meta?: ScanMeta
): Workspace {
  const findings = deriveFindings(domain, records.map(record => ({ name: record.subdomain, detail: details[record.subdomain] })), email);
  const byHost = findingsByHost(findings);

  const rows: AssetRow[] = records.map(record => {
    const detail = details[record.subdomain];
    const hostFindings = byHost.get(record.subdomain) || [];
    return {
      name: record.subdomain,
      record,
      detail,
      status: rowStatus(record),
      ip: detail?.ip || record.ip || record.ips?.[0] || undefined,
      ports: detail?.ports || [],
      http: primaryHttp(detail),
      tlsGrade: detail?.ssl?.grade,
      headerGrade: detail?.security?.grade,
      headerScore: detail?.security?.score,
      wafName: detail?.waf?.detected ? detail.waf.name : undefined,
      wafDetected: detail?.waf ? detail.waf.detected : undefined,
      technologies: visibleTechnologies(detail),
      sources: record.sources?.length ? record.sources : (record.source ? record.source.split(' + ') : []),
      findings: hostFindings,
      risk: riskScore(hostFindings),
      busy: Boolean(detail?.analyzing || detail?.techAnalyzing || detail?.advancedAnalyzing)
    };
  });

  const techMap = new Map<string, TechSummary>();
  for (const row of rows) {
    for (const tech of row.technologies) {
      const key = tech.name.toLowerCase();
      const entry = techMap.get(key) || { key, name: tech.name, category: tech.category || 'Diğer', versions: [], hosts: [], outdated: false };
      if (outdatedLabel(tech)) entry.outdated = true;
      if (tech.version && !entry.versions.includes(tech.version)) entry.versions.push(tech.version);
      if (!entry.hosts.includes(row.name)) entry.hosts.push(row.name);
      techMap.set(key, entry);
    }
  }

  const headerScores = rows.map(row => row.headerScore).filter((score): score is number => typeof score === 'number');

  return {
    domain,
    rows,
    findings,
    technologies: [...techMap.values()].sort((a, b) => b.hosts.length - a.hosts.length || a.name.localeCompare(b.name)),
    stats: {
      total: rows.length,
      live: rows.filter(row => row.status === 'live').length,
      unknown: rows.filter(row => row.status === 'unknown').length,
      dead: rows.filter(row => row.status === 'dead').length,
      webServices: rows.filter(row => row.ports.some(isWebPort)).length,
      openPorts: rows.reduce((sum, row) => sum + row.ports.length, 0),
      analyzed: rows.filter(row => row.detail?.ssl || row.detail?.security || row.detail?.waf || row.detail?.evidence).length,
      headerAverage: headerScores.length ? Math.round(headerScores.reduce((sum, score) => sum + score, 0) / headerScores.length) : null,
      validTls: rows.filter(row => row.detail?.ssl?.valid).length,
      waf: rows.filter(row => row.wafDetected).length
    },
    email,
    meta
  };
}

/** Kapsama yalnız erişilebilir HTTP/S uygulamaları alınır; tek başına HTTP 3xx yeterli değildir. */
export function scopeHosts(records: SubdomainData[], details: Record<string, SubdomainDetail>): string[] {
  const valid = records
    .map(record => record.subdomain)
    .filter(sub => (details[sub]?.ports || []).some(port =>
      isWebPort(port) && (port.protocol === 'https:' || !String(port.status).startsWith('3'))
    ));
  return [...new Set(valid)].sort();
}
