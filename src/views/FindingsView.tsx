import { useEffect, useRef, useState } from 'react';
import { useConsole } from '../lib/console';
import { countBySeverity, SEVERITY_META, SEVERITY_ORDER, type Finding, type Severity } from '../lib/findings';
import { Badge, EmptyState, ViewHead } from '../components/ui';
import { TargetGate } from './TargetGate';

function FindingDetail({ finding, domain, hostNames, onOpenHost }: {
  finding: Finding; domain: string; hostNames: Set<string>; onOpenHost: (host: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: 0 }); }, [finding.id]);
  return (
    <article className="ac-fdetail" aria-labelledby="finding-title" ref={ref}>
      <div className="ac-inline">
        <Badge tone={finding.severity}>{SEVERITY_META[finding.severity].label}</Badge>
        <span className="ac-fcat">{finding.category}</span>
      </div>
      <h2 id="finding-title">{finding.title}</h2>
      <p className="ac-fdesc">{finding.description}</p>

      <section className="ac-fblock">
        <h3>Önerilen düzeltme</h3>
        <p>{finding.remediation}</p>
      </section>

      <section className="ac-fblock">
        <h3>Etkilenen varlıklar · {finding.hosts.length}</h3>
        <ul className="ac-fhosts">
          {finding.hosts.map(host => {
            const isAsset = hostNames.has(host);
            return (
              <li key={host}>
                <span className="ac-fhost-name">{host}{host === domain && !isAsset ? <span className="ac-muted"> · alan adı</span> : null}</span>
                <span className="ac-fhost-ev">{finding.evidence[host] || '—'}</span>
                {isAsset && <button type="button" className="ac-btn small ghost" onClick={() => onOpenHost(host)}>Varlığı aç</button>}
              </li>
            );
          })}
        </ul>
      </section>
    </article>
  );
}

function Findings() {
  const { ws, route, navigate } = useConsole();
  const [filter, setFilter] = useState<Severity | 'all'>('all');
  if (!ws) return null;
  const { findings } = ws;
  const counts = countBySeverity(findings);
  const affected = new Set(findings.flatMap(finding => finding.hosts)).size;
  const visible = findings.filter(finding => filter === 'all' || finding.severity === filter);
  const selected = visible.find(finding => finding.id === route.finding) || visible[0];
  const hostNames = new Set(ws.rows.map(row => row.name));
  const select = (id: string) => {
    navigate({ view: 'findings', finding: id });
    // Dar ekranda detay listenin altında kalır; seçimden sonra ona kaydır.
    if (window.matchMedia('(max-width: 900px)').matches) {
      window.requestAnimationFrame(() => document.querySelector('.ac-fdetail')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
  };

  return (
    <>
      <ViewHead eyebrow="Bulgular" title={`${findings.length} bulgu · ${affected} etkilenen varlık`} />
      {!findings.length ? (
        <EmptyState title={ws.stats.analyzed ? 'Bulgu yok' : 'Henüz bulgu üretilmedi'}>
          <p className="ac-note">Bulgular servis taraması ve tam kapsamlı analiz sonuçlarından türetilir: TLS, güvenlik başlıkları, açık portlar, teknolojiler ve e-posta güvenliği.</p>
        </EmptyState>
      ) : (
        <>
          <div className="ac-quick ac-sev-tiles" role="group" aria-label="Önem derecesine göre filtrele">
            <button type="button" className={`ac-quick-tile ${filter === 'all' ? 'on' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              <span className="ac-quick-n">{findings.length}</span><span className="ac-quick-l">Tümü</span>
            </button>
            {SEVERITY_ORDER.map(severity => (
              <button key={severity} type="button" disabled={!counts[severity]}
                className={`ac-quick-tile sev s-${severity} ${filter === severity ? 'on' : ''}`} aria-pressed={filter === severity}
                onClick={() => setFilter(filter === severity ? 'all' : severity)}>
                <span className="ac-quick-n">{counts[severity]}</span><span className="ac-quick-l">{SEVERITY_META[severity].label}</span>
              </button>
            ))}
          </div>

          <div className="ac-split ac-findings-split">
            <nav className="ac-flist" aria-label="Bulgu listesi">
              {SEVERITY_ORDER.filter(severity => visible.some(finding => finding.severity === severity)).map(severity => (
                <section key={severity}>
                  <h2 className={`ac-flist-h s-${severity}`}>{SEVERITY_META[severity].label} <span>{counts[severity]}</span></h2>
                  <ul>
                    {visible.filter(finding => finding.severity === severity).map(finding => (
                      <li key={finding.id}>
                        <button type="button" className={`ac-fitem ${selected?.id === finding.id ? 'on' : ''}`}
                          aria-current={selected?.id === finding.id ? 'true' : undefined} onClick={() => select(finding.id)}>
                          <span className={`ac-sev-dot s-${finding.severity}`} aria-hidden="true" />
                          <span className="ac-fitem-copy">
                            <span className="ac-fitem-title">{finding.title}</span>
                            <span className="ac-fitem-meta">{finding.category} · {finding.hosts.length} varlık</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </nav>
            {selected && (
              <FindingDetail finding={selected} domain={ws.domain} hostNames={hostNames}
                onOpenHost={host => navigate({ view: 'assets', host })} />
            )}
          </div>
          <p className="ac-note">Bulgular pasif tarama verisinden kurallarla türetilir; doğrulanmış zafiyet değildir. Kesin sonuç için manuel doğrulama yapın.</p>
        </>
      )}
    </>
  );
}

export function FindingsView() {
  return <TargetGate><Findings /></TargetGate>;
}
