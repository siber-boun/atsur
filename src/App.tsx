import { useState, useEffect, useEffectEvent, useRef } from 'react';
import './index.css';

type Step = 'login' | 'dashboard';

interface SubdomainData {
  subdomain: string;
  source: string;
  sources?: string[];
  ip?: string;
  ips?: string[];
  status?: 'live' | 'dead' | 'private' | 'error' | 'unknown';
  cname?: string[];
  wildcardMatch?: boolean;
  discoveredBy?: 'passive' | 'brute' | 'permutation' | 'axfr' | 'cert-san';
}

interface SourceStatus {
  id: string;
  label: string;
  ok: boolean;
  count: number;
  ms: number;
  skipped?: 'no-key' | 'timeout' | 'error' | 'disabled' | 'rate-limited';
}

interface ScanMeta {
  sources: SourceStatus[];
  wildcard: { isWildcard: boolean; confidence: 'high' | 'low'; wildcardIps: string[] };
  truncatedValidation: boolean;
  bruteSkipped?: string;
  bruteCount?: number;
}

interface AdvancedRun {
  running: boolean;
  stage: string;
  completed: number;
  total: number;
  error?: string;
}

interface ServiceRun {
  running: boolean;
  stage: string;
  completed: number;
  total: number;
  failed: number;
  error?: string;
}

interface PortInfo {
  port: number;
  status: number | string;
  protocol: string;
  transport?: 'tcp' | 'udp';
  service?: string;
  isWeb?: boolean;
  isWebCandidate?: boolean;
  verificationSource?: 'server' | 'render' | 'browserless' | 'browser';
  redirected?: boolean;
  finalHost?: string;
}

interface ProbeError {
  port: number;
  protocol: 'http:' | 'https:';
  code: string;
}

interface TechInfo {
  name: string;
  category: string;
  version?: string;
  confidence?: number;
  sources?: Array<'opentechalyzer' | 'builtin' | 'browserless-live' | 'shodan'>;
  evidence?: string[];
  observedAt?: string;
  passive?: boolean;
}

interface SubdomainDetail {
  ip: string | null;
  ports?: PortInfo[];
  isCloudflare?: boolean;
  analyzing?: boolean;
  technologies?: TechInfo[];
  techAnalyzing?: boolean;
  ssl?: any;
  security?: any;
  waf?: any;
  cookies?: any[];
  cors?: any;
  probeErrors?: ProbeError[];
  evidence?: {
    source: 'render-live' | 'browserless-live';
    status?: number;
    protocol?: 'http:' | 'https:';
    server?: string;
    redirectCount?: number;
    redirected?: boolean;
    finalTarget?: string;
    externalRedirect?: { target: string; status?: number };
  };
  tlsVerification?: { verified: boolean; source: 'render-live' | 'browserless-live' };
  browserlessError?: string;
  advancedAnalyzing?: boolean;
}

interface EmailSecurityInfo {
  spf: { hasRecord: boolean, hasMinusAll: boolean, all?: string | null, lookupCount?: number, permerror?: boolean, permerrorReason?: string, truncated?: boolean };
  dmarc: { hasRecord: boolean, policy: string, percentage?: number, aggregateReports?: boolean, forensicReports?: boolean, adkim?: string, aspf?: string };
  dkim: { hasRecord: boolean };
  dnssec?: boolean | null;
  mtaSts?: { hasRecord: boolean, mode?: string, policyFetched: boolean };
  tlsRpt?: { hasRecord: boolean };
  caa?: { hasRecord: boolean, issuers: string[] };
  score: number;
  grade: string;
}

const httpStatusLabel = (status?: number) => {
  if (status === undefined) return 'Yanıt alınamadı';
  const labels: Record<number, string> = {
    200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
    301: 'Moved', 302: 'Found', 303: 'See Other', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 429: 'Too Many Requests',
    500: 'Server Error', 502: 'Bad Gateway', 503: 'Unavailable', 504: 'Gateway Timeout'
  };
  return labels[status] || 'HTTP yanıtı';
};

const httpStatusTone = (status?: number) => {
  if (status === undefined) return 'unknown';
  if (status >= 200 && status < 300) return 'success';
  if (status >= 300 && status < 400) return 'info';
  if (status >= 400 && status < 500) return 'warning';
  return 'danger';
};

const designProcessPhases = [
  {
    eyebrow: '01 · Referans',
    title: 'Figma Make tasarımı incelendi',
    description: 'Boş ekran ve sonuç ekranı ayrı durumlar olarak açıldı. Yerleşim, katman ilişkileri ve etkileşim dili canlı prototip üzerinden okundu.',
    detail: 'OSINT Dashboard · Figma Make',
    metric: '2 ana durum',
  },
  {
    eyebrow: '02 · Sistem',
    title: 'Görsel tokenlar çıkarıldı',
    description: 'Koyu operasyon konsolu paleti, teknik tipografi rolleri ve ince HUD çizgileri ortak tasarım sistemine dönüştürüldü.',
    detail: 'Inter + JetBrains Mono',
    metric: '6 renk tokenı',
  },
  {
    eyebrow: '03 · Yerleşim',
    title: 'Ekran görevlerine göre ayrıldı',
    description: 'Üst çubuk hızlı domain girişine, sol panel yalnızca hedeflere, geniş sağ yüzey ise analiz sonuçlarına ayrıldı.',
    detail: 'Komut · Hedefler · Analiz',
    metric: '3 çalışma alanı',
  },
  {
    eyebrow: '04 · Akış',
    title: 'Mevcut ürün mantığı korundu',
    description: 'Domain ekleme, localStorage kaydı, hedef seçimi, API taraması ve sonuç detayları yeni arayüze dokunmadan taşındı.',
    detail: 'Ekle → Solda göster → Seç → Analiz et',
    metric: 'Aynı veri akışı',
  },
  {
    eyebrow: '05 · Hareket',
    title: 'Animasyonlar anlamlı durumlara bağlandı',
    description: 'Radar hedef bekleme durumunu, fade-in yeni sonuçları, pulse ise aktif sistem ve tarama sinyalini anlatıyor.',
    detail: 'Ping 3 sn · Fade 300 ms · Pulse 2 sn',
    metric: '3 hareket ilkesi',
  },
  {
    eyebrow: '06 · Doğrulama',
    title: 'Üretim ve responsive kontroller tamamlandı',
    description: 'Masaüstü ve mobil renderlar karşılaştırıldı; domainin solda görünmesi, sonuçların sağda açılması ve yatay taşma kontrol edildi.',
    detail: 'React 19 · TypeScript · CSS',
    metric: 'Build başarılı',
  },
] as const;

