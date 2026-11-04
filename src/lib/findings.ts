import type { EmailSecurityInfo, SubdomainDetail, TechInfo } from '../types';

export type Severity = 'high' | 'medium' | 'low' | 'info';

export const SEVERITY_ORDER: readonly Severity[] = ['high', 'medium', 'low', 'info'];

export const SEVERITY_META: Record<Severity, { label: string; short: string; weight: number }> = {
  high: { label: 'Yüksek', short: 'Y', weight: 10 },
  medium: { label: 'Orta', short: 'O', weight: 4 },
  low: { label: 'Düşük', short: 'D', weight: 1 },
  info: { label: 'Bilgi', short: 'B', weight: 0 }
};

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  hosts: string[];
}

export interface FindingHost {
  name: string;
  detail?: SubdomainDetail;
}

const SECONDARY_HEADERS = [
  'X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'X-XSS-Protection',
  'Cross-Origin-Opener-Policy', 'Cross-Origin-Resource-Policy', 'Cross-Origin-Embedder-Policy'
];

const EXPIRY_WARNING_DAYS = 14;

/** "1.8.21" → [1, 8, 21]; sayısal olmayan parçalar 0 sayılır. */
function versionParts(version: string): number[] {
  return version.split(/[.\-+]/).slice(0, 3).map(part => Number.parseInt(part, 10) || 0);
}

function isOlderThan(version: string, minimum: string): boolean {
  const a = versionParts(version);
  const b = versionParts(minimum);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0);
  }
  return false;
}

/**
 * Bilinen güvenlik düzeltmelerinin geldiği sürümler. Eşik altındaki sürümler
 * "doğrulanmalı" olarak işaretlenir; belirli bir zafiyet iddia edilmez.
 */
const OUTDATED_LIBRARIES: Array<{ match: RegExp; minimum: string; label: string }> = [
  { match: /^jquery$/i, minimum: '3.5.0', label: 'jQuery' },
  { match: /^jquery ?ui$/i, minimum: '1.13.0', label: 'jQuery UI' }
];

export function techLabel(tech: TechInfo): string {
  return tech.version ? `${tech.name} ${tech.version}` : tech.name;
}

/** Sürümü bilinen güvenlik düzeltmesinden eskiyse kütüphane etiketini döndürür. */
export function outdatedLabel(tech: Pick<TechInfo, 'name' | 'version'>): string | null {
  if (!tech.version) return null;
  const rule = OUTDATED_LIBRARIES.find(item => item.match.test(tech.name.trim()));
  return rule && isOlderThan(tech.version, rule.minimum) ? `${rule.label} ${tech.version}` : null;
}

function outdatedLibraries(technologies: TechInfo[] | undefined): string[] {
  return (technologies || []).map(outdatedLabel).filter((label): label is string => Boolean(label));
}

type PortLike = { protocol: string; isWeb?: boolean; isWebCandidate?: boolean };

/** Web hedef listesinde olmayan açık port: veritabanı, kamera, ERP gibi servisler. */
function isExposedServicePort(port: PortLike) {
  return port.isWebCandidate === false && port.isWeb !== true;
}

/** Web adayı olduğu halde HTTP(S) yanıtı vermeyen açık port ("TCP Açık"). */
function isSilentWebPort(port: PortLike) {
  return port.isWebCandidate === true && port.isWeb !== true && port.protocol !== 'http:' && port.protocol !== 'https:';
}

/**
 * Tarama sonuçlarından bulgu listesi türetir. Yalnız ölçülmüş değerlere bakar;
 * ölçülmemiş (undefined) alanlar bulgu üretmez.
 */
