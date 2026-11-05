import { techLabel } from './findings';
import type { Workspace } from './workspace';

const MAX_HOSTS = 150;

/**
 * Yapay zekâya gönderilecek kompakt tarama özeti. Ham HTML ya da yanıt
 * gövdesi içermez; yalnız ölçülmüş alanlar eklenir.
 */
export function buildAiContext(ws: Workspace) {
  const hosts = [...ws.rows]
    .sort((a, b) => b.risk - a.risk || a.name.localeCompare(b.name))
    .slice(0, MAX_HOSTS)
    .map(row => {
      const ssl = row.detail?.ssl;
      const security = row.detail?.security;
      return {
        host: row.name,
        dns: row.status,
        ...(row.ip ? { ip: row.ip } : {}),
        ...(row.ports.length ? { ports: row.ports.map(port => ({ port: port.port, status: port.status, service: port.service, web: port.isWeb === true })) } : {}),
        ...(row.http ? { http: row.http } : {}),
        ...(row.detail?.evidence?.server ? { server: row.detail.evidence.server } : {}),
        ...(row.detail?.evidence?.externalRedirect ? { externalRedirect: row.detail.evidence.externalRedirect.target } : {}),
        ...(ssl ? {
          tls: {
            grade: ssl.grade, valid: ssl.valid, daysLeft: ssl.daysLeft, selfSigned: ssl.isSelfSigned, issuer: ssl.issuer,
            protocol: ssl.protocol, hostnameMatch: ssl.hostnameMatch, legacyTls: ssl.legacyProtocols, weakCipher: ssl.cipher?.weak
          }
        } : {}),
        ...(security ? { headers: { grade: security.grade, score: security.score, missing: security.missing } } : {}),
        ...(row.detail?.waf ? { waf: row.detail.waf.detected ? row.detail.waf.name || 'var' : 'yok' } : {}),
        ...(row.technologies.length ? { technologies: row.technologies.map(techLabel) } : {}),
        ...(row.detail?.cookies?.some(cookie => cookie.issues.length) ? { cookieIssues: [...new Set(row.detail.cookies.flatMap(cookie => cookie.issues))] } : {}),
        sources: row.sources
      };
    });

  return {
    domain: ws.domain,
    summary: { ...ws.stats, hostsIncluded: hosts.length },
    ...(ws.email ? { email: ws.email } : {}),
    ...(ws.meta ? {
      discovery: {
        sources: ws.meta.sources.map(source => ({ name: source.label, ok: source.ok, count: source.count, ...(source.skipped ? { skipped: source.skipped } : {}) })),
        wildcard: ws.meta.wildcard?.isWildcard ?? false
      }
    } : {}),
    findings: ws.findings.map(finding => ({ severity: finding.severity, title: finding.title, hosts: finding.hosts })),
    hosts
  };
}

export function contextSizeKb(context: unknown): number {
  return Math.max(1, Math.round(new Blob([JSON.stringify(context)]).size / 1024));
}
