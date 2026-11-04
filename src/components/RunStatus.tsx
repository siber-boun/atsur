import { useConsole } from '../lib/console';

/** Seçili hedefin tarama ilerlemesi, otomatik başlatma geri sayımı ve kısmi hata mesajları. */
export function RunStatus() {
  const { domain, runs, ws, loading } = useConsole();
  if (!domain || loading) return null;
  const { service, advanced, serviceRunning, advancedRunning, autoStage, autoCountdown, autoScheduled } = runs;
  const running = advancedRunning ? advanced : serviceRunning ? service : undefined;
  const progress = running?.total ? Math.max(4, Math.round((running.completed / running.total) * 100)) : undefined;
  const messages = [service?.error, advanced?.error].filter((message): message is string => Boolean(message));
  const stopped = advanced?.stage.startsWith('Analiz durdu');
  const completions = [
    !serviceRunning && service?.stage.startsWith('Servis Taraması') ? service.stage : undefined,
    !advancedRunning && advanced?.stage === 'Kapsamlı Analiz Tamamlandı' ? advanced.stage : undefined
  ].filter((value): value is string => Boolean(value));

  if (!running && !messages.length && !completions.length && !stopped && !(autoScheduled && ws?.rows.length)) return null;

  return (
    <section className="ac-runstatus" aria-live="polite">
      {running && (
        <div className="ac-run-row is-running">
          <span className="ac-dot" />
          <span>{running.stage}</span>
          {running.total > 0 && <span className="ac-mono ac-muted">{running.completed}/{running.total}</span>}
          {progress !== undefined && <div className="ac-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>}
        </div>
      )}
      {!running && autoScheduled && (autoStage === 'waiting-services' || autoStage === 'waiting-advanced') && (
        <div className="ac-run-row" role="status">
          {autoStage === 'waiting-services' ? 'Servis taraması' : 'Tam kapsamlı analiz'} {autoCountdown} saniye sonra otomatik başlayacak.
        </div>
      )}
      {completions.map(text => <div key={text} className="ac-run-row is-done">✓ {text}</div>)}
      {stopped && <div className="ac-run-row has-error">{advanced?.stage}</div>}
      {messages.map(message => <div key={message} className="ac-run-row has-error">{message}</div>)}
    </section>
  );
}