export function deriveFindings(domain: string, hosts: FindingHost[], email?: EmailSecurityInfo): Finding[] {
  const findings: Finding[] = [];
  const add = (id: string, severity: Severity, title: string, description: string, names: string[]) => {
    const unique = [...new Set(names)];
    if (unique.length) findings.push({ id, severity, title, description, hosts: unique });
  };
  const pick = (test: (detail: SubdomainDetail) => boolean) =>
    hosts.filter(host => host.detail && test(host.detail)).map(host => host.name);

  add('tls-self-signed', 'high', 'Self-signed TLS sertifikası',
    'Sertifika güvenilir bir otorite tarafından imzalanmamış; tarayıcılar uyarı gösterir ve araya girme saldırısı riski artar.',
    pick(d => d.ssl?.isSelfSigned === true));
  add('tls-invalid', 'high', 'TLS sertifikası geçersiz',
    'Sertifika doğrulanamıyor veya süresi dolmuş.',
    pick(d => d.ssl?.valid === false && d.ssl?.isSelfSigned !== true));
  add('tls-hostname', 'high', 'Sertifika host adıyla eşleşmiyor',
    'Sunulan sertifikanın SAN listesi bu host adını kapsamıyor.',
    pick(d => d.ssl?.hostnameMatch === false));
  add('tls-expiring', 'medium', `Sertifika ${EXPIRY_WARNING_DAYS} gün içinde doluyor`,
    'Yenilenmezse servis erişilemez hale gelir.',
    pick(d => d.ssl?.valid === true && typeof d.ssl.daysLeft === 'number' && d.ssl.daysLeft <= EXPIRY_WARNING_DAYS));
  add('tls-legacy', 'medium', 'Eski TLS sürümleri açık (1.0 / 1.1)',
    'Sunucu kullanımdan kaldırılmış protokolleri kabul ediyor; protokol düşürme riskini artırır.',
    pick(d => d.ssl?.legacyProtocols?.tls10 === 'yes' || d.ssl?.legacyProtocols?.tls11 === 'yes'));
  add('tls-weak-cipher', 'medium', 'Zayıf şifre takımı',
    'Anlaşılan şifre takımı zayıf kabul edilen algoritmalar içeriyor.',
    pick(d => d.ssl?.cipher?.weak === true));
  add('hdr-hsts', 'medium', 'HSTS başlığı yok',
    'HTTPS kullanımı zorunlu tutulmuyor; ilk bağlantıda protokol düşürme saldırısına açık.',
    pick(d => Boolean(d.security?.missing.includes('HSTS')) && (d.evidence?.protocol === 'https:' || Boolean(d.ssl))));
  add('hdr-csp', 'medium', 'Content-Security-Policy yok',
    'XSS etkisini sınırlayan içerik politikası tanımlanmamış.',
    pick(d => Boolean(d.security?.missing.includes('CSP'))));

  add('ports-exposed-service', 'medium', 'İnternete açık veritabanı / yönetim servisi',
    'Veritabanı, kamera veya ERP gibi web dışı bir servis internetten erişilebilir görünüyor; dışarı açık olması gerekip gerekmediği doğrulanmalı.',
    pick(d => Boolean(d.ports?.some(isExposedServicePort))));

  const outdated = hosts.flatMap(host => outdatedLibraries(host.detail?.technologies).map(label => ({ host: host.name, label })));
  add('lib-outdated', 'medium', 'Eski istemci kütüphanesi',
    `Güvenlik düzeltmesi içeren sürümden eski: ${[...new Set(outdated.map(item => item.label))].join(', ')}. Bilinen zafiyetler sürüm bazında doğrulanmalı.`,
    outdated.map(item => item.host));

  if (email) {
    if (!email.spf.hasRecord) add('mail-spf-missing', 'high', 'SPF kaydı yok', 'Alan adı adına hangi sunucuların e-posta gönderebileceği tanımlanmamış.', [domain]);
    else if (email.spf.all === '+all') add('mail-spf-all', 'high', 'SPF +all', 'SPF kaydı tüm sunuculara izin veriyor; kayıt koruma sağlamıyor.', [domain]);
    if (!email.dmarc.hasRecord) add('mail-dmarc-missing', 'medium', 'DMARC kaydı yok', 'Sahte e-postalar için politika tanımlanmamış.', [domain]);
    else if (email.dmarc.policy === 'none') add('mail-dmarc-none', 'medium', 'DMARC politikası p=none', 'Sahte e-postalar reddedilmiyor, yalnızca raporlanıyor.', [domain]);
    if (!email.dkim.hasRecord) add('mail-dkim', 'info', 'DKIM kaydı bulunamadı', 'Yalnızca yaygın selector adları denendi; sonuç kesin değil.', [domain]);
  }

  add('hdr-secondary', 'low', 'Diğer eksik güvenlik başlıkları',
    `${SECONDARY_HEADERS.slice(0, 5).join(', ')} ve Cross-Origin politikalarından en az biri eksik.`,
    pick(d => Boolean(d.security?.missing.some(header => SECONDARY_HEADERS.includes(header)))));
  add('cookie-flags', 'low', 'Güvensiz cookie bayrakları',
    'Secure, HttpOnly veya SameSite bayrağı eksik cookie gönderiliyor.',
    pick(d => Boolean(d.cookies?.some(cookie => cookie.issues.length > 0))));
  add('waf-none', 'info', 'WAF tespit edilmedi',
    'Yanıt başlıklarında bilinen bir WAF/CDN imzası görülmedi.',
    pick(d => d.waf?.detected === false));
  add('ports-silent-web', 'info', 'HTTP yanıtı vermeyen açık port',
    'Port bağlantı kabul ediyor ama HTTP(S) yanıtı alınamadı; hangi servis olduğu doğrulanmalı.',
    pick(d => Boolean(d.ports?.some(isSilentWebPort))));

  return findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

/** Host adı → o hostu etkileyen bulgular. */
export function findingsByHost(findings: Finding[]): Map<string, Finding[]> {
  const map = new Map<string, Finding[]>();
  for (const finding of findings) {
    for (const host of finding.hosts) map.set(host, [...(map.get(host) || []), finding]);
  }
  return map;
}

export function riskScore(findings: Finding[] | undefined): number {
  return (findings || []).reduce((sum, finding) => sum + SEVERITY_META[finding.severity].weight, 0);
}
