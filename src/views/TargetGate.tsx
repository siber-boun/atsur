import type { ReactNode } from 'react';
import { useConsole } from '../lib/console';
import { HorseMark } from '../components/Logo';
import { RunStatus } from '../components/RunStatus';

/**
 * Seçili hedef gerektiren sayfaların ortak durumları: hedef yok, ilk tarama
 * sürüyor (Render uyanıyor olabilir), hata ve boş sonuç.
 */
export function TargetGate({ children }: { children: ReactNode }) {
  const { domain, domains, loading, wakingUp, error, ws, actions, navigate } = useConsole();

  if (!domain) {
    return (
      <div className="ac-awaiting">
        <span className="ac-awaiting-mark"><HorseMark size={72} /></span>
        <p className="ac-eyebrow">Hedef bekleniyor</p>
        <h1 className="ac-h1">Keşif yüzeyini başlatın</h1>
        <p className="ac-note">
          {domains.length
            ? 'Üstteki hedef seçiciden bir domain seçin ya da yeni bir domain ekleyin. Seçtiğinizde pasif keşif başlar.'
            : 'Üstteki komut alanından bir domain ekleyin. Eklediğiniz domain hedef olarak seçilir ve pasif keşif başlar.'}
        </p>
        {domains.length > 0 && (
          <div className="ac-chips">
            {domains.slice(0, 8).map(item => (
              <button key={item} type="button" className="ac-hostchip" onClick={() => actions.selectDomain(item)}>{item}</button>
            ))}
            {domains.length > 8 && <button type="button" className="ac-hostchip" onClick={() => navigate({ view: 'targets' })}>Tümü…</button>}
          </div>
        )}
      </div>
    );
  }

  if (loading && !ws?.rows.length) {
    return (
      <div className="ac-loading" role="status">
        {wakingUp ? (
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
              <span className="radar-domain">{domain}</span>
            </div>
            <h4>Bilgi toplama sistemi hazırlanıyor</h4>
            <p className="ac-note">Sunucu uyku modundan uyanıyor olabilir; bu ilk istekte 40 saniyeye kadar sürebilir.</p>
          </div>
        ) : (
          <>
            <div className="spinner" />
            <p className="ac-note">Sertifika, pasif DNS ve tehdit istihbaratı kaynakları taranıyor…</p>
          </>
        )}
      </div>
    );
  }

  if (error && !ws?.rows.length) {
    return (
      <div className="ac-empty" role="alert">
        <p className="ac-empty-title">Tarama tamamlanamadı</p>
        <p className="ac-note">{error}</p>
        <button type="button" className="ac-btn" onClick={actions.refresh}>Tekrar dene</button>
      </div>
    );
  }

  if (!ws?.rows.length) {
    return (
      <div className="ac-empty">
        <p className="ac-empty-title">Bu alan adı için kayıt bulunamadı</p>
        <p className="ac-note">Pasif kaynaklar sonuç döndürmedi. Tekrar tarayabilir ya da tam kapsamlı analizle wordlist/permütasyon keşfini deneyebilirsiniz.</p>
        <div className="ac-inline">
          <button type="button" className="ac-btn" onClick={actions.refresh}>Yeniden tara</button>
          <button type="button" className="ac-btn primary" onClick={actions.advancedAnalysis}>Tam kapsamlı analiz</button>
        </div>
      </div>
    );
  }

  return <><RunStatus />{children}</>;
}
