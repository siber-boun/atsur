import assert from 'node:assert/strict';
import test from 'node:test';
import { countBySeverity, deriveFindings, outdatedLabel } from './findings';
import { buildWorkspace, canonicalTechName, scopeHosts } from './workspace';
import { parseHash, routeToHash } from './route';
import { normalizeSubdomainList } from './storage';
import type { EmailSecurityInfo, SubdomainDetail } from '../types';

const missingAll = ['HSTS', 'CSP', 'X-Frame-Options', 'Cross-Origin-Opener-Policy'];

const detail = (overrides: Partial<SubdomainDetail>): SubdomainDetail => ({ ip: '203.0.113.1', ports: [], ...overrides });

test('TLS bulguları yalnız ölçülmüş değerlerden üretilir', () => {
  const findings = deriveFindings('example.com', [
    { name: 'a.example.com', detail: detail({ ssl: { valid: false, grade: 'F', hostnameMatch: false } }) },
    { name: 'b.example.com', detail: detail({ ssl: { valid: true, grade: 'A', daysLeft: 5 } }) },
    { name: 'c.example.com', detail: detail({}) },
    { name: 'd.example.com' }
  ]);
  const ids = Object.fromEntries(findings.map(finding => [finding.id, finding.hosts]));
  assert.deepEqual(ids['tls-invalid'], ['a.example.com']);
  assert.deepEqual(ids['tls-hostname'], ['a.example.com']);
  assert.deepEqual(ids['tls-expiring'], ['b.example.com']);
  assert.equal(findings.some(finding => finding.hosts.includes('c.example.com') || finding.hosts.includes('d.example.com')), false);
});

test('self-signed sertifika ayrıca "geçersiz" olarak sayılmaz', () => {
  const findings = deriveFindings('example.com', [
    { name: 'x.example.com', detail: detail({ ssl: { valid: false, isSelfSigned: true, grade: 'F' } }) }
  ]);
  assert.ok(findings.some(finding => finding.id === 'tls-self-signed'));
  assert.ok(!findings.some(finding => finding.id === 'tls-invalid'));
});

test('HSTS yalnız HTTPS kanıtı olan hostta bulgu olur', () => {
  const findings = deriveFindings('example.com', [
    { name: 'https.example.com', detail: detail({ security: { score: 0, grade: 'F', missing: missingAll }, evidence: { source: 'render-live', protocol: 'https:' } }) },
    { name: 'http.example.com', detail: detail({ security: { score: 0, grade: 'F', missing: missingAll }, evidence: { source: 'render-live', protocol: 'http:' } }) }
  ]);
  assert.deepEqual(findings.find(finding => finding.id === 'hdr-hsts')?.hosts, ['https.example.com']);
  assert.deepEqual(findings.find(finding => finding.id === 'hdr-csp')?.hosts, ['https.example.com', 'http.example.com']);
});

test('e-posta bulguları domaine yazılır ve önem sırasına göre sıralanır', () => {
  const email: EmailSecurityInfo = {
    spf: { hasRecord: true, hasMinusAll: false, all: '+all' },
    dmarc: { hasRecord: true, policy: 'none' },
    dkim: { hasRecord: false },
    score: 20,
    grade: 'F'
  };
  const findings = deriveFindings('example.com', [], email);
  assert.deepEqual(findings.map(finding => finding.id), ['mail-spf-all', 'mail-dmarc-none', 'mail-dkim']);
  assert.deepEqual(countBySeverity(findings), { high: 1, medium: 1, low: 0, info: 1 });
});

test('port bulguları web dışı servis ile HTTP yanıtsız portu ayırır', () => {
  const findings = deriveFindings('example.com', [{
    name: 'db.example.com',
    detail: detail({ ports: [
      { port: 1433, status: 'TCP Açık', protocol: 'tcp:', isWeb: false, isWebCandidate: false },
      { port: 8443, status: 'TCP Açık', protocol: 'tcp:', isWeb: false, isWebCandidate: true }
    ] })
  }]);
  assert.ok(findings.some(finding => finding.id === 'ports-exposed-service' && finding.severity === 'medium'));
  assert.ok(findings.some(finding => finding.id === 'ports-silent-web' && finding.severity === 'info'));
});

