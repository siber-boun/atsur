import { useState, useEffect, useEffectEvent, useMemo, useRef, type ReactNode } from 'react';
import './index.css';
import './styles/console.css';
import { ScopeReadyDialog } from './components/ScopeReadyDialog';
import { ConsoleShell } from './components/ConsoleShell';
import { BrandLockup } from './components/Logo';
import { ConsoleContext, DOMAIN_PATTERN, type ConsoleValue } from './lib/console';
import { useHashRoute, type ViewId } from './lib/route';
import { buildWorkspace, scopeHosts } from './lib/workspace';
import { AiView } from './views/AiView';
import { AssetsView } from './views/AssetsView';
import { DashboardView } from './views/DashboardView';
import { FindingsView } from './views/FindingsView';
import { ScopeView } from './views/ScopeView';
import { TargetsView } from './views/TargetsView';
import { TechnologiesView } from './views/TechnologiesView';
import { DesignProcessView } from './views/DesignProcessView';
import { API_BASE_URL, fetchJsonWithTimeout, setCsrfToken, statusFromError, verifyHttpsFromBrowser } from './lib/api';
import { emptyUserData, normalizeCachedDetail, normalizeSubdomainCache, readPref, readStoredUsers, updateStoredUser, writePref, writeStoredUsers } from './lib/storage';
import type {
  AdvancedResponse, AdvancedRun, AiReport, AnalyzeResponse, AuthSession, BruteResponse, EmailSecurityInfo, PortInfo,
  ScanMeta, ScanResponse, ServiceRun, Step, SubdomainData, SubdomainDetail
} from './types';

