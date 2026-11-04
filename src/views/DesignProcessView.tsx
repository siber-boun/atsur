import { useEffect, useState } from 'react';

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

export function DesignProcessView() {
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
