import { useState, useEffect } from 'react';
import './index.css';

type Step = 'login' | 'register' | 'dashboard';

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

interface PortInfo {
  port: number;
  status: number | string;
  protocol: string;
}

interface TechInfo {
  name: string;
  category: string;
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

// User data structure for localStorage
interface UserData {
  password: string;
  domains: string[];
  subdomainsCache: Record<string, SubdomainData[]>;
  subdomainDetailsCache: Record<string, SubdomainDetail>;
  emailSecCache: Record<string, EmailSecurityInfo>;
}

// API Base URL - Local'de /api (Vite proxy üzerinden), Canlıda Render URL'si
// Workers dağıtımında VITE_API_URL tanımlı değilse göreli /api isteği statik
// arayüzün kendisine gider. Canlı Render backend'i güvenli varsayılandır.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://osint-zgg4.onrender.com';

function App() {
  const [step, setStep] = useState<Step>('login');
  
  // Auth states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [loggedInUser, setLoggedInUser] = useState<string | null>(null);
  
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
  const [scopeOutput, setScopeOutput] = useState<string>('');
  const [showScope, setShowScope] = useState<boolean>(false);
  
  const isLoginValid = email.includes('@') && password.length >= 6;
  const isRegisterValid = isLoginValid && password === confirmPassword;
  
  // Sıkı domain doğrulaması (Sadece harf, rakam, tire ve nokta)
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  const isDomainValid = domainRegex.test(domainInput);

  // Load user data on login
  useEffect(() => {
    if (loggedInUser) {
      const usersRaw = localStorage.getItem('osint_users');
      if (usersRaw) {
        const users: Record<string, UserData> = JSON.parse(usersRaw);
        if (users[loggedInUser]) {
          setDomains(users[loggedInUser].domains || []);
          setSubdomains(users[loggedInUser].subdomainsCache || {});
          setSubdomainDetails(users[loggedInUser].subdomainDetailsCache || {});
          setEmailSecurity(users[loggedInUser].emailSecCache || {});
        }
      }
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
    if (loggedInUser) {
      const usersRaw = localStorage.getItem('osint_users');
      const users: Record<string, UserData> = usersRaw ? JSON.parse(usersRaw) : {};
      
      if (users[loggedInUser]) {
        users[loggedInUser].domains = domains;
        users[loggedInUser].subdomainsCache = subdomains;
        users[loggedInUser].subdomainDetailsCache = subdomainDetails;
        users[loggedInUser].emailSecCache = emailSecurity;
        localStorage.setItem('osint_users', JSON.stringify(users));
      }
    }
  }, [domains, subdomains, subdomainDetails, emailSecurity, loggedInUser]);

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    
    if (isRegisterValid) {
      const usersRaw = localStorage.getItem('osint_users');
      const users: Record<string, UserData> = usersRaw ? JSON.parse(usersRaw) : {};
      
      if (users[email]) {
        setAuthError('Bu e-posta adresi ile zaten bir hesap var.');
        return;
      }
      
      users[email] = { password, domains: [], subdomainsCache: {}, subdomainDetailsCache: {}, emailSecCache: {} };
      localStorage.setItem('osint_users', JSON.stringify(users));
      
      setLoggedInUser(email);
      setStep('dashboard');
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    
    if (isLoginValid) {
      const usersRaw = localStorage.getItem('osint_users');
      const users: Record<string, UserData> = usersRaw ? JSON.parse(usersRaw) : {};
      
      if (!users[email] || users[email].password !== password) {
        setAuthError('Hatalı e-posta veya şifre.');
        return;
      }
      
      setLoggedInUser(email);
      setStep('dashboard');
    }
  };

  const handleLogout = () => {
    setLoggedInUser(null);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
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
        const usersRaw = localStorage.getItem('osint_users');
        if (usersRaw) {
            const users = JSON.parse(usersRaw);
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
      const response = await fetch(`${API_BASE_URL}/api/scan?domain=${domain}`);
      clearTimeout(wakeUpTimer);
      if (!response.ok) {
        throw new Error('API yanıt vermedi');
      }
      
      // Faz 5'ten itibaren backend tarama metadatasıyla birlikte bir nesne döner;
      // eski dizi cevabı da önbellekteki/geri alınmış sürümler için desteklenir.
      const raw = await response.json();
      const list: SubdomainData[] = Array.isArray(raw) ? raw : raw.results;
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

  const handleAnalyzeSubdomain = async (sub: string) => {
    setSubdomainDetails(prev => ({ ...prev, [sub]: { ...prev[sub], analyzing: true, techAnalyzing: true } }));
    
    // Port and Web Service Analysis
    fetch(`${API_BASE_URL}/api/analyze?domain=${sub}`)
      .then(res => res.json())
      .then(data => {
        setSubdomainDetails(prev => ({ 
            ...prev, 
            [sub]: { ...prev[sub], ip: data.ip, ports: data.ports, isCloudflare: data.isCloudflare, analyzing: false } 
        }));
      })
      .catch(() => {
        setSubdomainDetails(prev => ({ 
            ...prev, 
            [sub]: { ...prev[sub], ip: null, ports: [], isCloudflare: false, analyzing: false } 
        }));
      });

    // Technology Fingerprinting Analysis
    fetch(`${API_BASE_URL}/api/tech?subdomain=${sub}`)
      .then(res => res.json())
      .then(data => {
         setSubdomainDetails(prev => ({ 
            ...prev, 
            [sub]: { ...prev[sub], technologies: data, techAnalyzing: false } 
         }));
      })
      .catch(() => {
         setSubdomainDetails(prev => ({ 
            ...prev, 
            [sub]: { ...prev[sub], technologies: [], techAnalyzing: false } 
         }));
      });
  };

  const handleAnalyzeAll = async () => {
      if (!selectedDomain || !subdomains[selectedDomain]) return;
      const subs = subdomains[selectedDomain];
      
      for (const item of subs) {
          const isLegacyString = typeof item === 'string';
          const sub = isLegacyString ? (item as string) : item.subdomain;
          if (!subdomainDetails[sub] || (subdomainDetails[sub].ip === null && (!subdomainDetails[sub].ports || subdomainDetails[sub].ports!.length === 0))) {
              await handleAnalyzeSubdomain(sub);
              // Rate limit on frontend side as well to avoid overwhelming our own backend
              await new Promise(resolve => setTimeout(resolve, 300));
          }
      }
  };

  const handleAdvancedAnalysis = async () => {
      if (!selectedDomain) return;
      const domain = selectedDomain;
      if (advancedRuns[domain]?.running) return;
      setAdvancedRuns(prev => ({ ...prev, [domain]: { running: true, stage: 'Pasif kaynaklar ve DNS doğrulanıyor', completed: 0, total: 0 } }));

      try {
          const scanResponse = await fetch(`${API_BASE_URL}/api/scan?domain=${domain}&validate=1`);
          if (!scanResponse.ok) throw new Error('Çok kaynaklı tarama başlatılamadı');
          const scanRaw = await scanResponse.json();
          let discovered: SubdomainData[] = Array.isArray(scanRaw) ? scanRaw : (scanRaw.results || []);
          const meta: ScanMeta = {
            sources: Array.isArray(scanRaw) ? [] : (scanRaw.sources || []),
            wildcard: Array.isArray(scanRaw) ? { isWildcard: false, confidence: 'low', wildcardIps: [] } : scanRaw.wildcard,
            truncatedValidation: Array.isArray(scanRaw) ? false : Boolean(scanRaw.truncatedValidation)
          };

          setAdvancedRuns(prev => ({ ...prev, [domain]: { running: true, stage: 'Wordlist ve permütasyon DNS taraması', completed: 0, total: 0 } }));
          const seeds = discovered.filter(item => item.status === 'live').slice(0, 30).map(item => item.subdomain);
          const bruteResponse = await fetch(`${API_BASE_URL}/api/brute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, mode: 'both', seeds })
          });
          if (bruteResponse.ok) {
            const bruteRaw = await bruteResponse.json();
            discovered = mergeSubdomainResults(discovered, bruteRaw.results || []);
            meta.bruteSkipped = bruteRaw.skipped;
            meta.bruteCount = (bruteRaw.results || []).length;
          }

          setSubdomains(prev => ({ ...prev, [domain]: discovered }));
          setScanMeta(prev => ({ ...prev, [domain]: meta }));

          setAdvancedRuns(prev => ({ ...prev, [domain]: { running: true, stage: 'E-posta ve web güvenliği inceleniyor', completed: 0, total: discovered.length } }));
          const emailPromise = fetch(`${API_BASE_URL}/api/email-sec?domain=${domain}`)
            .then(res => res.ok ? res.json() : null)
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
                const response = await fetch(`${API_BASE_URL}/api/advanced?subdomain=${sub}`);
                const data = response.ok ? await response.json() : null;
                setSubdomainDetails(prev => ({
                  ...prev,
                  [sub]: {
                    ...prev[sub],
                    ...(data ? { ssl: data.ssl, security: data.advanced?.security, waf: data.advanced?.waf } : {}),
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

          // 2. Sadece aktif portu/web servisi olanları ekle
          if (detail && detail.ports && detail.ports.length > 0) {
              const hasActiveWeb = detail.ports.some(p => p.status === 200 || p.status === 201 || String(p.status).startsWith('3') || String(p.status).startsWith('4') || String(p.status).startsWith('5'));
              if (hasActiveWeb) {
                  validSubdomains.push(sub);
              }
          }
      });

      setScopeOutput(validSubdomains.join(', '));
      setShowScope(true);
  };

  if (step === 'login' || step === 'register') {
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
            <p>{step === 'login' ? 'Sisteme erişmek için giriş yapın' : 'Yeni bir hesap oluşturun'}</p>
          </div>
          
          {authError && (
            <div className="auth-error">
              {authError}
            </div>
          )}
          
          <form onSubmit={step === 'login' ? handleLogin : handleRegister}>
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

            {step === 'register' && (
              <div className="form-group fade-in">
                <label htmlFor="confirmPassword">Şifre Tekrar</label>
                <input 
                  type="password" 
                  id="confirmPassword" 
                  className="form-input" 
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            )}
            
            <button type="submit" className="btn" disabled={step === 'login' ? !isLoginValid : !isRegisterValid}>
              {step === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
            </button>
          </form>

          <div className="auth-switch">
            {step === 'login' ? (
              <p>Hesabınız yok mu? <button className="text-link" onClick={() => { setStep('register'); setAuthError(''); }}>Kayıt Olun</button></p>
            ) : (
              <p>Zaten hesabınız var mı? <button className="text-link" onClick={() => { setStep('login'); setAuthError(''); }}>Giriş Yapın</button></p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const selectedResults = selectedDomain ? (subdomains[selectedDomain] || []) : [];
  const activeMeta = selectedDomain ? scanMeta[selectedDomain] : undefined;
  const activeRun = selectedDomain ? advancedRuns[selectedDomain] : undefined;
  const liveCount = selectedResults.filter(item => typeof item !== 'string' && item.status === 'live').length;
  const unknownCount = selectedResults.filter(item => typeof item !== 'string' && item.status === 'unknown').length;
  const healthySources = activeMeta?.sources.filter(source => source.ok).length || 0;

  // Dashboard View
  return (
    <div className="dashboard-layout fade-in">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <svg xmlns="http://www.w3.org/0000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <span>BUSIBER OSINT Platform</span>
          </div>
        </div>
        
        <div className="sidebar-content">
          <h3 className="section-title">İncelenecek Domainler</h3>
          
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
                      <span className="domain-icon">🌐</span>
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
            <div className="info-card">
              <div className="info-icon">ℹ️</div>
              <div className="info-text">
                <h4>Detaylı Analiz İçin Seçim Yapın</h4>
                <p>Pasif istihbarat kaynaklarını, DNS doğrulamasını ve web güvenliği bulgularını tek akışta görmek için soldan bir hedef seçin. <strong>Girilen veriler hesabınıza özel olarak tarayıcınızda kaydedilir.</strong></p>
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
                    <button 
                      className="btn btn-inline"
                      onClick={handleAnalyzeAll}
                    >
                      Servisleri tara
                    </button>
                  )}

                  <button 
                    className="btn-text" 
                    onClick={() => fetchSubdomains(selectedDomain, true)}
                    title="Yenile"
                  >
                    <svg xmlns="http://www.w3.org/0000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                    Yenile
                  </button>
                </div>
              </div>

              {(activeMeta || activeRun) && (
                <section className="intel-strip" aria-live="polite">
                  <div className="intel-stat"><span>Kaynaklar</span><strong>{healthySources}<small>/{activeMeta?.sources.length || 0}</small></strong></div>
                  <div className="intel-stat"><span>DNS canlı</span><strong>{liveCount}</strong></div>
                  <div className="intel-stat"><span>Bekleyen</span><strong>{unknownCount}</strong></div>
                  <div className="intel-stat"><span>Brute keşfi</span><strong>{activeMeta?.bruteSkipped === 'wildcard' ? 'Atlandı' : (activeMeta?.bruteCount ?? '—')}</strong></div>
                  <div className={`intel-state ${activeRun?.running ? 'is-running' : ''}`}>
                    <span>{activeRun?.stage || (activeMeta?.wildcard.isWildcard ? 'Wildcard algılandı' : 'Pasif keşif hazır')}</span>
                    {activeRun?.running && activeRun.total > 0 && <strong>{activeRun.completed}/{activeRun.total}</strong>}
                    <div className="signal-track"><i style={{ width: activeRun?.running && activeRun.total ? `${Math.max(4, (activeRun.completed / activeRun.total) * 100)}%` : '100%' }}></i></div>
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
                                  <span className="analyzing-text">Web servisleri kontrol ediliyor...</span>
                              ) : detail ? (
                                  <div className="detail-rows">
                                    <div className="detail-row">
                                      <span className="ip-badge">{detail.ip || itemIp || 'DNS Çözülemedi'}</span>
                                      {detail.isCloudflare && (
                                        <span className="cf-badge" title="Cloudflare Koruması Aktif">
                                          <svg xmlns="http://www.w3.org/0000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M17.5 19c2.5 0 4.5-2 4.5-4.5a4.5 4.5 0 0 0-4-4.43V10a5 5 0 0 0-9.8-1.4 3.5 3.5 0 0 0-5.7 2.4A4.5 4.5 0 0 0 6.5 19h11Z"/></svg>
                                          Cloudflare
                                        </span>
                                      )}
                                    </div>
                                    
                                    {detail.ports && detail.ports.length > 0 ? (
                                      <div className="ports-container">
                                          {detail.ports.map((p, pIdx) => {
                                              let statusBadgeClass = 'status-badge-gray';
                                              if (p.status === 200 || p.status === 201) statusBadgeClass = 'status-badge-green';
                                              else if (String(p.status).startsWith('3')) statusBadgeClass = 'status-badge-blue';
                                              else if (String(p.status).startsWith('4') || String(p.status).startsWith('5')) statusBadgeClass = 'status-badge-red';
                                              else statusBadgeClass = 'status-badge-gray';

                                              const scheme = p.protocol === 'https:' ? 'https' : 'http';
                                              const portStr = (scheme === 'https' && p.port === 443) || (scheme === 'http' && p.port === 80) ? '' : `:${p.port}`;
                                              const targetUrl = `${scheme}://${sub}${portStr}`;

                                              return (
                                                  <a 
                                                      key={pIdx} 
                                                      href={targetUrl} 
                                                      target="_blank" 
                                                      rel="noopener noreferrer" 
                                                      className="port-badge-group clickable-port"
                                                      title={`${targetUrl} adresine git`}
                                                  >
                                                      <span className="port-number">:{p.port}</span>
                                                      <span className={`status-badge-detailed ${statusBadgeClass}`}>{p.status}</span>
                                                  </a>
                                              );
                                          })}
                                      </div>
                                    ) : (
                                        <span className="no-ports-text">Açık web servisi bulunamadı</span>
                                        )}

                                        {detail.advancedAnalyzing && (
                                        <span className="analyzing-text" style={{ marginTop: '0.5rem' }}>Gelişmiş analiz yapılıyor...</span>
                                        )}

                                        {!detail.advancedAnalyzing && detail.ssl && (
                                        <div className="advanced-stats-container">
                                          <div className="advanced-row">
                                              <span className="adv-label">SSL:</span>
                                              <span className={`status-badge-detailed ${detail.ssl.valid ? 'status-badge-green' : 'status-badge-red'}`}>{detail.ssl.valid ? 'Geçerli' : 'Geçersiz'}</span>
                                              <span className="adv-value">({detail.ssl.daysLeft} gün, {detail.ssl.issuer})</span>
                                              <span className={`grade-badge grade-${detail.ssl.grade}`}>{detail.ssl.grade}</span>
                                          </div>
                                          {detail.security && (
                                              <div className="advanced-row">
                                                  <span className="adv-label">HTTP Header Güvenliği:</span>
                                                  <span className="adv-value">Skor: {detail.security.score}/100</span>
                                                  <span className={`grade-badge grade-${detail.security.grade}`}>{detail.security.grade}</span>
                                                  {detail.security.missing && detail.security.missing.length > 0 && (
                                                      <span className="missing-headers" title={detail.security.missing.join(', ')}>
                                                          Eksik: {detail.security.missing.slice(0, 2).join(', ')}{detail.security.missing.length > 2 ? '...' : ''}
                                                      </span>
                                                  )}
                                              </div>
                                          )}
                                          {detail.waf && detail.waf.detected && (
                                              <div className="advanced-row">
                                                  <span className="adv-label">WAF:</span>
                                                  <span className="cf-badge">{detail.waf.name} Korumalı</span>
                                              </div>
                                          )}
                                        </div>
                                        )}

                                        {detail.technologies && detail.technologies.length > 0 && (                                      <div className="tech-container">
                                          {detail.technologies.map((t, tIdx) => {
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
                        <div className="action-buttons-row">
                            <button className="btn btn-secondary" onClick={handleGenerateScope} style={{ width: 'auto' }}>
                                <svg xmlns="http://www.w3.org/0000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                                Kapsam Oluştur (Aktif Web Sunucuları)
                            </button>
                            <button className="btn btn-advanced" onClick={handleAdvancedAnalysis} disabled={activeRun?.running}>
                                <svg xmlns="http://www.w3.org/0000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                                {activeRun?.running ? 'Analiz sürüyor' : 'Tam kapsamlı analiz'}
                            </button>
                        </div>

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
                            return detail && (detail.ssl || detail.security || detail.advancedAnalyzing);
                        }) && (
                            <div className="advanced-summary-box fade-in">
                                <h4>Gelişmiş Analiz Özeti</h4>
                                <div className="table-responsive">
                                    <table className="summary-table">
                                        <thead>
                                            <tr>
                                                <th>Subdomain</th>
                                                <th>SSL Skoru</th>
                                                <th>Sertifika</th>
                                                <th>HTTP Header Skoru</th>
                                                <th>Eksik Headerlar</th>
                                                <th>WAF Koruması</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {subdomains[selectedDomain].map((item, idx) => {
                                                const sub = typeof item === 'string' ? (item as string) : item.subdomain;
                                                const detail = subdomainDetails[sub];
                                                
                                                if (!detail || (!detail.ssl && !detail.security && !detail.advancedAnalyzing)) return null;

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
                                                        <td>
                                                            {detail.advancedAnalyzing ? <span className="analyzing-text-small">Taranıyor...</span> : 
                                                             detail.security ? <span className={`grade-badge grade-${detail.security.grade}`}>{detail.security.grade}</span> : <span className="text-muted">-</span>}
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
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
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
    </div>
  );
}

export default App;