test('eski kütüphane eşiği sürüm karşılaştırmasıyla çalışır', () => {
  assert.equal(outdatedLabel({ name: 'jQuery UI', version: '1.8.21' }), 'jQuery UI 1.8.21');
  assert.equal(outdatedLabel({ name: 'jQuery', version: '3.5.0' }), null);
  assert.equal(outdatedLabel({ name: 'jQuery', version: '3.4.1' }), 'jQuery 3.4.1');
  assert.equal(outdatedLabel({ name: 'jQuery', version: undefined }), null);
  assert.equal(outdatedLabel({ name: 'React', version: '0.1' }), null);
});

test('aynı ürünün farklı adları tek teknolojide birleşir', () => {
  assert.equal(canonicalTechName('Apache httpd'), 'Apache HTTP Server');
  assert.equal(canonicalTechName('Apache'), 'Apache HTTP Server');
  const ws = buildWorkspace('example.com', [{ subdomain: 'a.example.com', source: 'crt.sh', status: 'live' }], {
    'a.example.com': detail({ technologies: [
      { name: 'Apache', category: 'Sunucu' },
      { name: 'Apache httpd', category: 'Sunucu', version: '2.4.58' },
      { name: 'Cloudflare', category: 'CDN' }
    ] })
  });
  assert.equal(ws.technologies.length, 1);
  assert.deepEqual(ws.technologies[0].versions, ['2.4.58']);
});

test('kapsam yalnız HTTPS ya da yönlendirme olmayan HTTP yanıtı veren hostları alır', () => {
  const records = ['a', 'b', 'c', 'd'].map(name => ({ subdomain: `${name}.example.com`, source: 'crt.sh' }));
  const hosts = scopeHosts(records, {
    'a.example.com': detail({ ports: [{ port: 443, status: 200, protocol: 'https:', isWeb: true }] }),
    'b.example.com': detail({ ports: [{ port: 80, status: 301, protocol: 'http:', isWeb: true }] }),
    'c.example.com': detail({ ports: [{ port: 80, status: 200, protocol: 'http:', isWeb: true }] }),
    'd.example.com': detail({ ports: [{ port: 8443, status: 'TCP Açık', protocol: 'tcp:', isWeb: false }] })
  });
  assert.deepEqual(hosts, ['a.example.com', 'c.example.com']);
});

test('eski string kayıtlar nesneye çevrilir', () => {
  assert.deepEqual(normalizeSubdomainList(['www.example.com', { subdomain: 'a.example.com', source: 'x' }]), [
    { subdomain: 'www.example.com', source: 'crt.sh' },
    { subdomain: 'a.example.com', source: 'x' }
  ]);
  assert.deepEqual(normalizeSubdomainList(undefined), []);
});

test('hash yönlendirmesi gidiş-dönüş korunur, bilinmeyen sayfa dashboard olur', () => {
  assert.deepEqual(parseHash('#/assets?host=a.example.com&tech=Apache'), { view: 'assets', host: 'a.example.com', tech: 'Apache' });
  assert.deepEqual(parseHash('#/yok'), { view: 'dashboard' });
  assert.deepEqual(parseHash(''), { view: 'dashboard' });
  assert.equal(routeToHash({ view: 'assets', host: 'a.example.com' }), '#/assets?host=a.example.com');
});

test('her bulgu kategori, düzeltme önerisi ve host başına kanıt taşır', () => {
  const findings = deriveFindings('example.com', [
    { name: 'a.example.com', detail: detail({ ssl: { valid: true, grade: 'D', legacyProtocols: { tls10: 'yes', tls11: 'no' } } }) },
    { name: 'b.example.com', detail: detail({ ports: [{ port: 1433, status: 'TCP Açık', protocol: 'tcp:', service: 'Microsoft SQL Server', isWeb: false, isWebCandidate: false }] }) }
  ], { spf: { hasRecord: false, hasMinusAll: false }, dmarc: { hasRecord: true, policy: 'reject' }, dkim: { hasRecord: true }, score: 60, grade: 'C' });
  const legacy = findings.find(finding => finding.id === 'tls-legacy');
  assert.equal(legacy?.category, 'TLS');
  assert.deepEqual(legacy?.evidence, { 'a.example.com': 'TLS 1.0' });
  assert.ok(legacy?.remediation.includes('TLS 1.0'));
  assert.equal(findings.find(finding => finding.id === 'ports-exposed-service')?.evidence['b.example.com'], ':1433 Microsoft SQL Server');
  const spf = findings.find(finding => finding.id === 'mail-spf-missing');
  assert.deepEqual(spf?.hosts, ['example.com']);
  assert.ok(findings.every(finding => finding.remediation && finding.hosts.every(host => finding.evidence[host])));
});
