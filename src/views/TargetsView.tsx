import { useConsole } from '../lib/console';
import { TrashIcon } from '../components/Icons';
import { EmptyState, ViewHead } from '../components/ui';

const STATE = {
  done: { label: 'TAMAMLANDI', tone: 'live' },
  scanning: { label: 'TARANIYOR', tone: 'redir' },
  pending: { label: 'BEKLİYOR', tone: 'none' }
} as const;

export function TargetsView() {
  const { domains, domain, domainState, domainAssetCount, domainScopeCount, actions } = useConsole();

  return (
    <>
      <ViewHead eyebrow="Hedefler" title={<>Hedef domainler <span className="ac-badge t-none">{domains.length}</span></>} />
      {!domains.length ? (
        <EmptyState title="Henüz domain eklenmedi">
          <p className="ac-note">Üstteki komut alanına şirketin ana alan adını yazıp “Ekle”ye basın.</p>
        </EmptyState>
      ) : (
        <div className="ac-tablebox">
          <table className="ac-table compact">
            <thead>
              <tr><th>Domain</th><th>Durum</th><th>Varlık</th><th>Kapsam</th><th><span className="ac-sr">İşlemler</span></th></tr>
            </thead>
            <tbody>
              {domains.map(item => {
                const state = STATE[domainState(item)];
                const scope = domainScopeCount(item);
                return (
                  <tr key={item} className={item === domain ? 'sel' : ''}>
                    <td><button type="button" className="ac-hostbtn" onClick={() => actions.selectDomain(item)}>{item}</button></td>
                    <td><span className={`ac-badge t-${state.tone}`}>{state.label}</span></td>
                    <td className="ac-num">{domainAssetCount(item) || '—'}</td>
                    <td className="ac-num">{scope ?? '—'}</td>
                    <td className="ac-right">
                      <button type="button" className="ac-iconbtn" aria-label={`${item} hedefini sil`} title="Sil"
                        onClick={() => { if (window.confirm(`${item} ve kayıtlı sonuçları silinsin mi?`)) actions.deleteDomain(item); }}>
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
