import express from 'express';
import cors from 'cors';
import dns from 'node:dns';
import net from 'node:net';
import https from 'node:https';
import http from 'node:http';
import tls from 'node:tls';

const app = express();
const PORT = process.env.PORT || 3001;

// Render'da frontend ve backend ayrı URL'lerde olacağı için CORS gerekli
app.use(cors());
app.use(express.json());

const HTTP_HTTPS_PORTS = [
  80, 8080, 8000, 8008, 8888, 8081, 8082, 8083, 8084, 8090,
  443, 8443, 8444, 9443, 4443,
  3000, 3001, 4000, 5000, 9000, 9090, 9200, 7080, 7443
];

const checkPort = (port: number, host: string): Promise<boolean> => {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1500); 
        
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        
        socket.on('error', () => {
            resolve(false);
        });
        
        socket.connect(port, host);
    });
};

const checkHttp = (protocol: string, host: string, port: number): Promise<{status: number | string, isCloudflare: boolean, protocolUsed: string}> => {
    return new Promise((resolve, reject) => {
        const lib = protocol === 'https:' ? https : http;
        const requestObj = lib.request(`${protocol}//${host}:${port}`, {
            method: 'HEAD',
            timeout: 3500,
            rejectUnauthorized: false,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': '*/*'
            }
        }, (response) => {
            const serverHeader = (response.headers['server'] || '').toLowerCase();
            const isCloudflare = serverHeader.includes('cloudflare');
            resolve({ status: response.statusCode || 'Bilinmiyor', isCloudflare, protocolUsed: protocol });
        });
        requestObj.on('error', reject);
        requestObj.on('timeout', () => { 
            requestObj.destroy(); 
            reject(new Error('timeout')); 
        });
        requestObj.end();
    });
};

async function fetchCrtSh(domain: string) {
    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(`https://crt.sh/?q=${domain}&output=json`);
        if (!response.ok) return [];
        const data = await response.json();
        
        const uniqueSubdomains = new Set<string>();
        data.forEach((item: any) => {
            const parts = item.name_value.split('\n');
            parts.forEach((part: string) => {
                const cleaned = part.trim().toLowerCase();
                const finalDomain = cleaned.startsWith('*.') ? cleaned.substring(2) : cleaned;
                if (finalDomain && finalDomain.endsWith(domain)) {
                   uniqueSubdomains.add(finalDomain);
                }
            });
        });
        return Array.from(uniqueSubdomains).map(sub => ({ subdomain: sub, source: 'crt.sh' }));
    } catch {
        return [];
    }
}

async function fetchHackerTarget(domain: string) {
    try {
        const fetch = (await import('node-fetch')).default;
        const res = await fetch(`https://api.hackertarget.com/hostsearch/?q=${domain}`);
        const text = await res.text();
        
        if (text.includes('error') || text.includes('API count exceeded')) {
            return [];
        }

        return text
            .split('\n')
            .filter(line => line.includes(','))
            .map(line => ({
                subdomain: line.split(',')[0].trim().toLowerCase(),
                ip: line.split(',')[1].trim()
            }))
            .filter(item => item.subdomain.endsWith(`.${domain}`));
    } catch {
        return [];
    }
}

// Helper function to validate domain format strictly
const isValidDomain = (domain: string) => {
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
};

// SSRF koruması: Kullanıcıdan gelen host, bağlantı kurulmadan önce çözümlenir ve
// özel/loopback ağa düşen herhangi bir kayıt varsa reddedilir. Bu aracın barındığı
// Render datacenter IP'sinden iç ağa erişim denemesi bu sayede engellenir.
const isPrivateIpv4 = (ip: string): boolean => {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true;                            // 0.0.0.0/8
    if (a === 10) return true;                           // 10.0.0.0/8
    if (a === 127) return true;                          // loopback
    if (a === 100 && b >= 64 && b <= 127) return true;   // CGNAT 100.64.0.0/10
    if (a === 169 && b === 254) return true;             // link-local 169.254.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
    if (a === 192 && b === 168) return true;             // 192.168.0.0/16
    if (a >= 224) return true;                           // multicast + reserved
    return false;
};

const isPrivateIp = (ip: string): boolean => {
    if (ip.includes(':')) {
        const low = ip.toLowerCase();
        if (low === '::' || low === '::1') return true;              // unspecified + loopback
        if (/^f[cd][0-9a-f]{2}:/.test(low)) return true;             // fc00::/7 unique local
        if (/^fe[89ab]/.test(low)) return true;                      // fe80::/10 link-local
        const mapped = low.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (mapped) return isPrivateIpv4(mapped[1]);                 // IPv4-mapped
        return false;
    }
    return isPrivateIpv4(ip);
};

// A ve AAAA kayıtlarını çözer; özel ağa çözülüyorsa veya hiç çözülmüyorsa null döner.
const getPublicHostIp = async (domain: string): Promise<string | null> => {
    try {
        const [v4, v6] = await Promise.all([
            dns.promises.resolve4(domain).catch(() => []),
            dns.promises.resolve6(domain).catch(() => [])
        ]);
        const all = [...v4, ...v6];
        if (all.length === 0 || all.some(isPrivateIp)) return null;
        return v4[0] || v6[0] || null;
    } catch {
        return null;
    }
};

// 1. Yeni Birleştirilmiş Subdomain Scan Endpoint
app.get('/api/scan', async (req, res) => {
    const domain = req.query.domain as string;
    if (!domain || !isValidDomain(domain)) {
        return res.status(400).json({ error: 'Geçerli bir domain parametresi gerekli' });
    }

    try {
        const [crtResult, htResult] = await Promise.allSettled([
            fetchCrtSh(domain),
            fetchHackerTarget(domain)
        ]);

        const crtSubs = crtResult.status === 'fulfilled' ? crtResult.value : [];
        const htSubs = htResult.status === 'fulfilled' ? htResult.value : [];

        const merged = new Map();
        
        crtSubs.forEach(s => merged.set(s.subdomain, { subdomain: s.subdomain, source: 'crt.sh' }));
        htSubs.forEach(s => {
            if (merged.has(s.subdomain)) {
                const existing = merged.get(s.subdomain);
                existing.source = 'crt.sh + HackerTarget';
                if (!existing.ip && s.ip) existing.ip = s.ip;
            } else {
                merged.set(s.subdomain, { subdomain: s.subdomain, ip: s.ip, source: 'HackerTarget' });
            }
        });

        const finalResults = Array.from(merged.values()).sort((a, b) => a.subdomain.localeCompare(b.subdomain));
        res.json(finalResults);
    } catch (error) {
        console.error('Scan error:', error);
        res.status(500).json({ error: 'Tarama sırasında hata oluştu.' });
    }
});

// Eski API endpointi geriye dönük uyumluluk için bırakılabilir veya silinebilir
app.get('/api/crt', async (req, res) => {
    const domain = req.query.q as string;
    if (!domain || !isValidDomain(domain)) {
        return res.status(400).json({ error: 'Geçerli bir domain parametresi (q) gerekli' });
    }

    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(`https://crt.sh/?q=${domain}&output=json`);
        
        if (!response.ok) {
            throw new Error(`crt.sh responded with status ${response.status}`);
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('crt.sh proxy error:', error);
        res.status(500).json({ error: 'crt.sh API\'sine erişilemedi.' });
    }
});

// 2. Subdomain Analyzer Endpoint
app.get('/api/analyze', async (req, res) => {
    const domain = req.query.domain as string;
    
    if (!domain || !isValidDomain(domain)) {
        return res.status(400).json({ error: 'Geçerli bir domain parametresi gerekli' });
    }

    let ip = null;
    try {
        // SSRF koruması: özel ağa çözülen host taramaya sokulmaz
        ip = await getPublicHostIp(domain);
    } catch (e: any) {
        // DNS resolve failed
    }

    const activePorts: { port: number, status: number | string, isCloudflare: boolean, protocol: string }[] = [];

    if (ip) {
        const portChecks = HTTP_HTTPS_PORTS.map(async (port) => {
            // Rate limiting bypass / delay for simple implementation
            await new Promise(r => setTimeout(r, Math.random() * 300));
            const isOpen = await checkPort(port, domain);
            if (isOpen) {
                let status: number | string = 'Açık (Yanıt Yok)';
                let isCloudflare = false;
                const isHttps = [443, 8443, 8444, 9443, 4443, 7443].includes(port);
                let finalProtocol = isHttps ? 'https:' : 'http:';
                
                try {
                    const result = await checkHttp(isHttps ? 'https:' : 'http:', domain, port);
                    status = result.status;
                    isCloudflare = result.isCloudflare;
                    finalProtocol = result.protocolUsed;
                } catch (e: any) {
                    if (isHttps) {
                        try {
                            const result = await checkHttp('http:', domain, port);
                            status = result.status;
                            isCloudflare = result.isCloudflare;
                            finalProtocol = result.protocolUsed;
                        } catch (e2: any) { }
                    } else {
                        try {
                            const result = await checkHttp('https:', domain, port);
                            status = result.status;
                            isCloudflare = result.isCloudflare;
                            finalProtocol = result.protocolUsed;
                        } catch (e2: any) { }
                    }
                }
                activePorts.push({ port, status, isCloudflare, protocol: finalProtocol });
            }
        });

        await Promise.all(portChecks);
    }

    activePorts.sort((a, b) => a.port - b.port);
    const filteredPorts = activePorts.filter(p => p.status !== 'Açık (Yanıt Yok)');
    const isCloudflareGlobal = filteredPorts.some(p => p.isCloudflare);

    res.json({ ip, ports: filteredPorts, isCloudflare: isCloudflareGlobal });
});

const TECH_SIGNATURES = [
  // Web Framework
  { name: "WordPress",   category: "CMS",        headers: { "x-powered-by": /wordpress/i }, html: /wp-content|wp-json/i },
  { name: "Drupal",      category: "CMS",        headers: { "x-generator": /drupal/i },     html: /Drupal\.settings/i },
  { name: "Joomla",      category: "CMS",        headers: {},                                html: /joomla/i },
  { name: "Shopify",     category: "E-Ticaret",  headers: { "x-shopify-stage": /.+/i },     html: /shopify/i },
  { name: "Magento",     category: "E-Ticaret",  headers: {},                                html: /magento|Mage\.Cookies/i },
  // Frontend
  { name: "React",       category: "Frontend",   headers: {},                                html: /react\.development|ReactDOM|__reactFiber/i },
  { name: "Next.js",     category: "Frontend",   headers: { "x-powered-by": /next\.js/i },  html: /__NEXT_DATA__/i },
  { name: "Vue.js",      category: "Frontend",   headers: {},                                html: /vue\.min\.js|__vue__/i },
  { name: "Angular",     category: "Frontend",   headers: {},                                html: /ng-version|angular\.min\.js/i },
  { name: "jQuery",      category: "Frontend",   headers: {},                                html: /jquery\.min\.js|jquery-\d/i },
  { name: "Bootstrap",   category: "Frontend",   headers: {},                                html: /bootstrap\.min\.css|bootstrap\.min\.js/i },
  // Backend
  { name: "PHP",         category: "Backend",    headers: { "x-powered-by": /php/i },       html: null },
  { name: "Laravel",     category: "Backend",    headers: {},                                html: /laravel_session/i },
  { name: "Django",      category: "Backend",    headers: {},                                html: /csrfmiddlewaretoken/i },
  { name: "ASP.NET",     category: "Backend",    headers: { "x-powered-by": /asp\.net/i },  html: /__VIEWSTATE/i },
  { name: "Ruby Rails",  category: "Backend",    headers: { "x-powered-by": /phusion/i },   html: /authenticity_token/i },
  // Sunucu
  { name: "Nginx",       category: "Sunucu",     headers: { "server": /nginx/i },            html: null },
  { name: "Apache",      category: "Sunucu",     headers: { "server": /apache/i },           html: null },
  { name: "IIS",         category: "Sunucu",     headers: { "server": /iis/i },              html: null },
  { name: "LiteSpeed",   category: "Sunucu",     headers: { "server": /litespeed/i },        html: null },
  // CDN / Cloud
  { name: "Cloudflare",  category: "CDN",        headers: { "server": /cloudflare/i },       html: null },
  { name: "AWS CloudFront", category: "CDN",     headers: { "via": /cloudfront/i },          html: null },
  { name: "Fastly",      category: "CDN",        headers: { "x-served-by": /cache/i },       html: null },
  // Analitik
  { name: "Google Analytics", category: "Analitik", headers: {},                             html: /gtag\(|ga\.js|analytics\.js/i },
  { name: "Hotjar",      category: "Analitik",   headers: {},                                html: /hotjar/i },
  // Güvenlik
  { name: "reCAPTCHA",   category: "Güvenlik",   headers: {},                                html: /recaptcha/i },
];

app.get('/api/tech', async (req, res) => {
    const subdomain = req.query.subdomain as string;
    if (!subdomain || !isValidDomain(subdomain)) {
        return res.status(400).json({ error: 'Geçerli bir subdomain gerekli' });
    }

    // SSRF koruması: özel ağa çözülen host fetch edilmez
    const hostIp = await getPublicHostIp(subdomain);
    if (!hostIp) {
        return res.json([]);
    }

    try {
        const fetch = (await import('node-fetch')).default;
        // 5 saniye timeout ile fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`https://${subdomain}`, { 
            signal: controller.signal as any,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        clearTimeout(timeoutId);
        
        const html = await response.text();
        const headersObj: Record<string, string> = {};
        response.headers.forEach((val, key) => {
            headersObj[key.toLowerCase()] = val;
        });

        const detected = TECH_SIGNATURES.filter(tech => {
            const headerMatch = Object.entries(tech.headers).some(
                ([key, pattern]) => pattern.test(headersObj[key.toLowerCase()] || '')
            );
            const htmlMatch = tech.html ? tech.html.test(html) : false;
            return headerMatch || htmlMatch;
        });

        res.json(detected.map(t => ({ name: t.name, category: t.category })));
    } catch (err) {
        // Hataları sessizce geç
        res.json([]);
    }
});

// Basic health check for Render
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Advanced Analysis Endpoints
app.get('/api/advanced', async (req, res) => {
    const subdomain = req.query.subdomain as string;
    if (!subdomain || !isValidDomain(subdomain)) {
        return res.status(400).json({ error: 'Geçerli bir subdomain gerekli' });
    }

    // SSRF koruması: özel ağa çözülen hosta TLS/HTTP bağlantısı kurulmaz
    const hostIp = await getPublicHostIp(subdomain);
    if (!hostIp) {
        return res.json({ ssl: null, advanced: null });
    }

    const sslInfo = await new Promise((resolve) => {
        const socket = tls.connect(443, subdomain, { servername: subdomain, rejectUnauthorized: false }, () => {
            const cert = socket.getPeerCertificate();
            socket.destroy();
            if (!cert || Object.keys(cert).length === 0) return resolve(null);
            
            const validTo = new Date(cert.valid_to);
            const now = new Date();
            const daysLeft = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            
            let grade = 'F';
            if (daysLeft >= 30) grade = 'A';
            else if (daysLeft >= 7) grade = 'B';
            else if (daysLeft >= 0) grade = 'C';
            
            const isSelfSigned = cert.issuer?.CN === cert.subject?.CN;
            if (isSelfSigned) grade = 'F';
            
            resolve({
                valid: daysLeft >= 0 && !isSelfSigned,
                daysLeft,
                issuer: cert.issuer?.O || cert.issuer?.CN || 'Bilinmiyor',
                isSelfSigned,
                grade
            });
        });
        socket.on('error', () => resolve(null));
        socket.setTimeout(3000, () => { socket.destroy(); resolve(null); });
    });

    const headerWafInfo = await new Promise((resolve) => {
        const reqObj = https.request(`https://${subdomain}`, { method: 'HEAD', timeout: 3500, rejectUnauthorized: false }, (response) => {
            const headers = response.headers;
            
            let score = 0;
            const missing: string[] = [];
            
            if (headers['strict-transport-security']) score += 20; else missing.push('HSTS');
            if (headers['content-security-policy']) score += 20; else missing.push('CSP');
            if (headers['x-frame-options']) score += 20; else missing.push('X-Frame-Options');
            if (headers['x-content-type-options']) score += 15; else missing.push('X-Content-Type-Options');
            if (headers['referrer-policy']) score += 15; else missing.push('Referrer-Policy');
            if (headers['permissions-policy']) score += 5; else missing.push('Permissions-Policy');
            if (headers['x-xss-protection']) score += 5; else missing.push('X-XSS-Protection');
            
            let secGrade = 'F';
            if (score >= 80) secGrade = 'A';
            else if (score >= 60) secGrade = 'B';
            else if (score >= 40) secGrade = 'C';
            else if (score >= 20) secGrade = 'D';

            let waf = null;
            const serverHdr = (headers['server'] || '').toLowerCase();
            if (serverHdr.includes('cloudflare') || headers['cf-ray']) waf = 'Cloudflare';
            else if (headers['x-sucuri-id']) waf = 'Sucuri';
            else if (headers['x-iinfo']) waf = 'Imperva';
            else if (headers['x-fastly-request-id']) waf = 'Fastly';
            else if (headers['x-azure-ref']) waf = 'Azure';
            else if (headers['x-akamai-transformed']) waf = 'Akamai';

            resolve({
                security: { score, grade: secGrade, missing },
                waf: waf ? { detected: true, name: waf } : { detected: false }
            });
        });
        reqObj.on('error', () => resolve(null));
        reqObj.on('timeout', () => { reqObj.destroy(); resolve(null); });
        reqObj.end();
    });

    res.json({ ssl: sslInfo, advanced: headerWafInfo });
});

app.get('/api/email-sec', async (req, res) => {
    const domain = req.query.domain as string;
    if (!domain || !isValidDomain(domain)) {
        return res.status(400).json({ error: 'Geçerli bir domain gerekli' });
    }

    let spf = { hasRecord: false, hasMinusAll: false };
    let dmarc = { hasRecord: false, policy: 'none' };
    let dkim = { hasRecord: false };

    try {
        const txtRecords = await dns.promises.resolveTxt(domain);
        for (const record of txtRecords) {
            const txt = record.join('');
            if (txt.includes('v=spf1')) {
                spf.hasRecord = true;
                if (txt.includes('-all')) spf.hasMinusAll = true;
            }
        }
    } catch (e) {}

    try {
        const dmarcRecords = await dns.promises.resolveTxt(`_dmarc.${domain}`);
        for (const record of dmarcRecords) {
            const txt = record.join('');
            if (txt.includes('v=DMARC1')) {
                dmarc.hasRecord = true;
                if (txt.includes('p=reject')) dmarc.policy = 'reject';
                else if (txt.includes('p=quarantine')) dmarc.policy = 'quarantine';
                else dmarc.policy = 'none';
            }
        }
    } catch (e) {}

    const selectors = ['default', 'google', 'mail', 'selector1'];
    for (const sel of selectors) {
        try {
            const dkimRecords = await dns.promises.resolveTxt(`${sel}._domainkey.${domain}`);
            if (dkimRecords && dkimRecords.length > 0) {
                dkim.hasRecord = true;
                break;
            }
        } catch (e) {}
    }

    let score = 0;
    if (spf.hasRecord) score += 20;
    if (spf.hasMinusAll) score += 20;
    if (dmarc.hasRecord) score += 20;
    if (dmarc.policy === 'reject' || dmarc.policy === 'quarantine') score += 20;
    if (dkim.hasRecord) score += 20;

    let grade = 'F';
    if (score >= 80) grade = 'A';
    else if (score >= 60) grade = 'B';
    else if (score >= 40) grade = 'C';
    else if (score >= 20) grade = 'D';

    res.json({ spf, dmarc, dkim, score, grade });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
