import type { EmailSecurityInfo, SubdomainDetail, TechInfo } from '../types';

export type Severity = 'high' | 'medium' | 'low' | 'info';

export const SEVERITY_ORDER: readonly Severity[] = ['high', 'medium', 'low', 'info'];

export const SEVERITY_META: Record<Severity, { label: string; short: string; weight: number }> = {
  high: { label: 'Yüksek', short: 'Y', weight: 10 },
  medium: { label: 'Orta', short: 'O', weight: 4 },
  low: { label: 'Düşük', short: 'D', weight: 1 },
  info: { label: 'Bilgi', short: 'B', weight: 0 }
};

export type FindingCategory = 'TLS' | 'HTTP başlıkları' | 'Servisler' | 'Yazılım' | 'E-posta' | 'Cookie' | 'Koruma';

export interface Finding {
  id: string;
  severity: Severity;
  category: FindingCategory;
  title: string;
  description: string;
  remediation: string;
  hosts: string[];
  /** Host adı → o hosttaki somut gözlem (ör. "TLS 1.0, TLS 1.1"). */
  evidence: Record<string, string>;
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

interface HostRule {
  id: string;
  severity: Severity;
  category: FindingCategory;
  title: string;
  description: string;
  remediation: string;
  /** Bulgu varsa host için kanıt metni, yoksa null. */
  check: (detail: SubdomainDetail) => string | null;
}

const list = (items: string[], max = 3) => items.length > max ? `${items.slice(0, max).join(', ')} +${items.length - max}` : items.join(', ');

const HOST_RULES: HostRule[] = [
  {
    id: 'tls-self-signed', severity: 'high', category: 'TLS', title: 'Self-signed TLS sertifikası',
    description: 'Sertifika güvenilir bir otorite tarafından imzalanmamış; tarayıcılar uyarı gösterir ve araya girme saldırısı riski artar.',
    remediation: 'Güvenilir bir sertifika otoritesinden (ör. ACME/Let’s Encrypt) sertifika alın; iç kullanım servisiyse internete açık olması gerekip gerekmediğini gözden geçirin.',
    check: d => d.ssl?.isSelfSigned === true ? `yayıncı: ${d.ssl.issuer || 'bilinmiyor'}` : null
  },
  {
    id: 'tls-invalid', severity: 'high', category: 'TLS', title: 'TLS sertifikası geçersiz',
    description: 'Sertifika doğrulanamıyor veya süresi dolmuş.',
    remediation: 'Sertifikayı yenileyin ve ara sertifikalar dahil zincirin tamamını sunun.',
    check: d => d.ssl?.valid === false && d.ssl.isSelfSigned !== true
      ? typeof d.ssl.daysLeft === 'number' && d.ssl.daysLeft < 0 ? `süresi ${-d.ssl.daysLeft} gün önce doldu` : `doğrulanamadı${d.ssl.issuer ? ` · ${d.ssl.issuer}` : ''}`
      : null
  },
  {
    id: 'tls-hostname', severity: 'high', category: 'TLS', title: 'Sertifika host adıyla eşleşmiyor',
    description: 'Sunulan sertifikanın SAN listesi bu host adını kapsamıyor.',
    remediation: 'Host adını SAN listesine ekleyen bir sertifika kullanın ya da bu adı doğru sanal hosta yönlendirin.',
    check: d => d.ssl?.hostnameMatch === false ? (d.ssl.san?.length ? `SAN: ${list(d.ssl.san)}` : 'SAN listesinde yok') : null
  },
  {
    id: 'tls-expiring', severity: 'medium', category: 'TLS', title: `Sertifika ${EXPIRY_WARNING_DAYS} gün içinde doluyor`,
    description: 'Yenilenmezse servis erişilemez hale gelir.',
    remediation: 'Sertifikayı yenileyin ve otomatik yenilemeyi (ACME) etkinleştirin.',
    check: d => d.ssl?.valid === true && typeof d.ssl.daysLeft === 'number' && d.ssl.daysLeft <= EXPIRY_WARNING_DAYS ? `${d.ssl.daysLeft} gün kaldı` : null
  },
  {
    id: 'tls-legacy', severity: 'medium', category: 'TLS', title: 'Eski TLS sürümleri açık (1.0 / 1.1)',
    description: 'Sunucu kullanımdan kaldırılmış protokolleri kabul ediyor; protokol düşürme riskini artırır.',
    remediation: 'Sunucu yapılandırmasında TLS 1.0 ve 1.1’i kapatın; yalnız TLS 1.2 ve 1.3’e izin verin.',
    check: d => {
      const versions = [d.ssl?.legacyProtocols?.tls10 === 'yes' ? 'TLS 1.0' : '', d.ssl?.legacyProtocols?.tls11 === 'yes' ? 'TLS 1.1' : ''].filter(Boolean);
      return versions.length ? versions.join(', ') : null;
    }
  },
  {
    id: 'tls-weak-cipher', severity: 'medium', category: 'TLS', title: 'Zayıf şifre takımı',
    description: 'Anlaşılan şifre takımı zayıf kabul edilen algoritmalar içeriyor.',
    remediation: 'RC4, 3DES ve CBC-SHA1 gibi zayıf şifre takımlarını kapatın; güncel bir TLS yapılandırma profili kullanın.',
    check: d => d.ssl?.cipher?.weak === true ? d.ssl.cipher.name : null
  },
  {
    id: 'hdr-hsts', severity: 'medium', category: 'HTTP başlıkları', title: 'HSTS başlığı yok',
    description: 'HTTPS kullanımı zorunlu tutulmuyor; ilk bağlantıda protokol düşürme saldırısına açık.',
    remediation: 'HTTPS yanıtlarına Strict-Transport-Security başlığı ekleyin (ör. max-age=31536000; includeSubDomains).',
    check: d => d.security?.missing.includes('HSTS') && (d.evidence?.protocol === 'https:' || Boolean(d.ssl)) ? `başlık notu ${d.security.grade} · ${d.security.score}/100` : null
  },
  {
    id: 'hdr-csp', severity: 'medium', category: 'HTTP başlıkları', title: 'Content-Security-Policy yok',
    description: 'XSS etkisini sınırlayan içerik politikası tanımlanmamış.',
    remediation: 'Uygulamanın kullandığı kaynaklara göre bir Content-Security-Policy tanımlayın; önce Report-Only modunda deneyin.',
    check: d => d.security?.missing.includes('CSP') ? `başlık notu ${d.security.grade} · ${d.security.score}/100` : null
  },
  {
    id: 'ports-exposed-service', severity: 'medium', category: 'Servisler', title: 'İnternete açık veritabanı / yönetim servisi',
    description: 'Veritabanı, kamera veya ERP gibi web dışı bir servis internetten erişilebilir görünüyor.',
    remediation: 'Servisi internete kapatın ya da VPN veya IP izin listesi arkasına alın; açık kalması gerekiyorsa güncel ve güçlü kimlik doğrulamalı olduğunu doğrulayın.',
    check: d => {
      const ports = (d.ports || []).filter(isExposedServicePort);
      return ports.length ? list(ports.map(port => `:${port.port} ${port.service || ''}`.trim())) : null;
    }
  },
  {
    id: 'lib-outdated', severity: 'medium', category: 'Yazılım', title: 'Eski istemci kütüphanesi',
    description: 'Güvenlik düzeltmesi içeren sürümden eski bir kütüphane kullanılıyor. Bilinen zafiyetler sürüm bazında doğrulanmalı.',
    remediation: 'Kütüphaneyi güncel sürüme yükseltin; kullanılmıyorsa sayfadan kaldırın.',
    check: d => {
      const labels = outdatedLibraries(d.technologies);
      return labels.length ? labels.join(', ') : null;
    }
  },
  {
    id: 'hdr-secondary', severity: 'low', category: 'HTTP başlıkları', title: 'Diğer eksik güvenlik başlıkları',
    description: 'Clickjacking, MIME türü tahmini ve bilgi sızıntısına karşı koruyan yardımcı başlıklar eksik.',
    remediation: 'X-Frame-Options (ya da CSP frame-ancestors), X-Content-Type-Options: nosniff ve Referrer-Policy başlıklarını ekleyin.',
    check: d => {
      const missing = (d.security?.missing || []).filter(header => SECONDARY_HEADERS.includes(header));
      return missing.length ? `${missing.length} eksik: ${list(missing, 2)}` : null;
    }
  },
  {
    id: 'cookie-flags', severity: 'low', category: 'Cookie', title: 'Güvensiz cookie bayrakları',
    description: 'Secure, HttpOnly veya SameSite bayrağı eksik cookie gönderiliyor.',
    remediation: 'Oturum cookie’lerine Secure, HttpOnly ve uygun SameSite bayraklarını ekleyin.',
    check: d => {
      const issues = [...new Set((d.cookies || []).flatMap(cookie => cookie.issues))];
      return issues.length ? list(issues, 2) : null;
    }
  },
  {
    id: 'waf-none', severity: 'info', category: 'Koruma', title: 'WAF tespit edilmedi',
    description: 'Yanıt başlıklarında bilinen bir WAF/CDN imzası görülmedi. Bu bir zafiyet değil, eksik bir savunma katmanıdır.',
    remediation: 'Kritik uygulamaların önüne WAF/CDN koymayı değerlendirin.',
    check: d => d.waf?.detected === false ? 'imza yok' : null
  },
  {
    id: 'ports-silent-web', severity: 'info', category: 'Servisler', title: 'HTTP yanıtı vermeyen açık port',
    description: 'Port bağlantı kabul ediyor ama HTTP(S) yanıtı alınamadı.',
    remediation: 'Portta çalışan servisi belirleyin; gerekmiyorsa dışarıya kapatın.',
    check: d => {
      const ports = (d.ports || []).filter(isSilentWebPort);
      return ports.length ? ports.map(port => `:${port.port}`).join(', ') : null;
    }
  }
];

/**
 * Tarama sonuçlarından bulgu listesi türetir. Yalnız ölçülmüş değerlere bakar;
 * ölçülmemiş (undefined) alanlar bulgu üretmez.
 */
export function deriveFindings(domain: string, hosts: FindingHost[], email?: EmailSecurityInfo): Finding[] {
  const findings: Finding[] = [];
  for (const rule of HOST_RULES) {
    const evidence: Record<string, string> = {};
    for (const host of hosts) {
      if (!host.detail || evidence[host.name] !== undefined) continue;
      const observed = rule.check(host.detail);
      if (observed !== null) evidence[host.name] = observed;
    }
    const names = Object.keys(evidence);
    if (names.length) {
      const { check: _check, ...meta } = rule;
      void _check;
      findings.push({ ...meta, hosts: names, evidence });
    }
  }

  if (email) {
    const mail = (id: string, severity: Severity, title: string, description: string, remediation: string, observed: string) =>
      findings.push({ id, severity, category: 'E-posta', title, description, remediation, hosts: [domain], evidence: { [domain]: observed } });
    if (!email.spf.hasRecord) {
      mail('mail-spf-missing', 'high', 'SPF kaydı yok', 'Alan adı adına hangi sunucuların e-posta gönderebileceği tanımlanmamış; sahte gönderim kolaylaşır.',
        'Yetkili gönderici sunucuları listeleyen ve -all (geçişte ~all) ile biten bir SPF kaydı yayınlayın.', 'TXT kaydında SPF yok');
    } else if (email.spf.all === '+all') {
      mail('mail-spf-all', 'high', 'SPF +all', 'SPF kaydı tüm sunuculara izin veriyor; kayıt koruma sağlamıyor.',
        '+all yerine -all (geçiş sürecinde ~all) kullanın.', 'v=spf1 … +all');
    }
    if (!email.dmarc.hasRecord) {
      mail('mail-dmarc-missing', 'medium', 'DMARC kaydı yok', 'Sahte e-postalar için politika tanımlanmamış.',
        '_dmarc kaydı yayınlayın; raporları izleyip p=quarantine ve p=reject’e ilerleyin.', '_dmarc kaydı yok');
    } else if (email.dmarc.policy === 'none') {
      mail('mail-dmarc-none', 'medium', 'DMARC politikası p=none', 'Sahte e-postalar reddedilmiyor, yalnızca raporlanıyor.',
        'Raporları inceledikten sonra politikayı p=quarantine, ardından p=reject yapın.', 'p=none');
    }
    if (!email.dkim.hasRecord) {
      mail('mail-dkim', 'info', 'DKIM kaydı bulunamadı', 'Yalnızca yaygın selector adları denendi; sonuç kesin değil.',
        'Gönderim yapan servislerde DKIM imzalamayı etkinleştirin ve kullanılan selector’ı doğrulayın.', 'yaygın selector’larda kayıt yok');
    }
  }

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
