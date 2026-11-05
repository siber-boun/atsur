import { useState, type FormEvent, type ReactNode } from 'react';
import { DOMAIN_PATTERN, useConsole } from '../lib/console';
import type { ViewId } from '../lib/route';
import { BrandLockup } from './Logo';
import { AiIcon, AssetsIcon, DashboardIcon, FindingsIcon, GlobeIcon, LogoutIcon, RefreshIcon, ScopeIcon, SearchIcon, TargetsIcon, TechIcon } from './Icons';

const NAV: Array<{ id: ViewId; label: string; icon: () => ReactNode; group: 'work' | 'admin' }> = [
  { id: 'dashboard', label: 'Dashboard', icon: DashboardIcon, group: 'work' },
  { id: 'assets', label: 'Varlıklar', icon: AssetsIcon, group: 'work' },
  { id: 'findings', label: 'Bulgular', icon: FindingsIcon, group: 'work' },
  { id: 'tech', label: 'Teknolojiler', icon: TechIcon, group: 'work' },
  { id: 'scope', label: 'Kapsam', icon: ScopeIcon, group: 'work' },
  { id: 'ai', label: 'AI Analiz', icon: AiIcon, group: 'work' },
  { id: 'targets', label: 'Hedefler', icon: TargetsIcon, group: 'admin' }
];

const STATE_LABEL = { done: 'TAMAMLANDI', scanning: 'TARANIYOR', pending: 'BEKLİYOR' } as const;

function TargetSwitcher() {
  const { domains, domain, domainState, actions } = useConsole();
  if (!domains.length) return null;
  const state = domain ? domainState(domain) : undefined;
  return (
    <label className="ac-target">
      <span className="ac-target-lbl">Hedef</span>
      <select value={domain || ''} onChange={event => event.target.value && actions.selectDomain(event.target.value)} aria-label="Aktif hedef domain">
        {!domain && <option value="">Hedef seçin</option>}
        {domains.map(item => <option key={item} value={item}>{item}</option>)}
      </select>
      {state && <span className={`ac-badge t-${state === 'done' ? 'live' : state === 'scanning' ? 'warn' : 'none'}`}>{STATE_LABEL[state]}</span>}
    </label>
  );
}

function AddDomainForm() {
  const { actions } = useConsole();
  const [value, setValue] = useState('');
  const trimmed = value.trim().toLowerCase();
  const valid = DOMAIN_PATTERN.test(trimmed);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid && actions.addDomain(trimmed)) setValue('');
  };
  return (
    <form className="ac-cmd" onSubmit={submit} aria-label="Yeni hedef domain ekle">
      <SearchIcon />
      <input type="text" placeholder="Domain ekle — örn. sirketadi.com" value={value}
        onChange={event => setValue(event.target.value)} aria-label="Yeni hedef domain" autoComplete="off" spellCheck={false} />
      <button className="ac-btn small" type="submit" disabled={!valid}>Ekle</button>
    </form>
  );
}

function RunButtons() {
  const { domain, ws, runs, actions } = useConsole();
  if (!domain || !ws?.rows.length) return null;
  const { service, advanced, serviceRunning, advancedRunning, autoStage, autoCountdown, autoScheduled } = runs;
  return (
    <div className="ac-run-buttons">
      <button type="button" className={`ac-btn ${serviceRunning ? 'is-cancel' : ''}`} onClick={actions.analyzeAll}
        disabled={advancedRunning} aria-busy={serviceRunning}>
        <GlobeIcon />
        {serviceRunning
          ? `İptal et (${service?.completed || 0}/${service?.total || 0})`
          : autoStage === 'waiting-services' && autoScheduled ? `Servisleri tara (${autoCountdown} sn)` : 'Servisleri tara'}
      </button>
      <button type="button" className={`ac-btn primary ${advancedRunning ? 'is-cancel' : ''}`} onClick={actions.advancedAnalysis}
        disabled={serviceRunning && !advancedRunning} aria-busy={advancedRunning}>
        <RefreshIcon />
        {advancedRunning ? `Analizi iptal et${advanced?.total ? ` (${advanced.completed}/${advanced.total})` : ''}`
          : autoStage === 'waiting-advanced' && autoScheduled ? `Tam kapsamlı analiz (${autoCountdown} sn)` : 'Tam kapsamlı analiz'}
      </button>
    </div>
  );
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  const { route, navigate, ws, domains, domain, user, actions, authBusy, runs } = useConsole();
  const counts: Partial<Record<ViewId, number>> = {
    assets: ws?.rows.length,
    findings: ws?.findings.length,
    tech: ws?.technologies.length,
    targets: domains.length
  };
  const busy = runs.serviceRunning || runs.advancedRunning;

  return (
    <div className="ac-shell">
      <header className="ac-top">
        <BrandLockup />
        <TargetSwitcher />
        <AddDomainForm />
        <div className="ac-top-actions">
          <RunButtons />
          <span className="ac-sys"><span className="ac-dot" />{busy ? 'TARAMA SÜRÜYOR' : 'SİSTEM AKTİF'}</span>
          <button type="button" className="ac-avatar" onClick={actions.logout} disabled={authBusy}
            title={`${user || 'Kullanıcı'} · Çıkış yap`} aria-label="Çıkış yap">
            {user ? user.charAt(0).toUpperCase() : 'U'}
          </button>
        </div>
      </header>

      <div className="ac-body">
        <nav className="ac-rail" aria-label="Ana menü">
          <div className="ac-rail-h">Çalışma alanı</div>
          {NAV.filter(item => item.group === 'work').map(item => (
            <NavButton key={item.id} id={item.id} label={item.label} icon={item.icon()} count={counts[item.id]}
              active={route.view === item.id} alert={item.id === 'findings'} onClick={() => navigate({ view: item.id })} />
          ))}
          <div className="ac-rail-h">Yönetim</div>
          {NAV.filter(item => item.group === 'admin').map(item => (
            <NavButton key={item.id} id={item.id} label={item.label} icon={item.icon()} count={counts[item.id]}
              active={route.view === item.id} onClick={() => navigate({ view: item.id })} />
          ))}
          <div className="ac-rail-foot">
            <span title={user || ''}>{user}</span>
            <button type="button" className="ac-link-btn" onClick={actions.logout} disabled={authBusy}><LogoutIcon /> Çıkış yap</button>
          </div>
        </nav>
        <main className="ac-main" id="main"><div className="ac-view" key={route.view}>{children}</div></main>
      </div>

      <footer className="ac-statusbar" aria-live="polite">
        <span className={domain ? 'is-on' : ''}>● {domain ? 'ACTIVE' : 'IDLE'}</span>
        <span>{domains.length} hedef kayıtlı</span>
        {domain && <span className="ac-mono">{domain}</span>}
        <span className="ac-statusbar-r">ATSUR · attack surface <span className="ac-joke">· at sürenindir</span></span>
      </footer>
    </div>
  );
}

function NavButton({ id, label, icon, count, active, alert, onClick }: {
  id: ViewId; label: string; icon: ReactNode; count?: number; active: boolean; alert?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" className={`ac-nav ${active ? 'on' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined} data-view={id}>
      {icon}
      <span>{label}</span>
      {id === 'ai' ? <span className="ac-nav-cnt">beta</span> :
        typeof count === 'number' && count > 0 ? <span className={`ac-nav-cnt ${alert ? 'alert' : ''}`}>{count}</span> : null}
    </button>
  );
}
