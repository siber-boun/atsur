import { useState } from 'react';
import { useConsole } from '../lib/console';
import { countBySeverity, SEVERITY_ORDER } from '../lib/findings';
import { CheckIcon } from '../components/Icons';
import { Badge, Card, GradeBars, SeverityBadge, SeverityCounts, ViewHead } from '../components/ui';
import { TargetGate } from './TargetGate';

function Stat({ k, v, of, s }: { k: string; v: number | string; of?: string; s?: string }) {
  return (
    <div className="ac-card ac-stat">
      <div className="ac-stat-k">{k}</div>
      <div className="ac-stat-v">{v}{of && <small>{of}</small>}</div>
      {s && <div className="ac-stat-s">{s}</div>}
    </div>
  );
}

function Dashboard() {
  const { ws, domain, runs, navigate, scope } = useConsole();
  const [copied, setCopied] = useState('');
  if (!ws || !domain) return null;
  const { stats, findings, meta, email } = ws;
  const counts = countBySeverity(findings);
  const live = ws.rows.filter(row => row.status === 'live');
  const topHosts = [...ws.rows].filter(row => row.findings.length).sort((a, b) => b.risk - a.risk).slice(0, 5);
  const sourcesOk = meta?.sources.filter(source => source.ok).length ?? 0;
  const advancedDone = runs.advanced?.stage === 'Kapsamlı Analiz Tamamlandı';
  const serviceDone = Boolean(runs.service?.stage.startsWith('Servis Taraması')) || stats.webServices > 0;

  const pipeline = [
    { n: 'Pasif keşif', d: meta ? `${sourcesOk}/${meta.sources.length} kaynak` : `${stats.total} kayıt`, done: stats.total > 0 },
    { n: 'DNS doğrulama', d: stats.unknown ? `${stats.live} canlı · ${stats.unknown} bekliyor` : `${stats.live} canlı`, done: stats.unknown === 0 && stats.total > 0 },
    { n: 'Brute / permütasyon', d: meta?.bruteSkipped === 'wildcard' ? 'wildcard nedeniyle atlandı' : meta?.bruteCount !== undefined ? `${meta.bruteCount} yeni` : 'tam analizde', done: meta?.bruteCount !== undefined || meta?.bruteSkipped !== undefined },
    { n: 'E-posta güvenliği', d: email ? `not ${email.grade}` : 'tam analizde', done: Boolean(email) },
    { n: 'Servis taraması', d: `${stats.webServices} web servisi · ${stats.openPorts} açık port`, done: serviceDone },
    { n: 'Kapsamlı analiz', d: `${stats.analyzed} host · TLS · başlık · WAF`, done: advancedDone || stats.analyzed > 0 }
  ];

  const copyScope = () => {
    void navigator.clipboard.writeText(scope.text)
      .then(() => setCopied('Kopyalandı'))
      .catch(() => setCopied('Kopyalanamadı'));
  };

  return (
    <>
      <ViewHead eyebrow="Aktif hedef" title={<><span className="ac-mono">{domain}</span><span className="ac-live"><span className="ac-dot" />izleniyor</span></>}>
        <button type="button" className="ac-btn" onClick={() => navigate({ view: 'ai' })}>AI ile yorumla</button>
      </ViewHead>

      <div className="ac-grid g5">
        <Stat k="Varlık" v={stats.total} s={meta?.bruteCount ? `${meta.bruteCount} brute keşfi dahil` : 'pasif keşif'} />
        <Stat k="DNS canlı" v={stats.live} of={` / ${stats.total}`} s={stats.unknown ? `${stats.unknown} doğrulama bekliyor` : `${stats.dead} çözülemedi`} />
        <Stat k="Web servisi" v={stats.webServices} s={`${stats.openPorts} açık port`} />
        <Stat k="Teknoloji" v={ws.technologies.length} s="benzersiz bileşen" />
        <button type="button" className="ac-card ac-stat ac-clickable" onClick={() => navigate({ view: 'findings' })}>
          <div className="ac-stat-k">Bulgular</div>
          <div className="ac-stat-v">{findings.length}</div>
          <div className="ac-inline">
            {SEVERITY_ORDER.filter(severity => counts[severity]).map(severity => <SeverityBadge key={severity} severity={severity} count={counts[severity]} />)}
            {!findings.length && <span className="ac-stat-s">{stats.analyzed ? 'bulgu yok' : 'analiz bekleniyor'}</span>}
          </div>
        </button>
      </div>

      <div className="ac-grid g3">
        <Card title="Tarama hattı" sub={runs.advancedRunning || runs.serviceRunning ? 'çalışıyor' : advancedDone ? 'tamamlandı' : undefined}>
          <ol className="ac-pipe">
            {pipeline.map(step => (
              <li key={step.n} className={step.done ? 'done' : ''}>
                <span className="ac-pipe-ic" aria-hidden="true">{step.done ? <CheckIcon /> : null}</span>
                <span className="ac-pipe-n">{step.n}</span>
                <span className="ac-pipe-d">{step.d}</span>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="TLS not dağılımı" sub={`${live.filter(row => row.tlsGrade).length} host`}>
          {live.some(row => row.tlsGrade) ? <GradeBars grades={['A', 'B', 'C', 'D', 'E', 'F']} values={ws.rows.map(row => row.tlsGrade)} />
            : <p className="ac-note">TLS bilgisi için tam kapsamlı analizi çalıştırın.</p>}
          <div className="ac-card-h spaced"><h2>Güvenlik başlığı notu</h2><span className="ac-card-sub">{stats.headerAverage !== null ? `ort. ${stats.headerAverage}/100` : ''}</span></div>
          {ws.rows.some(row => row.headerGrade) ? <GradeBars grades={['A', 'B', 'C', 'D', 'F']} values={ws.rows.map(row => row.headerGrade)} />
            : <p className="ac-note">Başlık notu için tam kapsamlı analizi çalıştırın.</p>}
        </Card>

        <Card title="En riskli hostlar" sub="bulgu ağırlığına göre">
          {topHosts.length ? (
            <div className="ac-list">
              {topHosts.map(row => (
                <button key={row.name} type="button" className="ac-li" onClick={() => navigate({ view: 'assets', host: row.name })}>
                  <span className="ac-li-host">{row.name}</span>
                  <SeverityCounts findings={row.findings} short />
                </button>
              ))}
            </div>
          ) : <p className="ac-note">{stats.analyzed ? 'Hostlarda bulgu yok.' : 'Analiz tamamlandığında burada listelenir.'}</p>}
        </Card>
      </div>

      <div className="ac-grid g3">
        <Card title="E-posta güvenliği" sub={domain}>
          {email ? (
            <div className="ac-mail">
              <span className={`ac-big-grade t-${email.grade === 'A' || email.grade === 'B' ? 'ok' : email.grade === 'C' ? 'warn' : 'bad'}`}>{email.grade}</span>
              <div className="ac-kv">
                <span className="ac-k">SPF</span>
                <span>{email.spf.hasRecord ? <><Badge tone={email.spf.all === '+all' ? 'bad' : 'ok'}>var</Badge> <span className="ac-mono ac-muted">{email.spf.all || ''}</span></> : <Badge tone="bad">yok</Badge>}</span>
                <span className="ac-k">DMARC</span>
                <span>{email.dmarc.hasRecord ? <Badge tone={email.dmarc.policy === 'none' ? 'warn' : 'ok'}>p={email.dmarc.policy}</Badge> : <Badge tone="bad">yok</Badge>}</span>
                <span className="ac-k">DKIM</span>
                <span>{email.dkim.hasRecord ? <Badge tone="ok">var</Badge> : <Badge>bulunamadı</Badge>}</span>
                <span className="ac-k">Skor</span>
                <span className="ac-num">{email.score}/100</span>
              </div>
            </div>
          ) : <p className="ac-note">E-posta kontrolü tam kapsamlı analizle çalışır.</p>}
        </Card>

        <Card title="Keşif kaynakları" sub={meta ? `${sourcesOk}/${meta.sources.length} yanıt verdi` : undefined}>
          {meta?.sources.length ? (
            <div className="ac-chips">
              {meta.sources.map(source => (
                <span key={source.id} className={`ac-chip ac-source ${source.ok ? 'ok' : 'skip'}`} title={`${source.ms} ms`}>
                  <span className="ac-dot" />{source.label}<span className="ac-muted">{source.ok ? source.count : (source.skipped || 'yanıt yok')}</span>
                </span>
              ))}
            </div>
          ) : <p className="ac-note">Kaynak durumu bir sonraki taramada görünür.</p>}
          {meta?.wildcard?.isWildcard && <p className="ac-alert">Wildcard DNS algılandı ({meta.wildcard.confidence === 'high' ? 'yüksek' : 'düşük'} güven); eşleşen kayıtlar ayrı işaretlenir.</p>}
          {meta?.truncatedValidation && <p className="ac-note">İlk 150 kayıt DNS ile doğrulandı; kalanlar bekliyor.</p>}
        </Card>

        <Card title="Geçerli kapsam" sub={`${scope.hosts.length} hedef`}>
          <p className="ac-note ac-mono ac-scope-preview">{scope.hosts.length ? `${scope.hosts.slice(0, 4).join(', ')}${scope.hosts.length > 4 ? ` … +${scope.hosts.length - 4}` : ''}` : 'Servis taramasından sonra aktif web hedefleri burada listelenir.'}</p>
          <div className="ac-inline spaced">
            <button type="button" className="ac-btn small" onClick={copyScope} disabled={!scope.text}>{copied || 'Kopyala'}</button>
            <button type="button" className="ac-btn small ghost" onClick={() => navigate({ view: 'scope' })}>Kapsam sayfası</button>
          </div>
        </Card>
      </div>
    </>
  );
}

export function DashboardView() {
  return <TargetGate><Dashboard /></TargetGate>;
}