function DesignProcessView() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const phase = designProcessPhases[activeStep];

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setActiveStep(current => (current + 1) % designProcessPhases.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  const restart = () => {
    setActiveStep(0);
    setIsPlaying(true);
  };

  return (
    <div className="process-view">
      <header className="process-header">
        <div className="process-brand">
          <span className="process-brand-mark">F</span>
          <span>FIGMA <i>→</i> REACT</span>
        </div>
        <div className="process-recording"><i></i> Kayıt sunumu</div>
        <div className="process-controls">
          <button type="button" onClick={() => setIsPlaying(value => !value)}>{isPlaying ? 'Durdur' : 'Devam et'}</button>
          <button type="button" onClick={restart}>Baştan oynat</button>
        </div>
      </header>

      <main className="process-main">
        <aside className="process-timeline" aria-label="Tasarım süreci aşamaları">
          <div className="process-intro">
            <span>Tasarım günlüğü</span>
            <h1>OSINT arayüzü nasıl oluştu?</h1>
            <p>Figma referansından çalışan ürüne uzanan uygulama süreci.</p>
          </div>
          <ol>
            {designProcessPhases.map((item, index) => (
              <li key={item.eyebrow} className={index === activeStep ? 'is-current' : index < activeStep ? 'is-done' : ''}>
                <button type="button" onClick={() => { setActiveStep(index); setIsPlaying(false); }}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <b>{item.title}</b>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <section className="process-stage" aria-live="polite">
          <div className="process-stage-grid" aria-hidden="true"></div>
          <div className="process-step-copy" key={phase.eyebrow}>
            <span>{phase.eyebrow}</span>
            <h2>{phase.title}</h2>
            <p>{phase.description}</p>
            <div className="process-facts">
              <div><small>Teknik not</small><strong>{phase.detail}</strong></div>
              <div><small>Çıktı</small><strong>{phase.metric}</strong></div>
            </div>
          </div>

          <div className={`process-visual process-visual-${activeStep + 1}`} key={`visual-${activeStep}`} aria-hidden="true">
            <div className="process-signal"><i></i></div>
            {activeStep === 0 && <><div className="reference-frame"><span>FIGMA MAKE</span><b>OSINT Dashboard</b><small>Empty state + Results state</small></div><div className="reference-scan"></div></>}
            {activeStep === 1 && <><div className="token-colors">{['#080b10','#0d1117','#161b22','#21262d','#7d8590','#00e5d4'].map(color => <i key={color} style={{ background: color }}></i>)}</div><div className="token-type"><b>Inter</b><span>JetBrains Mono</span></div></>}
            {activeStep === 2 && <div className="layout-map"><span>COMMAND BAR</span><i>HEDEFLER</i><b>ANALİZ SONUÇLARI</b><small>STATUS</small></div>}
            {activeStep === 3 && <div className="flow-map"><span>Domain ekle</span><i>→</i><span>Solda göster</span><i>→</i><span>Hedefi seç</span><i>→</i><span>Analiz</span></div>}
            {activeStep === 4 && <div className="motion-map"><span className="motion-radar"></span><b>300 ms</b><i></i><small>ACTIVE</small></div>}
            {activeStep === 5 && <div className="validation-map"><span>DESKTOP <b>✓</b></span><span>MOBILE 390 <b>✓</b></span><span>DOMAIN FLOW <b>✓</b></span><span>BUILD <b>✓</b></span></div>}
          </div>

          <div className="process-progress">
            <span style={{ width: `${((activeStep + 1) / designProcessPhases.length) * 100}%` }}></span>
          </div>
          <div className="process-counter">{String(activeStep + 1).padStart(2, '0')} / {String(designProcessPhases.length).padStart(2, '0')}</div>
        </section>
      </main>
    </div>
  );
}

// User data structure for localStorage
interface UserData {
  domains: string[];
  subdomainsCache: Record<string, SubdomainData[]>;
  subdomainDetailsCache: Record<string, SubdomainDetail>;
  emailSecCache: Record<string, EmailSecurityInfo>;
}

const SINGLE_USER_EMAIL = 'banusencer@yahoo.com';
const SINGLE_USER_PASSWORD = 'Nmtd1881';
const SESSION_KEY = 'osint_session';

function readStoredUsers(): Record<string, UserData> {
  try {
    const raw = localStorage.getItem('osint_users');
    return raw ? JSON.parse(raw) as Record<string, UserData> : {};
  } catch {
    return {};
  }
}

function normalizeCachedDetail(detail: SubdomainDetail): SubdomainDetail {
  const normalized: SubdomainDetail = {
    ...detail,
    analyzing: false,
    techAnalyzing: false,
    advancedAnalyzing: false
  };
  if (detail.technologies !== undefined) {
    normalized.technologies = Array.isArray(detail.technologies) ? detail.technologies : [];
  }
  return normalized;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000,
  parentSignal?: AbortSignal
): Promise<T> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`API isteği başarısız (${response.status})`);
    return await response.json() as T;
  } finally {
    window.clearTimeout(timeoutId);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

async function verifyHttpsFromBrowser(host: string, parentSignal?: AbortSignal): Promise<boolean> {
  // Yalnız keşfedilmiş DNS adlarına, cookiesiz ve gövdesi okunmadan GET yapılır.
  // no-cors, hedef CORS başlığı göndermese bile bağlantı başarısını doğrulamamızı sağlar.
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)) return false;
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) return false;
  parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  const timeoutId = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://${host}/`, {
      method: 'GET',
      mode: 'no-cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      signal: controller.signal
    });
    try { await response.body?.cancel(); } catch { /* opaque yanıtta body kullanılamayabilir */ }
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

function AnalysisWaitIndicator() {
  return (
    <span className="analysis-wait" role="status" aria-label="Render ve pasif kaynaklar kontrol ediliyor">
      <span className="analysis-hourglass" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M6 2h12M6 22h12M7 2v4c0 2.6 2 4.1 5 6-3 1.9-5 3.4-5 6v4M17 2v4c0 2.6-2 4.1-5 6 3 1.9 5 3.4 5 6v4"/></svg>
      </span>
      <span>Render kontrol ediliyor</span>
      <i className="analysis-wait-track" aria-hidden="true"><b></b></i>
    </span>
  );
}

// API Base URL - Local'de /api (Vite proxy üzerinden), Canlıda Render URL'si
// Workers dağıtımında VITE_API_URL tanımlı değilse göreli /api isteği statik
// arayüzün kendisine gider. Canlı Render backend'i güvenli varsayılandır.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://osint-zgg4.onrender.com';

