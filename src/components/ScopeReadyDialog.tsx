import { useEffect, useRef } from 'react';

interface ScopeReadyDialogProps {
  domain: string;
  targetCount: number;
  onDismiss: () => void;
}

export function ScopeReadyDialog({ domain, targetCount, onDismiss }: ScopeReadyDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  return (
    <dialog ref={dialogRef} className="scope-ready-dialog" aria-labelledby="scope-ready-title"
      aria-describedby="scope-ready-description" onCancel={event => { event.preventDefault(); onDismiss(); }}>
      <span className="scope-ready-mark" aria-hidden="true">✓</span>
      <h2 id="scope-ready-title">Kapsam hazır</h2>
      <p id="scope-ready-description">
        <strong>{domain}</strong> için tam kapsamlı analiz tamamlandı.
        {targetCount > 0
          ? ` ${targetCount} web hedefi kapsama eklendi.`
          : ' Erişilebilir web servisi bulunamadığı için kapsam boş.'}
      </p>
      <button type="button" className="btn" onClick={onDismiss} autoFocus>Tamam</button>
    </dialog>
  );
}