function App() {
  const [step, setStep] = useState<Step>('login');
  const [authChecking, setAuthChecking] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  
  // Auth states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [loggedInUser, setLoggedInUser] = useState<string | null>(null);
  const [userDataReady, setUserDataReady] = useState(false);
  
  // Dashboard states
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
  const [generatedScopes, setGeneratedScopes] = useState<Record<string, string>>({});
  const [aiReports, setAiReports] = useState<Record<string, AiReport>>({});
  const [scopeReadyDomain, setScopeReadyDomain] = useState<string | null>(null);
  const notifiedScopeRunsRef = useRef(new Map<string, AdvancedRun>());
  const serviceAbortRef = useRef<{ domain: string; controller: AbortController } | null>(null);
  const advancedAbortRef = useRef(new Map<string, AbortController>());
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
  
  const [route, navigate] = useHashRoute();

  useEffect(() => {
    const controller = new AbortController();
    localStorage.removeItem('osint_demo_password_sha256');
    sessionStorage.removeItem('osint_demo_session');
    void fetchJsonWithTimeout<AuthSession>(`${API_BASE_URL}/api/auth/session`, {}, 60000, controller.signal)
      .then(session => {
        setCsrfToken(session.csrfToken);
        setLoggedInUser(session.email);
        setSessionExpiresAt(session.expiresAt);
        setStep('dashboard');
      }).catch(() => {
        if (!controller.signal.aborted) setAuthError('Oturum açılamadı. Lütfen giriş yapın.');
      }).finally(() => { if (!controller.signal.aborted) setAuthChecking(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const expired = () => {
      setCsrfToken('');
      setSessionExpiresAt(null);
      setLoggedInUser(null);
      setStep('login');
      setAuthError('Oturum süresi doldu. Lütfen tekrar giriş yapın.');
      clearAutoAnalysisTimer();
      setAutoAnalysis(null);
      serviceAbortRef.current?.controller.abort();
      for (const controller of advancedAbortRef.current.values()) controller.abort();
      advancedAbortRef.current.clear();
    };
    window.addEventListener('osint-session-expired', expired);
    const timer = sessionExpiresAt ? window.setTimeout(expired, Math.max(0, sessionExpiresAt * 1000 - Date.now())) : undefined;
    return () => { window.removeEventListener('osint-session-expired', expired); window.clearTimeout(timer); };
  }, [sessionExpiresAt]);

  useEffect(() => {
    setUserDataReady(false);
    if (loggedInUser) {
      const users = readStoredUsers();
      const userData = users[loggedInUser] || emptyUserData();
      if (!users[loggedInUser]) {
        users[loggedInUser] = userData;
        writeStoredUsers(users);
      }
      setDomains(userData.domains || []);
      setSubdomains(normalizeSubdomainCache(userData.subdomainsCache));
      const cachedDetails = userData.subdomainDetailsCache || {};
      setSubdomainDetails(Object.fromEntries(
        Object.entries(cachedDetails).map(([subdomain, detail]) => [subdomain, normalizeCachedDetail(detail)])
      ));
      setEmailSecurity(userData.emailSecCache || {});
      setGeneratedScopes(userData.scopes || {});
      setAiReports(userData.aiReports || {});
      const lastTarget = readPref('target');
      // Son seçilen hedef cache'ten geri yüklenir; otomatik tarama başlatılmaz.
      setSelectedDomain(lastTarget && (userData.domains || []).includes(lastTarget) ? lastTarget : null);
      setUserDataReady(true);
    } else {
      setDomains([]);
      setSelectedDomain(null);
      setSubdomains({});
      setSubdomainDetails({});
      setEmailSecurity({});
      setGeneratedScopes({});
      setAiReports({});
    }
  }, [loggedInUser]);

  // Save domain list and caches when they change
  useEffect(() => {
    if (loggedInUser && userDataReady) {
      updateStoredUser(loggedInUser, data => {
        data.domains = domains;
        data.subdomainsCache = subdomains;
        data.subdomainDetailsCache = Object.fromEntries(
          Object.entries(subdomainDetails).map(([subdomain, detail]) => [subdomain, normalizeCachedDetail(detail)])
        );
        data.emailSecCache = emailSecurity;
        data.scopes = generatedScopes;
        data.aiReports = aiReports;
      });
    }
  }, [domains, subdomains, subdomainDetails, emailSecurity, generatedScopes, aiReports, loggedInUser, userDataReady]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authBusy) return;
    if (!email.trim() || !password) { setAuthError('E-posta ve şifrenizi girin.'); return; }
    setAuthError('');
    setAuthBusy(true);
    try {
      const session = await fetchJsonWithTimeout<AuthSession>(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      }, 60000);
      setCsrfToken(session.csrfToken);
      setPassword('');
      setSessionExpiresAt(session.expiresAt);
      const users = readStoredUsers();
      if (!users[session.email]) users[session.email] = emptyUserData();
      writeStoredUsers(users);
      setLoggedInUser(session.email);
      setStep('dashboard');
    } catch {
      setAuthError('Giriş yapılamadı. E-posta ve şifrenizi kontrol edip tekrar deneyin.');
    } finally { setAuthBusy(false); }
  };

  const handleLogout = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      await fetchJsonWithTimeout<void>(`${API_BASE_URL}/api/auth/logout`, { method: 'POST' });
    } catch {
      setAuthError('Çıkış yapılamadı. Bağlantınızı kontrol edip tekrar deneyin.');
      setAuthBusy(false);
      return;
    }
    setCsrfToken('');
    setSessionExpiresAt(null);
    setAuthBusy(false);
    setScopeReadyDomain(null);
    notifiedScopeRunsRef.current.clear();
    setAdvancedRuns({});
    clearAutoAnalysisTimer();
    setAutoAnalysis(null);
    serviceAbortRef.current?.controller.abort();
    serviceAbortRef.current = null;
    for (const controller of advancedAbortRef.current.values()) controller.abort();
    advancedAbortRef.current.clear();
    setLoggedInUser(null);
    setEmail('');
    setPassword('');
    setStep('login');
  };

  const handleDeleteDomain = (domainToDelete: string) => {
    setGeneratedScopes(prev => { const next = { ...prev }; delete next[domainToDelete]; return next; });
    setAiReports(prev => { const next = { ...prev }; delete next[domainToDelete]; return next; });
    notifiedScopeRunsRef.current.delete(domainToDelete);
    
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
    if (serviceAbortRef.current?.domain === domainToDelete) {
      serviceAbortRef.current.controller.abort();
      serviceAbortRef.current = null;
    }
    advancedAbortRef.current.get(domainToDelete)?.abort();
    advancedAbortRef.current.delete(domainToDelete);
    
    if (loggedInUser) {
      updateStoredUser(loggedInUser, data => {
        data.domains = newDomains;
        data.subdomainsCache = newSubdomains;
      });
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
      const scanUrl = `${API_BASE_URL}/api/scan?domain=${encodeURIComponent(domain)}`;
      let raw: ScanResponse | SubdomainData[] | undefined;
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          raw = await fetchJsonWithTimeout<ScanResponse | SubdomainData[]>(scanUrl, {}, 90000);
          lastError = undefined;
          break;
        } catch (scanError) {
          lastError = scanError;
          const status = statusFromError(scanError);
          const transient = scanError instanceof TypeError ||
            (scanError instanceof DOMException && scanError.name === 'AbortError') ||
            status === 429 || status >= 500;
          if (!transient || attempt === 2) throw scanError;
          setWakingUp(prev => ({ ...prev, [domain]: true }));
          await new Promise(resolve => window.setTimeout(resolve, 1500 * (attempt + 1)));
        }
      }
      if (lastError) throw lastError;
      clearTimeout(wakeUpTimer);

      // Faz 5'ten itibaren backend tarama metadatasıyla birlikte bir nesne döner;
      // eski dizi cevabı da önbellekteki/geri alınmış sürümler için desteklenir.
      const list: SubdomainData[] = Array.isArray(raw) ? raw : (Array.isArray(raw?.results) ? raw.results : []);
      setSubdomains(prev => ({ ...prev, [domain]: list }));
      if (raw && !Array.isArray(raw)) {
        const scan = raw;
        setScanMeta(prev => ({
          ...prev,
          [domain]: {
            sources: scan.sources || [],
            wildcard: scan.wildcard || { isWildcard: false, confidence: 'low', wildcardIps: [] },
            truncatedValidation: Boolean(scan.truncatedValidation)
          }
        }));
      }

    } catch (err: unknown) {
      clearTimeout(wakeUpTimer);
      const status = statusFromError(err);
      const cachedCount = subdomains[domain]?.length || 0;
      const failureMessage = status === 401
        ? 'Tarama sunucusu hâlâ oturum istiyor (HTTP 401). Backend güncellemesi henüz yayına alınmamış olabilir.'
        : status === 403
          ? 'Tarama sunucusu isteği engelledi (HTTP 403). Sunucu erişim/CORS ayarlarını kontrol edin.'
          : err instanceof TypeError
            ? 'Tarama servisine bağlanılamadı (ağ veya CORS hatası). Otomatik yeniden denemeler başarısız oldu.'
            : status
              ? `Alt domain taraması başarısız oldu (HTTP ${status}). Tekrar deneyebilirsiniz.`
              : 'Alt domain taraması tamamlanamadı. Tekrar deneyebilirsiniz.';
      // A refresh failure should not discard or block analysis of already saved discoveries.
      setError(prev => ({ ...prev, [domain]: cachedCount ? '' : failureMessage }));
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
    writePref('target', domain);
    fetchSubdomains(domain);
  };

  const handleAnalyzeSubdomain = async (sub: string, signal?: AbortSignal): Promise<boolean> => {
    setSubdomainDetails(prev => ({ ...prev, [sub]: { ...prev[sub], analyzing: true } }));

    const analysisResult = await Promise.allSettled([fetchJsonWithTimeout<AnalyzeResponse>(
      `${API_BASE_URL}/api/analyze?domain=${encodeURIComponent(sub)}`,
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
    if (signal?.aborted) {
      setSubdomainDetails(prev => ({ ...prev, [sub]: { ...prev[sub], analyzing: false, techAnalyzing: false } }));
      return false;
    }

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
        const advanced = await fetchJsonWithTimeout<AdvancedResponse>(`${API_BASE_URL}/api/advanced?subdomain=${encodeURIComponent(sub)}&browserVerified=1`, {}, 45000, signal);
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
        serviceError: analysisResult.status === 'fulfilled' || browserHttpsVerified ? undefined : 'Servis taraması yanıt vermedi; gösterilen eski bulgular kaldırıldı.',
        ...(analysis ? {
          ip: analysis.ip ?? null,
          ports,
          isCloudflare: Boolean(analysis.isCloudflare),
          probeErrors: Array.isArray(analysis.probeErrors) ? analysis.probeErrors : []
        } : browserHttpsVerified ? {
          ports
        } : { ip: null, ports: [], isCloudflare: false, probeErrors: [] }),
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
      clearAutoAnalysisTimer();
      if (serviceAbortRef.current?.domain === domain) {
        setAutoAnalysis({ domain, stage: 'done' });
        serviceAbortRef.current?.controller.abort();
        return;
      }
      if (advancedBusyRef.current.has(domain)) return;

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
          let ok = false;
          try {
            ok = await handleAnalyzeSubdomain(sub, controller.signal);
          } catch {
            setSubdomainDetails(prev => ({
              ...prev,
              [sub]: { ...prev[sub], ip: null, ports: [], analyzing: false, techAnalyzing: false,
                serviceError: 'Bu hedefte servis taraması yanıt vermedi; diğer hedefler taranmaya devam ediyor.' }
            }));
          }
          if (controller.signal.aborted) break;
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
              failed ? { error: `${failed} hedef yanıt vermedi; diğer hedefler tarandı.` } : {})
          }
        }));
        // Schedule the next step from actual completion, never from a progress render.
        setAutoAnalysis(prev => prev?.domain === domain && prev.stage === 'services'
          ? { domain, stage: cancelled ? 'done' : 'waiting-advanced',
              ...(!cancelled ? { startsAt: Date.now() + 5000 } : {}) }
          : prev);
      } finally {
        const targetSet = new Set(targets);
        setSubdomainDetails(prev => Object.fromEntries(Object.entries(prev).map(([subdomain, detail]) => [
          subdomain,
          targetSet.has(subdomain) ? { ...detail, analyzing: false, techAnalyzing: false } : detail
        ])));
        if (serviceAbortRef.current?.controller === controller) serviceAbortRef.current = null;
      }
  };

  const handleAdvancedAnalysis = async () => {
      if (!selectedDomain) return;
      const domain = selectedDomain;
      const existingController = advancedAbortRef.current.get(domain);
      if (existingController) {
        clearAutoAnalysisTimer();
        setAutoAnalysis({ domain, stage: 'done' });
        existingController.abort();
        return;
      }
      if (serviceAbortRef.current?.domain === domain) return;
      clearAutoAnalysisTimer();
      setAutoAnalysis({ domain, stage: 'done' });
      const controller = new AbortController();
      const { signal } = controller;
      advancedAbortRef.current.set(domain, controller);
      advancedBusyRef.current.add(domain);
      setAdvancedRuns(prev => ({ ...prev, [domain]: { running: true, stage: 'Pasif kaynaklar ve DNS doğrulanıyor', completed: 0, total: 0 } }));
      let targets: SubdomainData[] = [];
      let currentPhase = 'Pasif kaynaklar ve DNS doğrulama';
      let discoveryFailure: string | undefined;
      let bruteFailed = false;
      let serviceFailures = 0;

      try {
          const scanUrl = `${API_BASE_URL}/api/scan?domain=${encodeURIComponent(domain)}&validate=1`;
          let scanRaw: ScanResponse | SubdomainData[];
          try {
            try {
              scanRaw = await fetchJsonWithTimeout<ScanResponse | SubdomainData[]>(scanUrl, {}, 90000, signal);
            } catch (firstError) {
              const transientFetchFailure = firstError instanceof TypeError ||
                (firstError instanceof DOMException && firstError.name === 'AbortError');
              if (signal.aborted || !transientFetchFailure) throw firstError;
              currentPhase = 'Pasif kaynak bağlantısı yeniden deneniyor';
              setAdvancedRuns(prev => ({ ...prev, [domain]: { running: true, stage: currentPhase, completed: 0, total: 0 } }));
              await new Promise<void>((resolve, reject) => {
                const retryTimer = window.setTimeout(() => {
                  signal.removeEventListener('abort', abortRetry);
                  resolve();
                }, 1500);
                const abortRetry = () => {
                  window.clearTimeout(retryTimer);
                  reject(new DOMException('Analiz iptal edildi', 'AbortError'));
                };
                signal.addEventListener('abort', abortRetry, { once: true });
              });
              if (signal.aborted) return;
              currentPhase = 'Pasif kaynaklar ve DNS doğrulama';
              scanRaw = await fetchJsonWithTimeout<ScanResponse | SubdomainData[]>(scanUrl, {}, 90000, signal);
            }
            } catch (scanError) {
            if (signal.aborted) return;
            // Oturum reddini bağlantı kesilmesi gibi ele alma; tekrar giriş gerekir.
            if (scanError instanceof Error && /\(401\)/.test(scanError.message)) throw scanError;
            const cachedResults = subdomains[domain] || [];
            discoveryFailure = `Pasif keşif yanıt vermedi; kayıtlı ${cachedResults.length} alt domainle devam edildi.`;
            scanRaw = {
              results: cachedResults,
              sources: scanMeta[domain]?.sources || [],
              wildcard: scanMeta[domain]?.wildcard || { isWildcard: false, confidence: 'low', wildcardIps: [] },
              truncatedValidation: scanMeta[domain]?.truncatedValidation || false
            };
          }
          if (signal.aborted) return;
          let discovered: SubdomainData[] = Array.isArray(scanRaw) ? scanRaw : (scanRaw.results || []);
          const meta: ScanMeta = {
            sources: Array.isArray(scanRaw) ? [] : (scanRaw.sources || []),
            wildcard: (Array.isArray(scanRaw) ? undefined : scanRaw.wildcard) || { isWildcard: false, confidence: 'low', wildcardIps: [] },
            truncatedValidation: Array.isArray(scanRaw) ? false : Boolean(scanRaw.truncatedValidation)
          };

          currentPhase = 'Wordlist ve permütasyon DNS taraması';
          setAdvancedRuns(prev => ({ ...prev, [domain]: { running: true, stage: currentPhase, completed: 0, total: 0 } }));
          const seeds = discovered.filter(item => item.status === 'live').slice(0, 30).map(item => item.subdomain);
          try {
            const bruteRaw = await fetchJsonWithTimeout<BruteResponse>(`${API_BASE_URL}/api/brute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ domain, mode: 'both', seeds })
            }, 60000, signal);
            discovered = mergeSubdomainResults(discovered, bruteRaw.results || []);
            meta.bruteSkipped = bruteRaw.skipped;
            meta.bruteCount = (bruteRaw.results || []).length;
          } catch {
            if (signal.aborted) return;
            meta.bruteSkipped = 'timeout';
            bruteFailed = true;
          }

          if (signal.aborted) return;
          setSubdomains(prev => ({ ...prev, [domain]: discovered }));
          setScanMeta(prev => ({ ...prev, [domain]: meta }));

          currentPhase = 'E-posta ve web güvenliği inceleniyor';
          setAdvancedRuns(prev => ({ ...prev, [domain]: { running: true, stage: currentPhase, completed: 0, total: discovered.length } }));
          let emailFailed = false;
          const emailPromise = fetchJsonWithTimeout<EmailSecurityInfo>(`${API_BASE_URL}/api/email-sec?domain=${encodeURIComponent(domain)}`, {}, 12000, signal)
            .then(data => { if (!signal.aborted) setEmailSecurity(prev => ({ ...prev, [domain]: data })); })
            .catch(() => {
              if (!signal.aborted) {
                emailFailed = true;
                setEmailSecurity(prev => { const next = { ...prev }; delete next[domain]; return next; });
              }
            });

          targets = discovered.filter(item => item.status !== 'dead' && item.status !== 'private' && !item.wildcardMatch);
          const targetsNeedingPorts = targets.filter(item => !Array.isArray(subdomainDetails[item.subdomain]?.ports));
          if (targetsNeedingPorts.length) {
            currentPhase = 'Yeni hedeflerde servisler kontrol ediliyor';
            setAdvancedRuns(prev => ({ ...prev, [domain]: { running: true, stage: currentPhase, completed: 0, total: targetsNeedingPorts.length } }));
            serviceAbortRef.current = { domain, controller };
            let serviceCursor = 0;
            let serviceCompleted = 0;
            const serviceWorker = async () => {
              while (serviceCursor < targetsNeedingPorts.length && !signal.aborted) {
                const item = targetsNeedingPorts[serviceCursor++];
                let ok = false;
                try {
                  ok = await handleAnalyzeSubdomain(item.subdomain, signal);
                } catch {
                  setSubdomainDetails(prev => ({
                    ...prev,
                    [item.subdomain]: { ...prev[item.subdomain], ip: null, ports: [], analyzing: false, techAnalyzing: false,
                      serviceError: 'Bu hedefte servis taraması yanıt vermedi; diğer hedefler taranmaya devam ediyor.' }
                  }));
                }
                if (signal.aborted) break;
                serviceCompleted += 1;
                if (!ok) serviceFailures += 1;
                setAdvancedRuns(prev => ({
                  ...prev,
                  [domain]: { running: true, stage: 'Yeni hedeflerde servisler kontrol ediliyor', completed: serviceCompleted, total: targetsNeedingPorts.length, failed: serviceFailures }
                }));
              }
            };
            await Promise.all(Array.from({ length: Math.min(2, targetsNeedingPorts.length) }, () => serviceWorker()));
            if (serviceAbortRef.current?.controller === controller) serviceAbortRef.current = null;
            if (signal.aborted) return;
            setServiceRuns(prev => ({
              ...prev,
              [domain]: {
                running: false,
                stage: 'Servis Taraması Tamamlandı',
                completed: serviceCompleted,
                total: targetsNeedingPorts.length,
                failed: serviceFailures,
                ...(serviceFailures ? { error: `${serviceFailures} yeni hedef yanıt vermedi; diğer hedefler tarandı.` } : {})
              }
            }));
          }
          if (signal.aborted) return;
          let cursor = 0;
          let completed = 0;
          let failed = 0;
          const worker = async () => {
            while (cursor < targets.length && !signal.aborted) {
              const item = targets[cursor++];
              const sub = item.subdomain;
              setSubdomainDetails(prev => ({ ...prev, [sub]: { ...prev[sub], advancedAnalyzing: true, advancedError: undefined } }));
              try {
                const data = await fetchJsonWithTimeout<AdvancedResponse>(`${API_BASE_URL}/api/advanced?subdomain=${encodeURIComponent(sub)}`, {}, 45000, signal);
                if (signal.aborted) break;
                if (data.blocked || (!data.ssl && !data.advanced && !data.evidence && !data.tlsVerification)) {
                  throw new Error(data.blocked ? 'Hedef analize kapatıldı' : 'Canlı güvenlik kanıtı alınamadı');
                }
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
                if (signal.aborted) break;
                failed += 1;
                setSubdomainDetails(prev => ({
                  ...prev,
                  [sub]: {
                    ...prev[sub], ssl: undefined, security: undefined, waf: undefined, cookies: undefined,
                    evidence: undefined, tlsVerification: undefined, technologies: [], advancedAnalyzing: false,
                    advancedError: 'Güncel canlı güvenlik kanıtı alınamadı.'
                  }
                }));
              }
              if (signal.aborted) break;
              completed += 1;
              currentPhase = 'E-posta ve web güvenliği inceleniyor';
              setAdvancedRuns(prev => ({ ...prev, [domain]: { running: true, stage: currentPhase, completed, total: targets.length, failed } }));
            }
          };
          await Promise.all(Array.from({ length: Math.min(4, targets.length) }, () => worker()));
          await emailPromise;
          if (signal.aborted) return;
          const failureMessages = [
            discoveryFailure,
            bruteFailed ? 'Ek alt domain taraması yanıt vermedi.' : undefined,
            serviceFailures ? `${serviceFailures} yeni hedefte servis yanıtı alınamadı; tarama diğer hedeflerle sürdü.` : undefined,
            failed ? `${failed} hedefte canlı güvenlik yanıtı alınamadı; diğer hedefler tarandı.` : undefined,
            emailFailed ? 'E-posta güvenlik kontrolü başarısız oldu.' : undefined
          ].filter(Boolean);
          setAdvancedRuns(prev => ({
            ...prev,
            [domain]: {
              running: false,
              stage: 'Kapsamlı Analiz Tamamlandı',
              completed: targets.length,
              total: targets.length,
              failed,
              ...(failureMessages.length ? { error: failureMessages.join(' ') } : {})
            }
          }));
      } catch (err) {
          if (signal.aborted) {
            setAdvancedRuns(prev => ({ ...prev, [domain]: { running: false, stage: 'Analiz iptal edildi', completed: 0, total: 0 } }));
            return;
          }
          const message = err instanceof TypeError && err.message === 'Failed to fetch'
            ? 'Backend bağlantısı kurulamadı; ağ veya CORS kaynaklı olabilir.'
            : err instanceof Error ? err.message : 'Gelişmiş analiz tamamlanamadı';
          setAdvancedRuns(prev => ({ ...prev, [domain]: { running: false, stage: `Analiz durdu: ${currentPhase}`, completed: 0, total: 0, error: message } }));
      } finally {
          if (advancedAbortRef.current.get(domain) === controller) {
            if (signal.aborted) {
              setAdvancedRuns(prev => prev[domain]?.running
                ? { ...prev, [domain]: { running: false, stage: 'Analiz iptal edildi', completed: 0, total: 0 } }
                : prev);
              const targetSet = new Set(targets.map(item => item.subdomain));
              setSubdomainDetails(prev => Object.fromEntries(Object.entries(prev).map(([subdomain, detail]) => [
                subdomain,
                targetSet.has(subdomain) ? { ...detail, advancedAnalyzing: false } : detail
              ])));
            }
            if (serviceAbortRef.current?.controller === controller) serviceAbortRef.current = null;
            advancedAbortRef.current.delete(domain);
            advancedBusyRef.current.delete(domain);
          }
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

  const getScopeOutput = (domain: string): string =>
    scopeHosts(subdomains[domain] || [], subdomainDetails).join(', ');

  const handleGenerateScope = () => {
      if (!selectedDomain || !subdomains[selectedDomain]) return;
      const output = getScopeOutput(selectedDomain);
      setGeneratedScopes(prev => ({ ...prev, [selectedDomain]: output }));
  };

  const createCompletedScope = useEffectEvent((domain: string) => {
    // Read committed results rather than the state captured when analysis began.
    const output = getScopeOutput(domain);
    setGeneratedScopes(prev => ({ ...prev, [domain]: output }));
    setScopeReadyDomain(domain);
  });

  useEffect(() => {
    if (step !== 'dashboard' || !userDataReady) return;
    for (const [domain, run] of Object.entries(advancedRuns)) {
      if (run.running || run.stage !== 'Kapsamlı Analiz Tamamlandı' ||
        notifiedScopeRunsRef.current.get(domain) === run) continue;
      notifiedScopeRunsRef.current.set(domain, run);
      createCompletedScope(domain);
    }
  }, [advancedRuns, step, userDataReady]);

  const workspace = useMemo(() => selectedDomain
    ? buildWorkspace(selectedDomain, subdomains[selectedDomain] || [], subdomainDetails, emailSecurity[selectedDomain], scanMeta[selectedDomain])
    : null, [selectedDomain, subdomains, subdomainDetails, emailSecurity, scanMeta]);

  if (new URLSearchParams(window.location.search).get('view') === 'design-process') {
    return <DesignProcessView />;
  }

  if (authChecking) return <div className="login-container"><p role="status">Oturum kontrol ediliyor…</p></div>;

  if (step === 'login') {
    return (
      <div className="login-container">
        <div className="card login-card fade-in">
          <div className="ac-login-brand">
            <BrandLockup />
          </div>
          <div className="header">
            <h1>Saldırı yüzeyi konsolu</h1>
            <p>Hesabınızla giriş yapın</p>
            <p className="ac-login-joke">at sürenindir</p>
          </div>
          
          {authError && (
            <div className="auth-error" role="alert">
              {authError}
            </div>
          )}
          
          <form noValidate onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="email">E-posta adresi</label>
              <input 
                type="email" 
                id="email" 
                className="form-input" 
                placeholder="E-posta adresiniz"
                autoComplete="username"
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
                autoComplete="current-password"
                className="form-input" 
                placeholder="Parolanızı girin"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn" disabled={!isLoginValid || authBusy} aria-busy={authBusy}>
              {authBusy ? 'Giriş yapılıyor…' : 'Giriş Yap'}
            </button>
          </form>

        </div>
      </div>
    );
  }

  const selectedResults = selectedDomain ? (subdomains[selectedDomain] || []) : [];
  const activeRun = selectedDomain ? advancedRuns[selectedDomain] : undefined;
  const activeServiceRun = selectedDomain ? serviceRuns[selectedDomain] : undefined;
  const selectedDetails = selectedResults.map(item => subdomainDetails[item.subdomain]).filter(Boolean);
  const hasServiceResults = selectedDetails.some(detail =>
    detail.ip !== undefined || detail.ports !== undefined || detail.technologies !== undefined
  );
  const serviceScanRunning = Boolean(activeServiceRun?.running) || selectedDetails.some(detail => detail.analyzing || detail.techAnalyzing);
  const serviceRunning = serviceScanRunning && !activeRun?.running;
  const scopeText = selectedDomain ? (generatedScopes[selectedDomain] ?? getScopeOutput(selectedDomain)) : '';

  const consoleValue: ConsoleValue = {
    user: loggedInUser,
    domains,
    domain: selectedDomain,
    domainState: domain => loading[domain] || advancedRuns[domain]?.running || serviceRuns[domain]?.running ? 'scanning'
      : subdomains[domain]?.length ? 'done' : 'pending',
    domainAssetCount: domain => subdomains[domain]?.length || 0,
    domainScopeCount: domain => generatedScopes[domain] === undefined ? null : generatedScopes[domain].split(', ').filter(Boolean).length,
    ws: workspace,
    route,
    navigate,
    loading: Boolean(selectedDomain && loading[selectedDomain]),
    wakingUp: Boolean(selectedDomain && wakingUp[selectedDomain]),
    error: selectedDomain ? error[selectedDomain] || undefined : undefined,
    runs: {
      service: activeServiceRun,
      advanced: activeRun,
      serviceRunning,
      advancedRunning: Boolean(activeRun?.running),
      autoStage: automaticStage,
      autoCountdown,
      autoScheduled: selectedSubdomainsReady && automaticStartsAt !== undefined
    },
    scope: {
      hosts: scopeText.split(', ').filter(Boolean),
      text: scopeText,
      saved: Boolean(selectedDomain && generatedScopes[selectedDomain] !== undefined),
      canGenerate: hasServiceResults && !serviceRunning,
      generate: handleGenerateScope
    },
    actions: {
      selectDomain: domain => {
        handleDomainClick(domain);
        if (route.view === 'targets' || route.host) navigate({ view: route.view === 'targets' ? 'dashboard' : route.view });
      },
      addDomain: domain => {
        const normalized = domain.trim().toLowerCase();
        if (!DOMAIN_PATTERN.test(normalized)) return false;
        if (!domains.includes(normalized)) setDomains(prev => [...prev, normalized]);
        handleDomainClick(normalized);
        if (route.view === 'targets') navigate({ view: 'dashboard' });
        return true;
      },
      deleteDomain: handleDeleteDomain,
      refresh: () => { if (selectedDomain) void fetchSubdomains(selectedDomain, true); },
      analyzeAll: () => { void handleAnalyzeAll(); },
      advancedAnalysis: () => { void handleAdvancedAnalysis(); },
      analyzeHost: host => { void handleAnalyzeSubdomain(host); },
      logout: () => { void handleLogout(); }
    },
    ai: {
      report: selectedDomain ? aiReports[selectedDomain] : undefined,
      saveReport: (domain, report) => {
        setAiReports(prev => {
          const next = { ...prev };
          if (report) next[domain] = report; else delete next[domain];
          return next;
        });
      }
    },
    authBusy
  };

  const views: Record<ViewId, ReactNode> = {
    dashboard: <DashboardView />,
    assets: <AssetsView />,
    findings: <FindingsView />,
    tech: <TechnologiesView />,
    scope: <ScopeView />,
    ai: <AiView />,
    targets: <TargetsView />
  };

  return (
    <ConsoleContext.Provider value={consoleValue}>
      {authError && <p role="alert" className="auth-error ac-floating-alert">{authError}</p>}
      {scopeReadyDomain && (
        <ScopeReadyDialog domain={scopeReadyDomain}
          targetCount={(generatedScopes[scopeReadyDomain] || '').split(', ').filter(Boolean).length}
          onDismiss={() => setScopeReadyDomain(null)} />
      )}
      <ConsoleShell>{views[route.view]}</ConsoleShell>
    </ConsoleContext.Provider>
  );
}

export default App;
