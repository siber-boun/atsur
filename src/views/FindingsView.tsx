import { useState } from 'react';
import { useConsole } from '../lib/console';
import { countBySeverity, SEVERITY_META, SEVERITY_ORDER, type Severity } from '../lib/findings';
import { Badge, EmptyState, ViewHead } from '../components/ui';
import { TargetGate } from './TargetGate';

function Findings() {
  const { ws, navigate } = useConsole();
  const [filter, setFilter] = useState<Severity | 'all'>('all');
  if (!ws) return null;
  const { findings } = ws;
  const counts = countBySeverity(findings);
  const affected = new Set(findings.flatMap(finding => finding.hosts)).size;
  const visible = findings.filter(finding => filter === 'all' || finding.severity === filter);

  return (
    <>
      <ViewHead eyebrow="Bulgular" title={`${findings.length} bulgu · ${affected} etkilenen varlık`} />
      {!findings.length ? (
        <EmptyState title={ws.stats.analyzed ? 'Bulgu yok' : 'Henüz bulgu üretilmedi'}>
          <p className="ac-note">Bulgular servis taraması ve tam kapsamlı analiz sonuçlarından türetilir: TLS, güvenlik başlıkları, açık portlar, teknolojiler ve e-posta güvenliği.</p>
        </EmptyState>
      ) : (
        <>
          <div className="ac-card">
            <div className="ac-sevbar" role="img" aria-label={SEVERITY_ORDER.map(severity => `${counts[severity]} ${SEVERITY_META[severity].label}`).join(', ')}>
              {SEVERITY_ORDER.filter(severity => counts[severity]).map(severity => (
                <div key={severity} className={`t-${severity}`} style={{ width: `${(counts[severity] / findings.length) * 100}%` }} />
              ))}
            </div>
            <div className="ac-seg spaced" role="group" aria-label="Önem derecesi">
              {(['all', ...SEVERITY_ORDER] as const).map(id => (
                <button key={id} type="button" className={filter === id ? 'on' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                  {id === 'all' ? `Tümü (${findings.length})` : `${SEVERITY_META[id].label} (${counts[id]})`}
                </button>
              ))}
            </div>
          </div>
          <div className="ac-findings">
            {visible.map(finding => (
              <article key={finding.id} className="ac-finding">
                <Badge tone={finding.severity}>{SEVERITY_META[finding.severity].label}</Badge>
                <div>
                  <h3>{finding.title}</h3>
                  <p>{finding.description}</p>
                </div>
                <div className="ac-finding-hosts">
                  {finding.hosts.map(host => (
                    <button key={host} type="button" className="ac-hostchip"
                      onClick={() => navigate(host === ws.domain && !ws.rows.some(row => row.name === host) ? { view: 'dashboard' } : { view: 'assets', host })}>
                      {host}
                    </button>
                  ))}
                </div>
              </article>
            ))}
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
