export function AnalysisWaitIndicator() {
  return (
    <span className="analysis-wait" role="status" aria-label="Render ve pasif kaynaklar kontrol ediliyor">
      <span className="analysis-hourglass" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M6 2h12M6 22h12M7 2v4c0 2.6 2 4.1 5 6-3 1.9-5 3.4-5 6v4M17 2v4c0 2.6-2 4.1-5 6 3 1.9 5 3.4 5 6v4"/></svg>
      </span>
      <span>Render kontrol ediliyor</span>
      <i className="analysis-wait-track" aria-hidden="true"><b></b></i>
    </span>
  );
}
