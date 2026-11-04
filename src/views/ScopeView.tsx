import { useState } from 'react';
import { useConsole } from '../lib/console';
import { Card, ViewHead } from '../components/ui';
import { TargetGate } from './TargetGate';

function Scope() {
  const { ws, scope, navigate, runs } = useConsole();
  const [message, setMessage] = useState('');
  if (!ws) return null;
  const inScope = new Set(scope.hosts);
  const excluded = ws.rows.filter(row => !inScope.has(row.name)).map(row => ({
    name: row.name,
    why: row.status === 'dead' ? 'DNS çözülemedi'
      : row.status === 'wildcard' ? 'wildcard eşleşmesi'
        : row.status === 'private' ? 'özel IP'
          : !row.detail?.ports ? 'servis taraması yapılmadı'
            : row.ports.length ? 'yalnızca yönlendirme / web dışı port' : 'açık web servisi yok'
  }));

  const copy = () => {
    void navigator.clipboard.writeText(scope.text)
      .then(() => setMessage('Kapsam kopyalandı.'))
      .catch(() => setMessage('Kopyalanamadı; metni seçerek kopyalayabilirsiniz.'));
  };

  return (
    <>
      <ViewHead eyebrow="Kapsam" title={<>Geçerli OSINT kapsamı <span className="ac-badge t-live">{scope.hosts.length} hedef</span></>} />
      <Card>
        <p className="ac-note">Aktif web servisi doğrulanan hedefler (HTTPS ya da yönlendirme olmayan HTTP yanıtı). Kapsam bu alan adı için otomatik kaydedilir.</p>
        <textarea className="ac-scope" readOnly aria-label="Oluşturulan OSINT kapsamı" value={scope.text}
          placeholder={scope.saved ? 'Erişilebilir web servisi bulunamadığı için kapsam boş.' : 'Kapsam henüz oluşturulmadı. Servis taramasından sonra “Kapsamı oluştur”a basın.'} />
        <div className="ac-inline spaced">
          <button type="button" className="ac-btn primary" onClick={copy} disabled={!scope.text}>Kopyala</button>
          <button type="button" className="ac-btn" onClick={() => { scope.generate(); setMessage('Kapsam güncel sonuçlardan yeniden oluşturuldu.'); }}
            disabled={!scope.canGenerate} title={!scope.canGenerate ? (runs.serviceRunning ? 'Servis taraması sürüyor' : 'Kapsam için önce servisleri tarayın') : undefined}>
            {scope.saved ? 'Kapsamı yeniden oluştur' : 'Kapsamı oluştur'}
          </button>
          {message && <span role="status" className="ac-note">{message}</span>}
        </div>
      </Card>
      <Card title="Kapsam dışı kalanlar" sub={`${excluded.length} varlık`}>
        {excluded.length ? (
          <div className="ac-list">
            {excluded.map(item => (
              <button key={item.name} type="button" className="ac-li" onClick={() => navigate({ view: 'assets', host: item.name })}>
                <span className="ac-li-host">{item.name}</span>
                <span className="ac-badge t-none">{item.why}</span>
              </button>
            ))}
          </div>
        ) : <p className="ac-note">Tüm varlıklar kapsamda.</p>}
      </Card>
    </>
  );
}

export function ScopeView() {
  return <TargetGate><Scope /></TargetGate>;
}
