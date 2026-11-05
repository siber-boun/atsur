import { useEffect, useRef, type ReactNode } from 'react';
import { useConsole } from '../lib/console';
import { httpStatusLabel } from '../lib/format';
import { SEVERITY_META } from '../lib/findings';
import { portHref, type AssetRow } from '../lib/workspace';
import { AnalysisWaitIndicator } from '../components/AnalysisWaitIndicator';
import { CloseIcon, ExternalIcon } from '../components/Icons';
import { Badge, Grade, PortChip, StatusBadge } from '../components/ui';

function Row({ k, children }: { k: string; children: ReactNode }) {
  return <><span className="ac-k">{k}</span><span>{children}</span></>;
}

export function AssetDrawer({ row, onClose }: { row: AssetRow; onClose: () => void }) {
  const { actions, navigate } = useConsole();
  const ref = useRef<HTMLElement>(null);
  const { detail } = row;
  const ssl = detail?.ssl;
  const legacy = ssl?.legacyProtocols && (ssl.legacyProtocols.tls10 === 'yes' || ssl.legacyProtocols.tls11 === 'yes');

  useEffect(() => {
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [row.name]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="ac-drawer" aria-label={`${row.name} detayı`} tabIndex={-1} ref={ref}>
      <div className="ac-drawer-h">
        <div>
          <p className="ac-eyebrow">Varlık detayı</p>
          <h2>
            <a href={`https://${row.name}`} target="_blank" rel="noopener noreferrer">{row.name} <ExternalIcon /></a>
          </h2>
          <div className="ac-inline">
            <StatusBadge status={row.status} />
            {row.ip && <Badge>{row.ip}</Badge>}
            {detail?.isCloudflare && <Badge tone="ok">Cloudflare</Badge>}
          </div>
        </div>
        <button type="button" className="ac-iconbtn" aria-label="Detayı kapat" onClick={onClose}><CloseIcon /></button>
      </div>

      <div className="ac-drawer-tiles">
        <div><span>HTTP</span><b className="ac-mono">{row.http ? row.http.status : '—'}</b></div>
        <div><span>TLS</span><Grade grade={row.tlsGrade} label="TLS notu" /></div>
        <div><span>Başlık</span><Grade grade={row.headerGrade} label="Başlık notu" /></div>
        <div><span>WAF</span><b className="ac-small">{row.wafDetected ? row.wafName || 'var' : row.wafDetected === false ? 'yok' : '—'}</b></div>
      </div>

      {row.busy && <AnalysisWaitIndicator />}

      <section className="ac-sec">
        <h3>Bulgular · {row.findings.length}</h3>
        {row.findings.length ? (
          <ul className="ac-drawer-findings">
            {row.findings.map(finding => (
              <li key={finding.id}>
                <button type="button" onClick={() => navigate({ view: 'findings', finding: finding.id })}>
                  <Badge tone={finding.severity}>{SEVERITY_META[finding.severity].label}</Badge>
                  <span className="ac-df-copy">
                    <span className="ac-df-title">{finding.title}</span>
                    {finding.evidence[row.name] && <span className="ac-df-ev">{finding.evidence[row.name]}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="ac-note">{row.detail?.ssl || row.detail?.security ? 'Bu hostta bulgu yok.' : 'Bulgu üretmek için tam kapsamlı analizi çalıştırın.'}</p>}
      </section>
      {detail?.serviceError && <p className="ac-alert">{detail.serviceError}</p>}
      {detail?.advancedError && <p className="ac-alert">{detail.advancedError}</p>}

      <section className="ac-sec">
        <h3>Açık portlar</h3>
        {row.ports.length ? (
          <div className="ac-ports">{row.ports.map(port => <PortChip key={`${port.port}-${port.transport}`} port={port} href={portHref(row.name, port)} />)}</div>
        ) : <p className="ac-note">{detail?.ports ? 'Taranan 45 portta açık servis bulunamadı.' : 'Servis taraması henüz yapılmadı.'}</p>}
      </section>

      {(detail?.evidence || row.http) && (
        <section className="ac-sec">
          <h3>HTTP yanıtı</h3>
          <div className="ac-kv">
            {row.http && <Row k="Durum">{row.http.status} {httpStatusLabel(row.http.status)} · {row.http.protocol === 'https:' ? 'HTTPS' : 'HTTP'}</Row>}
            {detail?.evidence?.server && <Row k="Sunucu">{detail.evidence.server}</Row>}
            {detail?.evidence?.redirectCount ? <Row k="Yönlendirme">{detail.evidence.redirectCount} adım</Row> : null}
            {detail?.evidence?.externalRedirect?.target && <Row k="Dış hedef">{detail.evidence.externalRedirect.target}</Row>}
            {detail?.evidence && <Row k="Kanıt">{detail.evidence.source === 'browserless-live' ? 'Browserless canlı' : 'Render canlı'}</Row>}
          </div>
        </section>
      )}

      {ssl && (
        <section className="ac-sec">
          <h3>TLS sertifikası</h3>
          <div className="ac-kv">
            <Row k="Not"><Grade grade={ssl.grade} label="TLS notu" /></Row>
            <Row k="Geçerlilik">{ssl.valid ? `Geçerli · ${ssl.daysLeft ?? '—'} gün kaldı` : ssl.isSelfSigned ? 'Self-signed' : 'Geçersiz'}</Row>
            {ssl.issuer && <Row k="Yayıncı">{ssl.issuer}</Row>}
            {ssl.protocol && <Row k="Protokol">{ssl.protocol}{ssl.cipher?.name ? ` · ${ssl.cipher.name}` : ''}</Row>}
            {ssl.hostnameMatch !== undefined && <Row k="Host eşleşmesi">{ssl.hostnameMatch ? 'Eşleşti' : 'Eşleşmedi'}</Row>}
            {ssl.chainComplete !== undefined && <Row k="Zincir">{ssl.chainComplete ? 'Tamam' : 'Eksik'}</Row>}
            {ssl.legacyProtocols && <Row k="Eski TLS">{legacy ? 'TLS 1.0/1.1 kabul ediliyor' : 'Kapalı'}</Row>}
          </div>
        </section>
      )}

      {detail?.security && (
        <section className="ac-sec">
          <h3>Eksik güvenlik başlıkları · {detail.security.grade} · {detail.security.score}/100</h3>
          {detail.security.missing.length ? (
            <div className="ac-chips">{[...new Set(detail.security.missing)].map(header => <Badge key={header} tone="high">{header}</Badge>)}</div>
          ) : <p className="ac-note">Ölçülen başlıkların tamamı mevcut.</p>}
        </section>
      )}

      {(detail?.waf || row.technologies.length > 0) && (
        <section className="ac-sec">
          <h3>WAF ve teknolojiler</h3>
          <div className="ac-chips">
            {detail?.waf && (detail.waf.detected ? <Badge tone="ok">WAF: {detail.waf.name}</Badge> : <Badge tone="info">WAF yok</Badge>)}
            {row.technologies.map(tech => (
              <span key={tech.name} className="ac-chip" title={`${tech.category}${tech.passive ? ' · pasif Shodan gözlemi' : tech.confidence ? ` · %${tech.confidence} güven` : ''}`}>
                {tech.name}{tech.version ? ` ${tech.version}` : ''}
              </span>
            ))}
          </div>
        </section>
      )}

      {detail?.cookies && detail.cookies.some(cookie => cookie.issues.length) && (
        <section className="ac-sec">
          <h3>Cookie sorunları</h3>
          <ul className="ac-list-plain">
            {[...new Set(detail.cookies.flatMap(cookie => cookie.issues))].map(issue => <li key={issue}>{issue}</li>)}
          </ul>
        </section>
      )}

      <section className="ac-sec">
        <h3>Kaynaklar</h3>
        <div className="ac-chips">{row.sources.length ? row.sources.map(source => <span key={source} className="ac-chip">{source}</span>) : <span className="ac-muted">—</span>}</div>
      </section>

      <button type="button" className="ac-btn" onClick={() => actions.analyzeHost(row.name)} disabled={row.busy}>
        {detail?.ports ? 'Web servisini yeniden kontrol et' : 'Web servisi kontrolü'}
      </button>
    </aside>
  );
}
