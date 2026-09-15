import { useState, useEffect, useRef } from 'react';
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
}

// Eski localStorage sonuçlarında `isWebCandidate` alanı bulunmaz. Bu liste, yeni API cevabı
// alınana kadar açık web/panel portlarının kapsamda kaybolmasını önler.
const WEB_CANDIDATE_PORTS = new Set([80, 443, 2082, 2083, 2086, 2087, 3000, 3001, 4000, 5000, 7000, 7001, 7047, 7048, 7080, 7085, 7443, 8000, 8008, 8080, 8081, 8082, 8083, 8084, 8090, 8181, 8443, 8444, 8888, 8931, 9000, 9090, 9200, 9443, 10443]);

interface TechInfo {
  name: string;
  category: string;
  version?: string;
  confidence?: number;
  sources?: Array<'opentechalyzer' | 'builtin' | 'shodan'>;
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
  advancedAnalyzing?: boolean;
}

interface EmailSecurityInfo {
  spf: { hasRecord: boolean, hasMinusAll: boolean };
  dmarc: { hasRecord: boolean, policy: string };
  dkim: { hasRecord: boolean };
  score: number;
  grade: string;
}

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
  const [scopeOutput, setScopeOutput] = useState<string>('');
  const [showScope, setShowScope] = useState<boolean>(false);
  const serviceAbortRef = useRef<{ domain: string; controller: AbortController } | null>(null);
  
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
    setSelectedDomain(domain);
    fetchSubdomains(domain);
  };

  const handleAnalyzeSubdomain = async (sub: string, signal?: AbortSignal): Promise<boolean> => {
    setSubdomainDetails(prev => ({ ...prev, [sub]: { ...prev[sub], analyzing: true } }));

    const analysisResult = await Promise.allSettled([fetchJsonWithTimeout<{ ip?: string | null; ports?: PortInfo[]; isCloudflare?: boolean }>(
      `${API_BASE_URL}/api/analyze?domain=${sub}`,
      {},
      25000,
      signal
    )]).then(([result]) => result);

    const analysis = analysisResult.status === 'fulfilled' ? analysisResult.value : null;

    setSubdomainDetails(prev => ({
      ...prev,
      [sub]: {
        ...prev[sub],
        ...(analysis ? {
          ip: analysis.ip ?? null,
          ports: Array.isArray(analysis.ports) ? analysis.ports : [],
          isCloudflare: Boolean(analysis.isCloudflare)
        } : {}),
        analyzing: false,
        techAnalyzing: false
      }
    }));

    return analysisResult.status === 'fulfilled';
  };

  const handleAnalyzeAll = async () => {
      if (!selectedDomain || !subdomains[selectedDomain]) return;
      const domain = selectedDomain;
      if (serviceRuns[domain]?.running) {
        serviceAbortRef.current?.controller.abort();
        return;
      }

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
        await Promise.all(Array.from({ length: Math.min(3, targets.length) }, () => worker()));
        const cancelled = controller.signal.aborted;
        setServiceRuns(prev => ({
          ...prev,
          [domain]: {
            running: false,
            stage: cancelled ? 'Servis taraması iptal edildi' : 'Servis taraması tamamlandı',
            completed,
            total: targets.length,
            failed,
            ...(cancelled ? { error: 'Tarama kullanıcı tarafından iptal edildi.' } :
              failed ? { error: `${failed} hedef zaman aşımı veya API hatası nedeniyle tamamlanamadı.` } : {})
          }
        }));
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
      if (advancedRuns[domain]?.running) return;
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
                const data = await fetchJsonWithTimeout<any>(`${API_BASE_URL}/api/advanced?subdomain=${sub}`, {}, 15000);
                setSubdomainDetails(prev => ({
                  ...prev,
                  [sub]: {
                    ...prev[sub],
                    ssl: data.ssl,
                    security: data.advanced?.security,
                    waf: data.advanced?.waf,
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
          setAdvancedRuns(prev => ({ ...prev, [domain]: { running: false, stage: 'Analiz tamamlandı', completed: targets.length, total: targets.length } }));
      } catch (err) {
          const message = err instanceof Error ? err.message : 'Gelişmiş analiz tamamlanamadı';
          setAdvancedRuns(prev => ({ ...prev, [domain]: { running: false, stage: 'Analiz durdu', completed: 0, total: 0, error: message } }));
      }
  };

  const handleGenerateScope = () => {
      if (!selectedDomain || !subdomains[selectedDomain]) return;
      
      const excludedPrefixes = ['mail.', 'webmail.', 'smtp.', 'pop.', 'pop3.', 'imap.', 'ns.', 'ns1.', 'ns2.', 'dns.', 'mx.'];
      const validSubdomains: string[] = [];

      const subs = subdomains[selectedDomain];
      
      subs.forEach(item => {
          const isLegacyString = typeof item === 'string';
          const sub = isLegacyString ? (item as string) : item.subdomain;
          const detail = subdomainDetails[sub];

          // 1. Dışlanan (Mail/DNS) kelimelerle başlıyorsa atla
          const isExcluded = excludedPrefixes.some(prefix => sub.toLowerCase().startsWith(prefix));
          if (isExcluded) return;

          // 2. HTTP/HTTPS doğrulanmış veya açık web/panel portu olanları ekle. Bazı
          // uygulamalar HEAD yanıtı vermez; örneğin açık 8443/Tomcat yine kapsam adayıdır.
          if (detail && detail.ports && detail.ports.length > 0) {
              const hasActiveWeb = detail.ports.some(p =>
                p.isWeb === true || p.isWebCandidate === true || p.protocol === 'http:' || p.protocol === 'https:' || WEB_CANDIDATE_PORTS.has(p.port)
              );
              if (hasActiveWeb) {
                  validSubdomains.push(sub);
              }
          }
      });

      setScopeOutput(validSubdomains.join(', '));
      setShowScope(true);
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
  const advancedAnalyzedCount = selectedDetails.filter(detail => detail.ssl || detail.security || detail.waf).length;
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
                      <span className="domain-text">{d}</span>
                    </div>
                    <div className="domain-actions-group">
                      <span className={`status-badge ${statusClass}`}>{status}</span>
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
                        className={`btn btn-secondary analysis-action ${serviceScanRunning ? 'is-cancel' : ''}`}
                        onClick={handleAnalyzeAll}
                        disabled={activeRun?.running}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>
                        {serviceScanRunning
                          ? `Taramayı iptal et (${activeServiceRun?.completed || 0}/${activeServiceRun?.total || 0})`
                          : 'Servisleri tara'}
                      </button>
                      <button
                        className="btn btn-advanced analysis-action"
                        onClick={handleAdvancedAnalysis}
                        disabled={activeRun?.running || serviceScanRunning}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9"/><path d="M21 3v9h-9"/></svg>
                        {activeRun?.running ? 'Analiz sürüyor' : 'Tam kapsamlı analiz'}
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
                            <div className="wakeup-icon">
                                <svg xmlns="http://www.w3.org/0000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><polyline points="21 3 21 8 16 8"/></svg>
                            </div>
                            <h4>Sunucu Uyanıyor...</h4>
                            <p>Uzun süredir kullanılmadığı için sunucu uyku modundan çıkıyor. Bu işlem <b>~45 saniye</b> sürebilir. Lütfen bekleyin.</p>
                            <div className="progress-bar-container">
                                <div className="progress-bar-fill"></div>
                            </div>
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
                        const serviceTechnologies = (detail?.technologies || []).filter(
                          technology => !technology.name.toLowerCase().includes('cloudflare')
                        );

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
                                              else if (String(p.status).startsWith('3')) statusBadgeClass = 'status-badge-blue';
                                              else if (String(p.status).startsWith('4') || String(p.status).startsWith('5')) statusBadgeClass = 'status-badge-red';
                                              else if (String(p.status).includes('Açık') || String(p.status).includes('Yanıtı')) statusBadgeClass = 'status-badge-green';
                                              else statusBadgeClass = 'status-badge-gray';

                                              const isWebPort = p.isWeb ?? (p.protocol === 'http:' || p.protocol === 'https:');
                                              const scheme = p.protocol === 'https:' ? 'https' : 'http';
                                              const portStr = (scheme === 'https' && p.port === 443) || (scheme === 'http' && p.port === 80) ? '' : `:${p.port}`;
                                              const targetUrl = isWebPort ? `${scheme}://${sub}${portStr}` : undefined;
                                              const title = `${p.service || 'Servis'} · ${(p.transport || 'tcp').toUpperCase()} · ${p.status}`;

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

                                        {serviceTechnologies.length > 0 && (                                      <div className="tech-container">
                                          {serviceTechnologies.map((t, tIdx) => {
                                              let techClass = 'tech-gray';
                                              switch(t.category) {
                                                  case 'CMS': techClass = 'tech-purple'; break;
                                                  case 'Frontend': techClass = 'tech-blue'; break;
                                                  case 'Backend': techClass = 'tech-orange'; break;
                                                  case 'Sunucu': techClass = 'tech-gray'; break;
                                                  case 'CDN': techClass = 'tech-green'; break;
                                                  case 'Analitik': techClass = 'tech-yellow'; break;
                                                  case 'Güvenlik': techClass = 'tech-red'; break;
                                              }
                                              return (
                                                  <span key={tIdx} className={`tech-badge ${techClass}`} title={t.category}>
                                                      {t.name}
                                                  </span>
                                              );
                                          })}
                                      </div>
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
                            return detail && (detail.ssl || detail.security || detail.waf || detail.technologies || detail.advancedAnalyzing);
                        }) && (
                            <div className="advanced-summary-box fade-in">
                                <div className="advanced-table-heading">
                                  <h5>Subdomain güvenlik detayları</h5>
                                  <span>{advancedAnalyzedCount} sonuç</span>
                                </div>
                                <div className="table-responsive">
                                    <table className="summary-table">
                                        <thead>
                                            <tr>
                                                <th>Subdomain</th>
                                                <th>SSL Skoru</th>
                                                <th>Sertifika</th>
                                                <th>HTTP Header Güvenliği</th>
                                                <th>Eksik Headerlar</th>
                                                <th>WAF Koruması</th>
                                                <th>Teknoloji Yığını</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {subdomains[selectedDomain].map((item, idx) => {
                                                const sub = typeof item === 'string' ? (item as string) : item.subdomain;
                                                const detail = subdomainDetails[sub];
                                                
                                                if (!detail || (!detail.ssl && !detail.security && !detail.waf && !detail.technologies && !detail.advancedAnalyzing)) return null;

                                                return (
                                                    <tr key={idx}>
                                                        <td className="col-subdomain">{sub}</td>
                                                        <td>
                                                            {detail.advancedAnalyzing ? <span className="analyzing-text-small">Taranıyor...</span> : 
                                                             detail.ssl ? <span className={`grade-badge grade-${detail.ssl.grade}`}>{detail.ssl.grade}</span> : <span className="text-muted">-</span>}
                                                        </td>
                                                        <td className="col-cert">
                                                            {detail.ssl ? (
                                                                <span className={detail.ssl.valid ? 'text-success' : 'text-error'}>
                                                                    {detail.ssl.valid ? `Geçerli (${detail.ssl.daysLeft}g)` : 'Geçersiz'}
                                                                </span>
                                                            ) : <span className="text-muted">-</span>}
                                                        </td>
                                                        <td className="col-header-score">
                                                            {detail.advancedAnalyzing ? <span className="analyzing-text-small">Taranıyor...</span> : 
                                                             detail.security ? (
                                                               <div className="header-score">
                                                                 <span><strong>{detail.security.score}</strong>/100</span>
                                                                 <i><b style={{ width: `${detail.security.score}%` }}></b></i>
                                                                 <span className={`grade-badge grade-${detail.security.grade}`}>{detail.security.grade}</span>
                                                               </div>
                                                             ) : <span className="text-muted">-</span>}
                                                        </td>
                                                        <td className="col-missing">
                                                            {detail.security?.missing ? (
                                                                <div className="missing-list-inline">
                                                                    {detail.security.missing.map((m: string, mIdx: number) => (
                                                                        <span key={mIdx} className="missing-tag">{m}</span>
                                                                    ))}
                                                                </div>
                                                            ) : <span className="text-muted">-</span>}
                                                        </td>
                                                        <td>
                                                            {detail.advancedAnalyzing ? <span className="analyzing-text-small">Taranıyor...</span> : 
                                                             (detail.waf && detail.waf.detected) ? <span className="cf-badge" style={{ margin: 0 }}>{detail.waf.name}</span> : <span className="badge-none">Korumasız</span>}
                                                        </td>
                                                        <td className="col-tech-stack">
                                                            {detail.advancedAnalyzing ? <span className="analyzing-text-small">Taranıyor...</span> :
                                                              (detail.technologies || []).filter(tech => tech.category !== 'CDN').length > 0 ? (
                                                                <div className="tech-stack-list">
                                                                  {(detail.technologies || []).filter(tech => tech.category !== 'CDN').slice(0, 6).map((tech, techIdx) => {
                                                                    const label = `${tech.name}${tech.version ? ` ${tech.version}` : ''}`;
                                                                    const source = tech.passive ? 'Pasif Shodan gözlemi' : `${tech.confidence ?? '—'}% güven · ${(tech.sources || []).join(', ')}`;
                                                                    return <span key={techIdx} className={`tech-badge ${tech.passive ? 'tech-passive' : 'tech-gray'}`} title={`${tech.category} · ${source}`}>{label}</span>;
                                                                  })}
                                                                </div>
                                                              ) : <span className="text-muted">Tespit yok</span>}
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

                        {showScope && (
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