function App() {
  const hasStoredSession = sessionStorage.getItem(SESSION_KEY) === SINGLE_USER_EMAIL;
  const [step, setStep] = useState<Step>(hasStoredSession ? 'dashboard' : 'login');
  
  // Auth states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [loggedInUser, setLoggedInUser] = useState<string | null>(hasStoredSession ? SINGLE_USER_EMAIL : null);
  const [userDataReady, setUserDataReady] = useState(false);
  
  // Dashboard states
  const [domainInput, setDomainInput] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [subdomains, setSubdomains] = useState<Record<string, SubdomainData[]>>({});
  const [subdomainDetails, setSubdomainDetails] = useState<Record<string, SubdomainDetail>>({});
  const [emailSecurity, setEmailSecurity] = useState<Record<string, EmailSecurityInfo>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [wakingUp, setWakingUp] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<Record<string, string>>({});
  const [scanMeta, setScanMeta] = useState<Record<string, ScanMeta>>({});
  const [advancedRuns, setAdvancedRuns] = useState<Record<string, AdvancedRun>>({});
  const [serviceRuns, setServiceRuns] = useState<Record<string, ServiceRun>>({});
  const [scopeVisibleForDomain, setScopeVisibleForDomain] = useState<string | null>(null);
  const serviceAbortRef = useRef<{ domain: string; controller: AbortController } | null>(null);
  const advancedBusyRef = useRef(new Set<string>());
  const autoAnalysisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoAnalysis, setAutoAnalysis] = useState<{
    domain: string;
    stage: 'waiting-services' | 'services' | 'waiting-advanced' | 'done';
    startsAt?: number;
  } | null>(null);

  const [autoCountdown, setAutoCountdown] = useState(5);

  const clearAutoAnalysisTimer = () => {
    if (autoAnalysisTimerRef.current !== null) {
      clearTimeout(autoAnalysisTimerRef.current);
      autoAnalysisTimerRef.current = null;
    }
  };
  
  const isLoginValid = email.trim().length > 0 && password.length > 0;
  
  // Sıkı domain doğrulaması (Sadece harf, rakam, tire ve nokta)
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  const isDomainValid = domainRegex.test(domainInput);

  // Load user data on login
  useEffect(() => {
    setUserDataReady(false);
    if (loggedInUser) {
      const users = readStoredUsers();
      const userData = users[loggedInUser] || {
        domains: [],
        subdomainsCache: {},
        subdomainDetailsCache: {},
        emailSecCache: {}
      };
      if (!users[loggedInUser]) {
        users[loggedInUser] = userData;
        localStorage.setItem('osint_users', JSON.stringify(users));
      }
      setDomains(userData.domains || []);
      setSubdomains(userData.subdomainsCache || {});
      const cachedDetails = userData.subdomainDetailsCache || {};
      setSubdomainDetails(Object.fromEntries(
        Object.entries(cachedDetails).map(([subdomain, detail]) => [subdomain, normalizeCachedDetail(detail)])
      ));
      setEmailSecurity(userData.emailSecCache || {});
      setUserDataReady(true);
    } else {
      setDomains([]);
      setSelectedDomain(null);
      setSubdomains({});
      setSubdomainDetails({});
      setEmailSecurity({});
    }
  }, [loggedInUser]);

  // Save domain list and caches when they change
  useEffect(() => {
    if (loggedInUser && userDataReady) {
      const users = readStoredUsers();
      
      if (users[loggedInUser]) {
        users[loggedInUser].domains = domains;
        users[loggedInUser].subdomainsCache = subdomains;
        users[loggedInUser].subdomainDetailsCache = Object.fromEntries(
          Object.entries(subdomainDetails).map(([subdomain, detail]) => [subdomain, normalizeCachedDetail(detail)])
        );
        users[loggedInUser].emailSecCache = emailSecurity;
        localStorage.setItem('osint_users', JSON.stringify(users));
      }
    }
  }, [domains, subdomains, subdomainDetails, emailSecurity, loggedInUser, userDataReady]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (email.trim().toLowerCase() !== SINGLE_USER_EMAIL || password !== SINGLE_USER_PASSWORD) {
      setAuthError('Hatalı e-posta veya şifre.');
      return;
    }

    const users = readStoredUsers();
    if (!users[SINGLE_USER_EMAIL]) {
      users[SINGLE_USER_EMAIL] = {
        domains: [],
        subdomainsCache: {},
        subdomainDetailsCache: {},
        emailSecCache: {}
      };
      localStorage.setItem('osint_users', JSON.stringify(users));
    }

    sessionStorage.setItem(SESSION_KEY, SINGLE_USER_EMAIL);
    setLoggedInUser(SINGLE_USER_EMAIL);
    setStep('dashboard');
  };

  const handleLogout = () => {
    clearAutoAnalysisTimer();
    setAutoAnalysis(null);
    serviceAbortRef.current?.controller.abort();
    serviceAbortRef.current = null;
    sessionStorage.removeItem(SESSION_KEY);
    setLoggedInUser(null);
    setEmail('');
    setPassword('');
    setStep('login');
  };

  const handleAddDomain = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDomainValid && !domains.includes(domainInput)) {
      setDomains([...domains, domainInput]);
      setDomainInput('');
    }
  };

  const handleDeleteDomain = (domainToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const newDomains = domains.filter(d => d !== domainToDelete);
    setDomains(newDomains);
    
    const newSubdomains = { ...subdomains };
    delete newSubdomains[domainToDelete];
    setSubdomains(newSubdomains);
    
    if (selectedDomain === domainToDelete) {
      clearAutoAnalysisTimer();
      setAutoAnalysis(null);
      setSelectedDomain(null);
    }
    
    if (loggedInUser) {
        const users = readStoredUsers();
        if (users[loggedInUser]) {
            users[loggedInUser].domains = newDomains;
            users[loggedInUser].subdomainsCache = newSubdomains;
            localStorage.setItem('osint_users', JSON.stringify(users));
        }
    }
  };

  const mergeSubdomainResults = (passive: SubdomainData[], brute: SubdomainData[]): SubdomainData[] => {
    const merged = new Map<string, SubdomainData>();
    for (const item of [...passive, ...brute]) {
      const current = merged.get(item.subdomain);
      if (!current) {
        merged.set(item.subdomain, item);
        continue;
      }
      const sources = [...new Set([...(current.sources || []), ...(item.sources || [])])];
      merged.set(item.subdomain, {
        ...current,
        ...item,
        source: [...new Set([current.source, item.source].filter(Boolean))].join(' + '),
        sources,
        ips: [...new Set([...(current.ips || []), ...(item.ips || [])])],
        status: current.status === 'live' || item.status === 'live' ? 'live' : item.status || current.status
      });
    }
    return [...merged.values()].sort((a, b) => a.subdomain.localeCompare(b.subdomain));
  };

  const fetchSubdomains = async (domain: string, forceRefresh: boolean = false) => {
    if (!forceRefresh && subdomains[domain] && subdomains[domain].length > 0) {
        // A failed refresh must not block automation when cached results are selected again.
        setError(prev => ({ ...prev, [domain]: '' }));
        return;
    }
    
    setLoading(prev => ({ ...prev, [domain]: true }));
    setError(prev => ({ ...prev, [domain]: '' }));
    setWakingUp(prev => ({ ...prev, [domain]: false }));

    // Render uyku modundan uyanıyorsa 3 saniye sonra kullanıcıyı bilgilendir
    const wakeUpTimer = setTimeout(() => {
        setWakingUp(prev => ({ ...prev, [domain]: true }));
    }, 3000);
    
    try {
      const raw = await fetchJsonWithTimeout<any>(`${API_BASE_URL}/api/scan?domain=${domain}`, {}, 60000);
      clearTimeout(wakeUpTimer);

      // Faz 5'ten itibaren backend tarama metadatasıyla birlikte bir nesne döner;
      // eski dizi cevabı da önbellekteki/geri alınmış sürümler için desteklenir.
      const list: SubdomainData[] = Array.isArray(raw) ? raw : (Array.isArray(raw?.results) ? raw.results : []);
      setSubdomains(prev => ({ ...prev, [domain]: list }));
      if (!Array.isArray(raw)) {
        setScanMeta(prev => ({
          ...prev,
          [domain]: {
            sources: raw.sources || [],
            wildcard: raw.wildcard,
            truncatedValidation: Boolean(raw.truncatedValidation)
          }
        }));
      }
      
    } catch (err: any) {
      clearTimeout(wakeUpTimer);
      setError(prev => ({ ...prev, [domain]: 'Subdomainler alınırken bir hata oluştu veya servise geçici olarak ulaşılamıyor.' }));
    } finally {
      clearTimeout(wakeUpTimer);
      setLoading(prev => ({ ...prev, [domain]: false }));
      setWakingUp(prev => ({ ...prev, [domain]: false }));
    }
  };

  const handleDomainClick = (domain: string) => {
    clearAutoAnalysisTimer();
    setAutoCountdown(5);
    setAutoAnalysis({
      domain,
      stage: advancedBusyRef.current.has(domain) ? 'done' :
        serviceAbortRef.current?.domain === domain ? 'services' : 'waiting-services'
    });
    setSelectedDomain(domain);
    setScopeVisibleForDomain(null);
    fetchSubdomains(domain);
  };

  const handleAnalyzeSubdomain = async (sub: string, signal?: AbortSignal): Promise<boolean> => {
    setSubdomainDetails(prev => ({ ...prev, [sub]: { ...prev[sub], analyzing: true } }));

    const analysisResult = await Promise.allSettled([fetchJsonWithTimeout<{ ip?: string | null; ports?: PortInfo[]; isCloudflare?: boolean; probeErrors?: ProbeError[] }>(
      `${API_BASE_URL}/api/analyze?domain=${sub}`,
      {},
      // 45 port taraması, özellikle Render'ın soğuk başlangıcı veya yavaş hedeflerde
      // 25 saniyeyi aşabilir. Bu istek için daha geniş bir bütçe verilir.
      45000,
      signal
    )]).then(([result]) => result);

    const analysis = analysisResult.status === 'fulfilled' ? analysisResult.value : null;
    let ports: PortInfo[] = (Array.isArray(analysis?.ports) ? analysis.ports : []).map(port => ({
      ...port,
      verificationSource: port.verificationSource || 'server' as const
    }));
    const serverVerifiedHttps = ports.some(port => port.isWeb === true && port.protocol === 'https:');
    const browserHttpsVerified = !serverVerifiedHttps && !signal?.aborted
      ? await verifyHttpsFromBrowser(sub, signal)
      : false;

    if (browserHttpsVerified) {
      const browserPort: PortInfo = {
        port: 443,
        status: 'Tarayıcıdan doğrulandı',
        protocol: 'https:',
        transport: 'tcp',
        service: 'HTTPS',
        isWeb: true,
        isWebCandidate: true,
        verificationSource: 'browser'
      };
      const existing443 = ports.findIndex(port => port.port === 443);
      if (existing443 >= 0) ports = ports.map((port, index) => index === existing443 ? { ...port, ...browserPort } : port);
      else ports = [...ports, browserPort].sort((a, b) => a.port - b.port);
    }

    // Tarayıcı hedefin dışarıdan erişilebilir olduğunu doğruladı. Bu açık sinyal
    // üzerine yalnız bu hedef için Browserless fallback'ini değerlendiririz.
    // Normal /api/advanced çağrıları Browserless çalıştırmaz.
    let browserlessDetails: Partial<SubdomainDetail> | undefined;
    if (browserHttpsVerified && !signal?.aborted) {
      try {
        const advanced = await fetchJsonWithTimeout<{
          ssl?: any; advanced?: { security?: any; waf?: any; cookies?: any[] } | null;
          technologies?: TechInfo[]; evidence?: SubdomainDetail['evidence'];
          tlsVerification?: SubdomainDetail['tlsVerification']; browserlessError?: string;
        }>(`${API_BASE_URL}/api/advanced?subdomain=${encodeURIComponent(sub)}&browserVerified=1`, {}, 45000, signal);
        browserlessDetails = {
          ssl: advanced.ssl,
          security: advanced.advanced?.security,
          waf: advanced.advanced?.waf,
          cookies: advanced.advanced?.cookies,
          technologies: advanced.technologies,
          evidence: advanced.evidence,
          tlsVerification: advanced.tlsVerification,
          browserlessError: advanced.browserlessError
        };
      } catch {
        // Tarayıcı doğrulaması görünür kalır; Browserless ayrıntısı sonraki
        // kullanıcı isteğinde tekrar denenebilir.
      }
    }

    setSubdomainDetails(prev => ({
      ...prev,
      [sub]: {
        ...prev[sub],
        ...(analysis ? {
          ip: analysis.ip ?? null,
          ports,
          isCloudflare: Boolean(analysis.isCloudflare),
          probeErrors: Array.isArray(analysis.probeErrors) ? analysis.probeErrors : []
        } : browserHttpsVerified ? {
          ports
        } : {}),
        ...(browserlessDetails || {}),
        analyzing: false,
        techAnalyzing: false
      }
    }));

    return analysisResult.status === 'fulfilled' || browserHttpsVerified;
  };

  const handleAnalyzeAll = async () => {
      if (!selectedDomain || !subdomains[selectedDomain]) return;
      const domain = selectedDomain;
      if (advancedBusyRef.current.has(domain)) return;
      clearAutoAnalysisTimer();
      if (serviceAbortRef.current?.domain === domain) {
        setAutoAnalysis({ domain, stage: 'done' });
        serviceAbortRef.current?.controller.abort();
        return;
      }

      setAutoAnalysis({ domain, stage: 'services' });
      serviceAbortRef.current?.controller.abort();
      const controller = new AbortController();
      serviceAbortRef.current = { domain, controller };
      const targets = [...new Set(subdomains[domain]
        .filter(item => typeof item === 'string' || (
          item.status !== 'dead' && item.status !== 'private' && !item.wildcardMatch
        ))
        .map(item => typeof item === 'string' ? item : item.subdomain)
        .filter(subdomain => !subdomain.split('.').some(label => label.startsWith('_'))))];

      setServiceRuns(prev => ({
        ...prev,
        [domain]: { running: true, stage: '45 portta servisler kontrol ediliyor', completed: 0, total: targets.length, failed: 0 }
      }));

      let cursor = 0;
      let completed = 0;
      let failed = 0;
      const worker = async () => {
        while (cursor < targets.length && !controller.signal.aborted) {
          const sub = targets[cursor++];
          const ok = await handleAnalyzeSubdomain(sub, controller.signal);
          completed += 1;
          if (!ok) failed += 1;
          setServiceRuns(prev => ({
            ...prev,
            [domain]: {
              running: !controller.signal.aborted,
              stage: controller.signal.aborted ? 'Servis taraması iptal edildi' : '45 portta servisler kontrol ediliyor',
              completed,
              total: targets.length,
              failed
            }
          }));
        }
      };

      try {
        // Free Render üzerinde üç ağır port taraması aynı anda zaman aşımına yaklaşabiliyor.
        // İki işçi, hedef başına daha kararlı sonuç verirken arayüzü bloklamaz.
        await Promise.all(Array.from({ length: Math.min(2, targets.length) }, () => worker()));
        const cancelled = controller.signal.aborted;
        setServiceRuns(prev => ({
          ...prev,
          [domain]: {
            running: false,
            stage: cancelled ? 'Servis taraması iptal edildi' : 'Servis Taraması Tamamlandı',
            completed,
            total: targets.length,
            failed,
            ...(cancelled ? { error: 'Tarama kullanıcı tarafından iptal edildi.' } :
              failed ? { error: `${failed} hedef zaman aşımı veya API hatası nedeniyle tamamlanamadı.` } : {})
          }
        }));
        // Schedule the next step from actual completion, never from a progress render.
        setAutoAnalysis(prev => prev?.domain === domain && prev.stage === 'services'
          ? { domain, stage: cancelled ? 'done' : 'waiting-advanced',
              ...(!cancelled ? { startsAt: Date.now() + 5000 } : {}) }
          : prev);
      } finally {
        setSubdomainDetails(prev => Object.fromEntries(
          Object.entries(prev).map(([subdomain, detail]) => [subdomain, {
            ...detail,
            analyzing: false,
            techAnalyzing: false
          }])
        ));
        if (serviceAbortRef.current?.controller === controller) serviceAbortRef.current = null;
      }
  };

  const handleAdvancedAnalysis = async () => {
      if (!selectedDomain) return;
      const domain = selectedDomain;
      if (advancedBusyRef.current.has(domain) || serviceAbortRef.current?.domain === domain) return;
      clearAutoAnalysisTimer();
      setAutoAnalysis({ domain, stage: 'done' });
      advancedBusyRef.current.add(domain);
      setAdvancedRuns(prev => ({ ...prev, [domain]: { running: true, stage: 'Pasif kaynaklar ve DNS doğrulanıyor', completed: 0, total: 0 } }));

      try {
          const scanRaw = await fetchJsonWithTimeout<any>(`${API_BASE_URL}/api/scan?domain=${domain}&validate=1`, {}, 60000);
          let discovered: SubdomainData[] = Array.isArray(scanRaw) ? scanRaw : (scanRaw.results || []);
          const meta: ScanMeta = {
            sources: Array.isArray(scanRaw) ? [] : (scanRaw.sources || []),
            wildcard: Array.isArray(scanRaw) ? { isWildcard: false, confidence: 'low', wildcardIps: [] } : scanRaw.wildcard,
            truncatedValidation: Array.isArray(scanRaw) ? false : Boolean(scanRaw.truncatedValidation)
          };

          setAdvancedRuns(prev => ({ ...prev, [domain]: { running: true, stage: 'Wordlist ve permütasyon DNS taraması', completed: 0, total: 0 } }));
          const seeds = discovered.filter(item => item.status === 'live').slice(0, 30).map(item => item.subdomain);
          try {
            const bruteRaw = await fetchJsonWithTimeout<any>(`${API_BASE_URL}/api/brute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ domain, mode: 'both', seeds })
            }, 60000);
            discovered = mergeSubdomainResults(discovered, bruteRaw.results || []);
            meta.bruteSkipped = bruteRaw.skipped;
            meta.bruteCount = (bruteRaw.results || []).length;
          } catch {
            meta.bruteSkipped = 'timeout';
          }

          setSubdomains(prev => ({ ...prev, [domain]: discovered }));
          setScanMeta(prev => ({ ...prev, [domain]: meta }));

          setAdvancedRuns(prev => ({ ...prev, [domain]: { running: true, stage: 'E-posta ve web güvenliği inceleniyor', completed: 0, total: discovered.length } }));
          const emailPromise = fetchJsonWithTimeout<EmailSecurityInfo>(`${API_BASE_URL}/api/email-sec?domain=${domain}`, {}, 12000)
            .then(data => data && setEmailSecurity(prev => ({ ...prev, [domain]: data })))
            .catch(() => undefined);

          const targets = discovered.filter(item => item.status !== 'dead' && item.status !== 'private' && !item.wildcardMatch);
          let cursor = 0;
          let completed = 0;
          const worker = async () => {
            while (cursor < targets.length) {
              const item = targets[cursor++];
              const sub = item.subdomain;
              setSubdomainDetails(prev => ({ ...prev, [sub]: { ...prev[sub], advancedAnalyzing: true } }));
              try {
                const data = await fetchJsonWithTimeout<any>(`${API_BASE_URL}/api/advanced?subdomain=${sub}`, {}, 45000);
                setSubdomainDetails(prev => ({
                  ...prev,
                  [sub]: {
                    ...prev[sub],
                    ssl: data.ssl,
                    security: data.advanced?.security,
                    waf: data.advanced?.waf,
                    cookies: data.advanced?.cookies,
                    evidence: data.evidence,
                    tlsVerification: data.tlsVerification,
                    technologies: Array.isArray(data.technologies) ? data.technologies : [],
                    advancedAnalyzing: false
                  }
                }));
              } catch {
                setSubdomainDetails(prev => ({ ...prev, [sub]: { ...prev[sub], advancedAnalyzing: false } }));
              }
              completed += 1;
              setAdvancedRuns(prev => ({ ...prev, [domain]: { running: true, stage: 'E-posta ve web güvenliği inceleniyor', completed, total: targets.length } }));
            }
          };
          await Promise.all(Array.from({ length: Math.min(4, targets.length) }, () => worker()));
          await emailPromise;
          setAdvancedRuns(prev => ({ ...prev, [domain]: { running: false, stage: 'Kapsamlı Analiz Tamamlandı', completed: targets.length, total: targets.length } }));
      } catch (err) {
          const message = err instanceof Error ? err.message : 'Gelişmiş analiz tamamlanamadı';
          setAdvancedRuns(prev => ({ ...prev, [domain]: { running: false, stage: 'Analiz durdu', completed: 0, total: 0, error: message } }));
      } finally {
          advancedBusyRef.current.delete(domain);
      }
  };

  // Effect Events keep delayed actions on the latest selected domain and results.
  const startAutomaticAnalysis = useEffectEvent((stage: 'waiting-services' | 'waiting-advanced') => {
    if (!selectedDomain || autoAnalysis?.domain !== selectedDomain || autoAnalysis.stage !== stage) return;
    if (advancedBusyRef.current.has(selectedDomain) || serviceAbortRef.current?.domain === selectedDomain) return;
    if (stage === 'waiting-services') void handleAnalyzeAll();
    else void handleAdvancedAnalysis();
  });

  const selectedSubdomainsReady = Boolean(selectedDomain && subdomains[selectedDomain]?.length &&
    !loading[selectedDomain] && !error[selectedDomain]);
  const automaticStage = autoAnalysis?.domain === selectedDomain ? autoAnalysis.stage : undefined;
  const automaticStartsAt = autoAnalysis?.domain === selectedDomain ? autoAnalysis.startsAt : undefined;

  useEffect(() => {
    if (step !== 'dashboard' || !userDataReady || !selectedDomain || !selectedSubdomainsReady ||
      automaticStage !== 'waiting-services' || automaticStartsAt !== undefined) return;
    setAutoAnalysis(prev => prev?.domain === selectedDomain && prev.stage === 'waiting-services'
      ? { ...prev, startsAt: Date.now() + 5000 } : prev);
  }, [step, userDataReady, selectedDomain, selectedSubdomainsReady, automaticStage, automaticStartsAt]);

  useEffect(() => {
    if (step !== 'dashboard' || !userDataReady || !selectedDomain || !selectedSubdomainsReady ||
      automaticStartsAt === undefined ||
      (automaticStage !== 'waiting-services' && automaticStage !== 'waiting-advanced')) return;

    const stage = automaticStage;
    const updateCountdown = () => setAutoCountdown(Math.max(0, Math.ceil((automaticStartsAt - Date.now()) / 1000)));
    updateCountdown();
    const countdown = setInterval(updateCountdown, 200);
    const timer = setTimeout(() => {
      autoAnalysisTimerRef.current = null;
      startAutomaticAnalysis(stage);
    }, Math.max(0, automaticStartsAt - Date.now()));
    autoAnalysisTimerRef.current = timer;
    return () => {
      clearInterval(countdown);
      clearTimeout(timer);
      if (autoAnalysisTimerRef.current === timer) autoAnalysisTimerRef.current = null;
    };
  }, [step, userDataReady, selectedDomain, selectedSubdomainsReady, automaticStage, automaticStartsAt]);

  const getScopeOutput = (domain: string): string => {
      if (!subdomains[domain]) return '';
      
      const validSubdomains: string[] = [];

      const subs = subdomains[domain];
      
      subs.forEach(item => {
          const isLegacyString = typeof item === 'string';
          const sub = isLegacyString ? (item as string) : item.subdomain;
          const detail = subdomainDetails[sub];

          // Kapsama yalnız erişilebilir HTTP/S uygulamaları alınır. Subdomain adı
          // filtrelenmez; mail.*, webmail.* ve benzeri adlarda yönetim paneli olabilir.
          // Tek başına HTTP
          // 301 yönlendirmesi yeterli değildir; HTTPS hedefi erişilemiyorsa scope'a eklenmez.
          if (detail && detail.ports && detail.ports.length > 0) {
              const hasActiveWeb = detail.ports.some(p =>
                (p.isWeb === true || p.protocol === 'http:' || p.protocol === 'https:') &&
                (p.protocol === 'https:' || !String(p.status).startsWith('3'))
              );
              if (hasActiveWeb) {
                  validSubdomains.push(sub);
              }
          }
      });

      return [...new Set(validSubdomains)].sort().join(', ');
  };

  const scopeOutput = selectedDomain ? getScopeOutput(selectedDomain) : '';

  const handleGenerateScope = () => {
      if (!selectedDomain || !subdomains[selectedDomain]) return;
      setScopeVisibleForDomain(selectedDomain);
  };

  if (new URLSearchParams(window.location.search).get('view') === 'design-process') {
    return <DesignProcessView />;
  }

  if (step === 'login') {
    return (
      <div className="login-container">
        <div className="card login-card fade-in">
          <div className="icon-container">
            <div className="icon">
              <svg xmlns="http://www.w3.org/0000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            </div>
          </div>
          <div className="header">
            <h1>BUSIBER OSINT</h1>
            <p>Yetkili kullanıcı hesabıyla sisteme giriş yapın</p>
          </div>
          
          {authError && (
            <div className="auth-error">
              {authError}
            </div>
          )}
          
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="email">E-posta Adresi</label>
              <input 
                type="email" 
                id="email" 
                className="form-input" 
                placeholder="isim@sirket.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Şifre</label>
              <input 
                type="password" 
                id="password" 
                className="form-input" 
                placeholder="•••••••• (Min 6 karakter)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn" disabled={!isLoginValid}>
              Giriş Yap
            </button>
          </form>
        </div>
      </div>
    );
  }

  const selectedResults = selectedDomain ? (subdomains[selectedDomain] || []) : [];
  const activeMeta = selectedDomain ? scanMeta[selectedDomain] : undefined;
  const activeRun = selectedDomain ? advancedRuns[selectedDomain] : undefined;
  const activeServiceRun = selectedDomain ? serviceRuns[selectedDomain] : undefined;
  const liveCount = selectedResults.filter(item => typeof item !== 'string' && item.status === 'live').length;
  const unknownCount = selectedResults.filter(item => typeof item !== 'string' && item.status === 'unknown').length;
  const healthySources = activeMeta?.sources.filter(source => source.ok).length || 0;
  const selectedDetails = selectedResults.map(item => {
    const sub = typeof item === 'string' ? item : item.subdomain;
    return subdomainDetails[sub];
  }).filter(Boolean);
  const hasServiceResults = selectedDetails.some(detail =>
    detail.ip !== undefined || detail.ports !== undefined || detail.technologies !== undefined
  );
  const serviceScanRunning = Boolean(activeServiceRun?.running) || selectedDetails.some(detail => detail.analyzing || detail.techAnalyzing);
  const headerScores = selectedDetails
    .map(detail => detail.security?.score)
    .filter((score): score is number => typeof score === 'number');
  const averageHeaderScore = headerScores.length
    ? Math.round(headerScores.reduce((sum, score) => sum + score, 0) / headerScores.length)
    : null;
  const advancedAnalyzedCount = selectedDetails.filter(detail => detail.ssl || detail.security || detail.waf || detail.evidence).length;
  const isBrowserVerified = (detail: SubdomainDetail | undefined) => Boolean(detail?.ports?.some(
    port => port.verificationSource === 'browser' && port.protocol === 'https:' && port.isWeb === true
  ));
  const hasSecurityDetail = (detail: SubdomainDetail | undefined) => Boolean(detail && (
    detail.ssl || detail.security || detail.waf || detail.technologies || detail.evidence || detail.advancedAnalyzing || isBrowserVerified(detail)
  ));
  const securityDetailCount = selectedDetails.filter(detail => hasSecurityDetail(detail)).length;
  const validSslCount = selectedDetails.filter(detail => detail.ssl?.valid).length;
  const wafCount = selectedDetails.filter(detail => detail.waf?.detected).length;
  const hasAdvancedResults = Boolean(activeRun || emailSecurity[selectedDomain || ''] || advancedAnalyzedCount);

  // Dashboard View
  return (
    <div className="dashboard-layout fade-in">
      <header className="topbar">
        <div className="console-brand" aria-label="OSINT Core">
          <span className="console-mark" aria-hidden="true">
            <svg viewBox="0 0 28 28" fill="none">
              <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.5" />
              <line x1="17" y1="17" x2="24" y2="24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.4" />
            </svg>
          </span>
          <span>OSINT<strong>CORE</strong></span>
        </div>

        <form onSubmit={handleAddDomain} className="command-search" aria-label="Yeni hedef domain ekle">
          <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6.5" cy="6.5" r="4.5" />
            <line x1="10" y1="10" x2="14" y2="14" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Domain ekle — örn. sirketadi.com"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            aria-label="Domain"
          />
          <button type="submit" disabled={!isDomainValid} title="Domaini listeye ekle">
            <span>Ekle</span>
            <kbd>↵</kbd>
          </button>
        </form>

        <div className="topbar-actions">
          <span className="system-kicker"><i></i> Sistem aktif</span>
          <button
            type="button"
            className="user-profile user-profile-button"
            title={`${loggedInUser || 'Kullanıcı'} · Çıkış yap`}
            aria-label="Çıkış yap"
            onClick={handleLogout}
          >
            <div className="avatar">{loggedInUser ? loggedInUser.charAt(0).toUpperCase() : 'U'}</div>
          </button>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <svg xmlns="http://www.w3.org/0000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <span>BUSIBER OSINT Platform</span>
          </div>
        </div>
        
        <div className="sidebar-content">
          <div className="sidebar-heading">
            <h3 className="section-title">Hedef domainler</h3>
            <span>{domains.length}</span>
          </div>
          
          {domains.length === 0 ? (
            <div className="empty-state">
              <p>Henüz domain eklenmedi.</p>
            </div>
          ) : (
            <ul className="domain-list">
              {domains.map((d, idx) => {
                const isSelected = selectedDomain === d;
                const status = subdomains[d] && subdomains[d].length > 0 ? 'Tamamlandı' : (loading[d] ? 'Taranıyor...' : 'Bekliyor');
                const statusClass = subdomains[d] && subdomains[d].length > 0 ? 'success' : (loading[d] ? 'loading' : 'pending');
                
                return (
                  <li 
                    key={idx} 
                    className={`domain-item clickable ${isSelected ? 'active' : ''}`}
                    onClick={() => handleDomainClick(d)}
                  >
                    <div className="domain-info-group">
                      <span className="domain-icon" aria-hidden="true"></span>
                      <div className="domain-copy">
                        <span className="domain-text">{d}</span>
                        <span className={`status-badge ${statusClass}`}>{status}</span>
                      </div>
                    </div>
                    <div className="domain-actions-group">
                      <button 
                        className="delete-btn" 
                        onClick={(e) => handleDeleteDomain(d, e)}
                        title="Sil"
                      >
                        <svg xmlns="http://www.w3.org/0000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        
        <div className="sidebar-footer">
          <div className="user-info-small">
            <span className="user-email-truncate" title={loggedInUser || ''}>{loggedInUser}</span>
          </div>
          <button className="btn-text" onClick={handleLogout}>
            <svg xmlns="http://www.w3.org/0000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Çıkış Yap
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="welcome-text">
            <span className="system-kicker"><i></i> Keşif konsolu çevrimiçi</span>
            <h2>Varlık görünürlüğünü tek yüzeyde topla</h2>
            <p>Pasif kaynakları, DNS doğrulamasını ve servis güvenliğini aynı hedef akışında inceleyin.</p>
          </div>
          <div className="user-profile" title={loggedInUser || ''}>
            <div className="avatar">{loggedInUser ? loggedInUser.charAt(0).toUpperCase() : 'U'}</div>
          </div>
        </header>

        <div className="content-area">
          <div className="card input-card">
            <div className="header" style={{ textAlign: 'left' }}>
              <h3>Yeni Hedef Domain Ekle</h3>
              <p>Subdomain taraması ve analiz için şirketin ana alan adını girin.</p>
            </div>
            
            <form onSubmit={handleAddDomain} className="domain-form">
              <div className="form-group mb-0 flex-grow">
                <div className="domain-prefix">
                  <span className="prefix">https://</span>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="sirketadi.com"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-inline" disabled={!isDomainValid}>
                <svg xmlns="http://www.w3.org/0000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Listeye Ekle
              </button>
            </form>
          </div>

          <section className="phase-status-card" aria-labelledby="phase-status-title">
            <div>
              <p className="phase-status-eyebrow">Geliştirme durumu</p>
              <h3 id="phase-status-title">Platform güncellemeleri</h3>
            </div>
            <ol className="phase-status-list">
              <li className="phase-status-item is-complete">
                <span className="phase-status-icon" aria-hidden="true">✓</span>
                <span><strong>Faz 0 tamamlandı</strong><small>Dizin yapısı ve repo hijyeni</small></span>
              </li>
              <li className="phase-status-item is-complete">
                <span className="phase-status-icon" aria-hidden="true">✓</span>
                <span><strong>Faz 1 tamamlandı</strong><small>Backend modülerleştirme</small></span>
              </li>
              <li className="phase-status-item is-complete">
                <span className="phase-status-icon" aria-hidden="true">✓</span>
                <span><strong>Faz 2 tamamlandı</strong><small>Eşzamanlılık havuzu ve SSRF koruması</small></span>
              </li>
              <li className="phase-status-item is-complete">
                <span className="phase-status-icon" aria-hidden="true">✓</span>
                <span><strong>Faz 3 tamamlandı</strong><small>DNS doğrulama ve wildcard tespiti</small></span>
              </li>
              <li className="phase-status-item is-complete">
                <span className="phase-status-icon" aria-hidden="true">✓</span>
                <span><strong>Faz 4 tamamlandı</strong><small>Kaynak mimarisi ve yeni keşif kaynakları</small></span>
              </li>
              <li className="phase-status-item is-complete">
                <span className="phase-status-icon" aria-hidden="true">✓</span>
                <span><strong>Faz 5 tamamlandı</strong><small>Orkestrasyon, DNS doğrulama ve brute-force</small></span>
              </li>
            </ol>
            <p className="phase-status-next">Aktif yetenek: çok kaynaklı keşif → DNS → güvenlik analizi</p>
          </section>

          {!selectedDomain ? (
            <div className="awaiting-state">
              <div className="radar-mark" aria-hidden="true">
                <span></span><span></span><span></span>
                <svg viewBox="0 0 80 80" fill="none">
                  <circle cx="35" cy="35" r="14" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="46" y1="46" x2="62" y2="62" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>
              <p className="awaiting-kicker">Hedef bekleniyor</p>
              <h2>Keşif yüzeyini başlatın</h2>
              <p>Üstteki komut alanından bir domain ekleyin. Hedef soldaki listede görünür; seçtiğinizde pasif keşif ve güvenlik analizi başlar.</p>
              <div className="example-domains" aria-label="Örnek domainler">
                {['example.com', 'iana.org', 'github.com'].map(example => (
                  <button key={example} type="button" onClick={() => setDomainInput(example)}>{example}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="card results-card fade-in">
              <div className="results-header">
                <div className="target-heading">
                  <span className="target-label">Aktif hedef</span>
                  <h3>{selectedDomain}</h3>
                  <span className="target-signal"><i></i> İzleniyor</span>
                </div>
                <div className="results-actions">
                  {subdomains[selectedDomain] && <span className="results-stats-badge">{subdomains[selectedDomain].length} varlık</span>}
                  
                  {subdomains[selectedDomain] && subdomains[selectedDomain].length > 0 && (
                    <div className="analysis-action-group" aria-label="Hedef analiz işlemleri">
                      <button
                        className={`btn btn-secondary analysis-action ${serviceScanRunning ? 'is-cancel is-running' : ''}`}
                        aria-busy={serviceScanRunning}
                        onClick={handleAnalyzeAll}
                        disabled={activeRun?.running}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>
                        {serviceScanRunning
                          ? `Taramayı iptal et (${activeServiceRun?.completed || 0}/${activeServiceRun?.total || 0})`
                          : automaticStage === 'waiting-services' && automaticStartsAt !== undefined
                            ? `Servisleri tara (${autoCountdown} sn)` : 'Servisleri tara'}
                      </button>
                      <button
                        className={`btn btn-advanced analysis-action ${activeRun?.running ? 'is-running' : ''}`}
                        aria-busy={Boolean(activeRun?.running)}
                        onClick={handleAdvancedAnalysis}
                        disabled={activeRun?.running || serviceScanRunning}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9"/><path d="M21 3v9h-9"/></svg>
                        {activeRun?.running ? 'Analiz sürüyor' :
                          automaticStage === 'waiting-advanced' && automaticStartsAt !== undefined
                            ? `Tam kapsamlı analiz (${autoCountdown} sn)` : 'Tam kapsamlı analiz'}
                      </button>
                      <button
                        className="btn btn-secondary analysis-action"
                        onClick={handleGenerateScope}
                        disabled={!hasServiceResults || serviceScanRunning}
                        title={!hasServiceResults ? 'Kapsam oluşturmak için önce servisleri tarayın' : 'Aktif web sunucularından kapsam oluştur'}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>
                        Kapsam oluştur
                      </button>
                    </div>
                  )}

                  <button 
                    className="btn-text refresh-action"
                    onClick={() => fetchSubdomains(selectedDomain, true)}
                    title="Yenile"
                    aria-label="Hedef verilerini yenile"
                  >
                    <svg xmlns="http://www.w3.org/0000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                  </button>
                </div>
              </div>

              {selectedSubdomainsReady && (automaticStage === 'waiting-services' || automaticStage === 'waiting-advanced') && (
                <p className="auto-analysis-status" role="status">
                  {automaticStage === 'waiting-services' ? 'Servis taraması' : 'Tam kapsamlı analiz'} {autoCountdown} saniye sonra otomatik başlayacak.
                </p>
              )}
              {(activeMeta || activeRun || activeServiceRun) && (
                <section className="intel-strip" aria-live="polite">
                  <div className="intel-stat"><span>Kaynaklar</span><strong>{healthySources}<small>/{activeMeta?.sources.length || 0}</small></strong></div>
                  <div className="intel-stat"><span>DNS canlı</span><strong>{liveCount}</strong></div>
                  <div className="intel-stat"><span>Bekleyen</span><strong>{unknownCount}</strong></div>
                  <div className="intel-stat"><span>Brute keşfi</span><strong>{activeMeta?.bruteSkipped === 'wildcard' ? 'Atlandı' : (activeMeta?.bruteCount ?? '—')}</strong></div>
                  <div className={`intel-state ${activeRun?.running || activeServiceRun?.running ? 'is-running' : ''}`}>
                    <span>{activeRun?.running
                      ? activeRun.stage
                      : activeServiceRun?.running
                        ? activeServiceRun.stage
                        : automaticStage === 'waiting-advanced'
                          ? activeServiceRun?.stage
                          : activeRun?.stage || activeServiceRun?.stage || (activeMeta?.wildcard.isWildcard ? 'Wildcard algılandı' : 'Pasif keşif hazır')}</span>
                    {activeRun?.running && activeRun.total > 0 ? <strong>{activeRun.completed}/{activeRun.total}</strong> :
                      activeServiceRun?.running && activeServiceRun.total > 0 ? <strong>{activeServiceRun.completed}/{activeServiceRun.total}</strong> : null}
                    <div className="signal-track"><i style={{ width: activeRun?.running && activeRun.total
                      ? `${Math.max(4, (activeRun.completed / activeRun.total) * 100)}%`
                      : activeServiceRun?.running && activeServiceRun.total
                        ? `${Math.max(4, (activeServiceRun.completed / activeServiceRun.total) * 100)}%`
                        : '100%' }}></i></div>
                  </div>
                </section>
              )}
              
              <div className="results-content">
                {loading[selectedDomain] ? (
                  <div className="loading-state">
                    {wakingUp[selectedDomain] ? (
                        <div className="wakeup-container">
                            <div className="wakeup-radar" role="img" aria-label="Sistem hazırlanıyor; radar animasyonu">
                                <div className="radar-grid" aria-hidden="true">
                                    <span className="radar-ring radar-ring-inner" />
                                    <span className="radar-ring radar-ring-middle" />
                                    <span className="radar-axis radar-axis-horizontal" />
                                    <span className="radar-axis radar-axis-vertical" />
                                    <span className="radar-sweep" />
                                    <span className="radar-dot radar-dot-one" />
                                    <span className="radar-dot radar-dot-two" />
                                    <span className="radar-dot radar-dot-three" />
                                </div>
                                <span className="radar-domain">{selectedDomain}</span>
                            </div>
                            <h4>Bilgi toplama sistemi hazırlanıyor</h4>
                        </div>
                    ) : (
                        <>
                            <div className="spinner"></div>
                            <p>Sertifika, pasif DNS ve tehdit istihbaratı kaynakları taranıyor...</p>
                        </>
                    )}
                  </div>
                ) : error[selectedDomain] ? (
                  <div className="error-state">
                    <svg xmlns="http://www.w3.org/0000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <p>{error[selectedDomain]}</p>
                    <button className="btn btn-inline" onClick={() => fetchSubdomains(selectedDomain, true)}>Tekrar Dene</button>
                  </div>
                ) : subdomains[selectedDomain] && subdomains[selectedDomain].length > 0 ? (
                  <>
                    <div className="result-section-heading">
                      <div>
                        <span>Servis keşfi</span>
                        <h4>Ağ ve uygulama yüzeyi</h4>
                      </div>
                      <p>IP adresleri, web portları, HTTP yanıtları ve tespit edilen teknolojiler.</p>
                    </div>
                    <div className="subdomain-list">
                      {subdomains[selectedDomain].map((item, idx) => {
                        // Geriye dönük uyumluluk: Eski localStorage verisi string dizisi olabilir
                        const isLegacyString = typeof item === 'string';
                        const sub = isLegacyString ? (item as string) : item.subdomain;
                        const source = isLegacyString ? 'crt.sh' : item.source;
                        const itemIp = isLegacyString ? undefined : item.ip;
                        
                        const detail = subdomainDetails[sub];

                        let sourceBadgeClass = 'source-crt';
                        let sourceLabel = source || 'Pasif kaynak';
                        if (source === 'HackerTarget') sourceBadgeClass = 'source-ht';
                        else if (source && source.includes('+')) sourceBadgeClass = 'source-both';
                        else if (!isLegacyString && (item.discoveredBy === 'brute' || item.discoveredBy === 'permutation')) sourceBadgeClass = 'source-brute';

                        return (
                          <div key={idx} className="subdomain-item-detailed">
                            <div className="sub-header-row">
                                <div className="sub-main-info">
                                  <svg xmlns="http://www.w3.org/0000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="subdomain-icon"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                                  <a href={`https://${sub}`} target="_blank" rel="noopener noreferrer">{sub}</a>
                                </div>
                                <div className="sub-badges">
                                  {!isLegacyString && item.status && <span className={`dns-badge dns-${item.status}`}>{item.status}</span>}
                                  <span className={`source-badge ${sourceBadgeClass}`} title={sourceLabel}>{sourceLabel}</span>
                                </div>
                            </div>
                            
                            <div className="sub-details">
                              {(detail?.analyzing || detail?.techAnalyzing) ? (
                                  <span className="analyzing-text">45 portta servisler kontrol ediliyor...</span>
                              ) : detail ? (
                                  <div className="detail-rows">
                                    <div className="detail-row">
                                      <span className="ip-badge">{detail.ip || itemIp || 'DNS Çözülemedi'}</span>
                                    </div>
                                    
                                    {detail.ports && detail.ports.length > 0 ? (
                                      <div className="ports-container">
                                          {detail.ports.map((p, pIdx) => {
                                              let statusBadgeClass = 'status-badge-gray';
                                              if (p.status === 200 || p.status === 201) statusBadgeClass = 'status-badge-green';
                                              else if (p.verificationSource === 'browser') statusBadgeClass = 'status-badge-green';
                                              else if (String(p.status).startsWith('3')) statusBadgeClass = 'status-badge-blue';
                                              else if (String(p.status).startsWith('4') || String(p.status).startsWith('5')) statusBadgeClass = 'status-badge-red';
                                              else if (String(p.status).includes('Açık') || String(p.status).includes('Yanıtı')) statusBadgeClass = 'status-badge-green';
                                              else statusBadgeClass = 'status-badge-gray';

                                              const isWebPort = p.isWeb ?? (p.protocol === 'http:' || p.protocol === 'https:');
                                              const scheme = p.protocol === 'https:' ? 'https' : 'http';
                                              const portStr = (scheme === 'https' && p.port === 443) || (scheme === 'http' && p.port === 80) ? '' : `:${p.port}`;
                                              const targetUrl = isWebPort ? `${scheme}://${sub}${portStr}` : undefined;
                                              const verificationLabel = p.verificationSource === 'browser' ? ' · Kullanıcının tarayıcısından doğrulandı' :
                                                p.verificationSource === 'browserless' ? ' · Browserless canlı doğrulamasıyla doğrulandı' :
                                                  p.verificationSource === 'render' ? ' · Render canlı GET ile doğrulandı' : '';
                                              const title = `${p.service || 'Servis'} · ${(p.transport || 'tcp').toUpperCase()} · ${p.status}${verificationLabel}`;

                                              const content = <>
                                                <span className="port-number">:{p.port}/{p.transport || 'tcp'}</span>
                                                <span className={`status-badge-detailed ${statusBadgeClass}`}>{p.status}</span>
                                              </>;

                                              return targetUrl ? (
                                                  <a
                                                      key={pIdx} 
                                                      href={targetUrl} 
                                                      target="_blank" 
                                                      rel="noopener noreferrer" 
                                                      className="port-badge-group clickable-port"
                                                      title={`${title} · ${targetUrl} adresine git`}
                                                  >
                                                      {content}
                                                  </a>
                                              ) : (
                                                  <span key={pIdx} className="port-badge-group" title={title}>
                                                    {content}
                                                  </span>
                                              );
                                          })}
                                      </div>
                                    ) : (
                                        <span className="no-ports-text">Taranan 45 portta açık servis bulunamadı</span>
                                        )}

                                  </div>
                              ) : (
                                  <button className="btn-text btn-small" onClick={() => handleAnalyzeSubdomain(sub)}>
                                    Web Servisi Kontrolü
                                  </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="scope-section">
                        {activeServiceRun?.error && <div className="operation-error">{activeServiceRun.error}</div>}
                        {activeRun?.error && <div className="operation-error">{activeRun.error}</div>}

                        {activeMeta?.sources.length ? (
                          <div className="source-matrix">
                            <div className="source-matrix-heading">
                              <div><span>Keşif ağı</span><strong>{activeMeta.sources.length} bağlı kaynak</strong></div>
                              <small>{activeMeta.truncatedValidation ? 'İlk 150 kayıt doğrulandı; kalanlar bekliyor.' : 'DNS doğrulaması güncel.'}</small>
                            </div>
                            <div className="source-chips">
                              {activeMeta.sources.map(sourceItem => (
                                <span key={sourceItem.id} className={`source-chip ${sourceItem.ok ? 'is-ok' : 'is-muted'}`} title={`${sourceItem.ms} ms`}>
                                  <i></i>{sourceItem.label}<b>{sourceItem.ok ? sourceItem.count : (sourceItem.skipped || 'bekliyor')}</b>
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {hasAdvancedResults && (
                          <section className="comprehensive-analysis fade-in" aria-labelledby="comprehensive-analysis-title">
                            <div className="comprehensive-heading">
                              <div>
                                <span>Güvenlik değerlendirmesi</span>
                                <h4 id="comprehensive-analysis-title">Tam kapsamlı analiz</h4>
                              </div>
                              <p>HTTP header güvenliği, SSL durumu, WAF ve e-posta kontrolleri tek görünümde.</p>
                            </div>

                            <div className="security-metrics" aria-label="Güvenlik analizi özeti">
                              <div className="security-metric">
                                <span>Analiz edilen</span>
                                <strong>{advancedAnalyzedCount}<small>/{selectedResults.length}</small></strong>
                              </div>
                              <div className="security-metric security-metric-score">
                                <span>Header ortalaması</span>
                                <strong>{averageHeaderScore ?? '—'}<small>{averageHeaderScore !== null ? '/100' : ''}</small></strong>
                                <i><b style={{ width: `${averageHeaderScore ?? 0}%` }}></b></i>
                              </div>
                              <div className="security-metric">
                                <span>Geçerli SSL</span>
                                <strong>{validSslCount}</strong>
                              </div>
                              <div className="security-metric">
                                <span>WAF bulunan</span>
                                <strong>{wafCount}</strong>
                              </div>
                            </div>

                        {emailSecurity[selectedDomain] && (
                            <div className="email-security-box fade-in">
                                <h4>E-Posta Güvenlik Skoru ({selectedDomain}) <span className={`grade-badge grade-${emailSecurity[selectedDomain].grade}`}>{emailSecurity[selectedDomain].grade}</span></h4>
                                <div className="email-sec-grid">
                                    <div className="email-sec-item">
                                        <strong>SPF:</strong> {emailSecurity[selectedDomain].spf.hasRecord ? '✅ Var' : '❌ Yok'} 
                                        {emailSecurity[selectedDomain].spf.hasRecord && (emailSecurity[selectedDomain].spf.hasMinusAll ? ' (Hard Fail)' : ' (Soft Fail/None)')}
                                    </div>
                                    <div className="email-sec-item">
                                        <strong>DMARC:</strong> {emailSecurity[selectedDomain].dmarc.hasRecord ? '✅ Var' : '❌ Yok'} 
                                        {emailSecurity[selectedDomain].dmarc.hasRecord && ` (Policy: ${emailSecurity[selectedDomain].dmarc.policy})`}
                                    </div>
                                    <div className="email-sec-item">
                                        <strong>DKIM:</strong> {emailSecurity[selectedDomain].dkim.hasRecord ? '✅ Var (Standart)' : '❌ Standart Bulunamadı'}
                                    </div>
                                </div>
                                <p className="email-sec-desc">E-posta sahteciliği (Phishing) risklerine karşı ana alan adı analizidir.</p>
                            </div>
                        )}

                        {/* ADVANCED SUMMARY TABLE */}
                        {subdomains[selectedDomain] && subdomains[selectedDomain].some(item => {
                            const sub = typeof item === 'string' ? (item as string) : item.subdomain;
                            const detail = subdomainDetails[sub];
                            return hasSecurityDetail(detail);
                        }) && (
                            <div className="advanced-summary-box fade-in">
                                <div className="advanced-table-heading">
                                  <h5>Subdomain güvenlik detayları</h5>
                                  <span>{securityDetailCount} sonuç</span>
                                </div>
                                <div className="table-responsive">
                                    <table className="summary-table">
                                        <thead>
                                            <tr>
                                                <th>Subdomain</th>
                                                <th className="col-ssl-score">SSL Skoru</th>
                                                <th>Sertifika</th>
                                                <th>HTTP Yanıt Profili</th>
                                                <th>Eksik Headerlar</th>
                                                <th className="col-waf" title="WAF Koruması">WAF</th>
                                                <th className="col-tech-stack" title="Teknoloji Yığını">TEKNOLOJİ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {subdomains[selectedDomain].map((item, idx) => {
                                                const sub = typeof item === 'string' ? (item as string) : item.subdomain;
                                                const detail = subdomainDetails[sub];
                                                
                                                if (!detail || !hasSecurityDetail(detail)) return null;
                                                const browserVerified = isBrowserVerified(detail);
                                                const browserlessVerified = detail.evidence?.source === 'browserless-live' || detail.tlsVerification?.source === 'browserless-live';
                                                const visibleTechnologies = (detail.technologies || []).filter(tech =>
                                                  tech.category !== 'CDN' && !(detail.waf?.detected && /cloudflare/i.test(detail.waf.name || '') && /cloudflare/i.test(tech.name))
                                                );
                                                const httpPortResults = (detail.ports || []).filter((port): port is PortInfo & { status: number; protocol: 'http:' | 'https:' } =>
                                                  typeof port.status === 'number' && (port.protocol === 'http:' || port.protocol === 'https:')
                                                );
                                                const serviceHttpProfile = httpPortResults.find(port => port.protocol === 'https:') || httpPortResults[0];
                                                const profileStatus = detail.evidence?.status ?? serviceHttpProfile?.status;
                                                const profileProtocol = detail.evidence?.protocol ?? serviceHttpProfile?.protocol;
                                                const hasHttpProfile = Boolean(detail.evidence || serviceHttpProfile);

                                                return (
                                                    <tr key={idx}>
                                                        <td className="col-subdomain">
                                                          {sub}
                                                          {detail.evidence?.externalRedirect?.target && <small className="passive-source-label" title="Son hedefin bulguları ilk hedefin puanına dahil edilmez">↳ Dış yönlendirme: {detail.evidence.externalRedirect.target}</small>}
                                                        </td>
                                                        <td className="col-ssl-score">
                                                            {detail.advancedAnalyzing ? <AnalysisWaitIndicator /> :
                                                             detail.ssl ? (
                                                               <div className="ssl-summary">
                                                                 <span className={`grade-badge grade-${detail.ssl.grade}`}>{detail.ssl.grade}</span>
                                                                 {detail.ssl.protocol && <small>{detail.ssl.protocol}</small>}
                                                                 {(detail.ssl.legacyProtocols?.tls10 === 'yes' || detail.ssl.legacyProtocols?.tls11 === 'yes') && <small className="ssl-warning">Eski TLS</small>}
                                                               </div>
                                                             ) : <span className="text-muted">{browserlessVerified ? 'TLS doğrulandı' : browserVerified ? (detail.browserlessError ? 'Browserless erişemedi' : 'Render erişemedi') : '-'}</span>}
                                                        </td>
                                                        <td className="col-cert">
                                                            {detail.advancedAnalyzing ? <span className="analysis-wait-copy">Bekleniyor</span> : detail.ssl ? (
                                                                <div className="cert-summary">
                                                                  <span className={detail.ssl.valid ? 'text-success' : 'text-error'}>
                                                                      {detail.ssl.valid ? `Geçerli · ${detail.ssl.daysLeft ?? '—'}g` : 'Geçersiz'}
                                                                  </span>
                                                                  {detail.ssl.issuer && <small title={detail.ssl.issuer}>{detail.ssl.issuer}</small>}
                                                                  <small className={detail.ssl.hostnameMatch === false || detail.ssl.chainComplete === false ? 'ssl-warning' : ''}>
                                                                    {detail.ssl.hostnameMatch === false ? 'Host eşleşmedi' : detail.ssl.chainComplete === false ? 'Zincir eksik' : 'Host eşleşti · Zincir tamam'}
                                                                  </small>
                                                                </div>
                                                            ) : browserlessVerified ? <span className="text-success">Browserless üzerinden doğrulandı</span> : browserVerified ? <span className="text-success">Tarayıcıdan doğrulandı</span> : <span className="text-muted">-</span>}
                                                        </td>
                                                        <td className="col-http-profile">
                                                            {detail.advancedAnalyzing ? <span className="analysis-wait-copy">Bekleniyor</span> :
                                                             hasHttpProfile ? (
                                                               <div className="http-profile">
                                                                 <span className={`http-status http-status-${httpStatusTone(profileStatus)}`}>
                                                                   {profileStatus ?? '—'} <small>{httpStatusLabel(profileStatus)}</small>
                                                                 </span>
                                                                 <span>{profileProtocol === 'https:' ? 'HTTPS' : profileProtocol === 'http:' ? 'HTTP' : 'Protokol bilinmiyor'}{!detail.evidence && serviceHttpProfile ? ` · :${serviceHttpProfile.port}` : ''}</span>
                                                                 <span>{detail.evidence ? (detail.evidence.source === 'browserless-live' ? 'Browserless canlı' : 'Render canlı') : 'Servis taraması'}</span>
                                                                 {detail.evidence?.redirectCount ? <span>↳ {detail.evidence.redirectCount} yönlendirme</span> : null}
                                                                 {detail.evidence?.server ? <span className="http-server">{detail.evidence.server}</span> : null}
                                                               </div>
                                                             ) : <span className="text-muted">{browserlessVerified ? 'Okunamadı' : browserVerified ? (detail.browserlessError ? 'Browserless erişemedi' : 'Render erişemedi') : '-'}</span>}
                                                        </td>
                                                        <td className="col-missing">
                                                            {detail.advancedAnalyzing ? <span className="analysis-wait-copy">Bekleniyor</span> : detail.security?.missing ? (
                                                                <div className="missing-list-inline">
                                                                    {[...new Set(detail.security.missing as string[])].map((missingHeader) => (
                                                                        <span key={missingHeader} className="missing-tag">{missingHeader}</span>
                                                                    ))}
                                                                </div>
                                                            ) : <span className="text-muted">{browserlessVerified ? 'Okunamadı' : browserVerified ? (detail.browserlessError ? 'Browserless erişemedi' : 'Render erişemedi') : '-'}</span>}
                                                        </td>
                                                        <td className="col-waf">
                                                            {detail.advancedAnalyzing ? <span className="analysis-wait-copy">Bekleniyor</span> :
                                                             detail.waf?.detected ? <span className="cf-badge" style={{ margin: 0 }}>{detail.waf.name}</span> :
                                                             detail.waf ? <span className="badge-none">Korumasız</span> : <span className="text-muted">{browserlessVerified ? 'Okunamadı' : browserVerified ? (detail.browserlessError ? 'Browserless erişemedi' : 'Render erişemedi') : '-'}</span>}
                                                        </td>
                                                        <td className="col-tech-stack">
                                                            {detail.advancedAnalyzing ? <span className="analysis-wait-copy">Bekleniyor</span> :
                                                              visibleTechnologies.length > 0 ? (
                                                                <div className="tech-stack-list">
                                                                  {visibleTechnologies.slice(0, 6).map((tech, techIdx) => {
                                                                    const label = `${tech.name}${tech.version ? ` ${tech.version}` : ''}`;
                                                                    const source = tech.passive ? 'Pasif Shodan gözlemi' : `${tech.confidence ?? '—'}% güven · ${(tech.sources || []).join(', ')}`;
                                                                    return <span key={techIdx} className={`tech-badge ${tech.passive ? 'tech-passive' : 'tech-gray'}`} title={`${tech.category} · ${source}`}>{label}</span>;
                                                                  })}
                                                                </div>
                                                              ) : <span className="text-muted">{browserlessVerified ? 'Tespit yok' : browserVerified ? (detail.browserlessError ? 'Browserless erişemedi' : 'Render erişemedi') : 'Tespit yok'}</span>}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                          </section>
                        )}

                        {scopeVisibleForDomain === selectedDomain && (
                            <div className="scope-output-box fade-in">
                                <div className="scope-header">
                                    <h4>Geçerli OSINT Kapsamı</h4>
                                    <button className="btn-text btn-small" onClick={() => { navigator.clipboard.writeText(scopeOutput); alert('Kopyalandı!'); }}>Kopyala</button>
                                </div>
                                <p className="scope-desc">Sadece port taraması yapılmış ve aktif web servisi tespit edilmiş olan (Mail ve DNS sunucuları hariç) adresler.</p>
                                <textarea 
                                    className="form-input scope-textarea" 
                                    readOnly 
                                    value={scopeOutput}
                                    placeholder="Henüz aktif web servisi tespit edilen bir adres yok. Lütfen listedeki adresleri analiz edin."
                                />
                            </div>
                        )}
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <p>Bu alan adı için herhangi bir kayıt bulunamadı veya henüz tarama yapılmadı.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      <footer className="statusbar" aria-live="polite">
        <span className={selectedDomain ? 'is-active' : ''}><i></i>{selectedDomain ? 'ACTIVE' : 'IDLE'}</span>
        <b></b>
        <span>{domains.length} hedef kayıtlı</span>
        <span className="statusbar-build">BUSIBER OSINT · CORE v2.4.1</span>
      </footer>
    </div>
  );
}

export default App;
