import { useMemo, useState } from 'react';
import { useConsole } from '../lib/console';
import { isWebPort, type AssetRow } from '../lib/workspace';
import { CloseIcon, SearchIcon } from '../components/Icons';
import { Grade, PortChip, RiskMeter, StatusDot, ViewHead } from '../components/ui';
import { AssetDrawer } from './AssetDrawer';
import { TargetGate } from './TargetGate';

type QuickFilter = 'all' | 'live' | 'web' | 'findings' | 'high';
type SortKey = 'risk' | 'name';

const QUICK: Array<{ id: QuickFilter; label: string; test: (row: AssetRow) => boolean }> = [
  { id: 'all', label: 'Tümü', test: () => true },
  { id: 'live', label: 'Canlı', test: row => row.status === 'live' },
  { id: 'web', label: 'Web servisi', test: row => row.ports.some(isWebPort) },
  { id: 'findings', label: 'Bulgulu', test: row => row.findings.length > 0 },
  { id: 'high', label: 'Yüksek risk', test: row => row.findings.some(finding => finding.severity === 'high') }
];

/** DNS'te çözülmeyen ya da hata veren kayıtlar tablonun sonunda ayrı grupta gösterilir. */
const isInactive = (row: AssetRow) => row.status === 'dead' || row.status === 'error';
const MAX_PORTS = 3;
const MAX_TECH = 2;

function AssetRowView({ row, selected, onOpen }: { row: AssetRow; selected: boolean; onOpen: () => void }) {
  const measured = Boolean(row.detail?.ssl || row.detail?.security || row.detail?.waf);
  return (
    <tr className={`ac-row ${selected ? 'sel' : ''} ${isInactive(row) ? 'is-inactive' : ''}`} onClick={onOpen}>
      <td>
        <div className="ac-hostcell">
          <StatusDot status={row.status} />
          <div className="ac-hostcell-copy">
            <button type="button" className="ac-hostbtn" onClick={event => { event.stopPropagation(); onOpen(); }} aria-pressed={selected}>{row.name}</button>
            <span className="ac-src">{row.ip || 'IP yok'}{row.sources.length ? ` · ${row.sources.length} kaynak` : ''}</span>
          </div>
        </div>
      </td>
      <td>
        {row.busy ? <span className="ac-muted ac-small">taranıyor…</span> : row.ports.length ? (
          <div className="ac-ports">
            {row.ports.slice(0, MAX_PORTS).map(port => <PortChip key={`${port.port}-${port.transport}`} port={port} />)}
            {row.ports.length > MAX_PORTS && <span className="ac-more">+{row.ports.length - MAX_PORTS}</span>}
          </div>
        ) : <span className="ac-muted ac-small">{row.detail?.ports ? 'açık port yok' : isInactive(row) ? '—' : 'taranmadı'}</span>}
      </td>
      <td className="ac-center"><Grade grade={row.tlsGrade} label="TLS notu" /></td>
      <td className="ac-center"><Grade grade={row.headerGrade} label="Başlık notu" /></td>
      <td className="col-opt">
        {row.wafDetected ? <span className="ac-waf on">{row.wafName || 'WAF'}</span>
          : row.wafDetected === false ? <span className="ac-waf">yok</span> : <span className="ac-muted">—</span>}
      </td>
      <td className="col-opt">
        {row.technologies.length ? (
          <div className="ac-techcell">
            {row.technologies.slice(0, MAX_TECH).map(tech => <span key={tech.name} className="ac-chip small">{tech.name}</span>)}
            {row.technologies.length > MAX_TECH && <span className="ac-more">+{row.technologies.length - MAX_TECH}</span>}
          </div>
        ) : <span className="ac-muted">—</span>}
      </td>
      <td><RiskMeter findings={row.findings} measured={measured} /></td>
    </tr>
  );
}

function AssetsTable() {
  const { ws, route, navigate } = useConsole();
  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState<QuickFilter>('all');
  const [port, setPort] = useState('');
  const [sort, setSort] = useState<SortKey>('risk');
  const [showInactive, setShowInactive] = useState(false);
  const rows = useMemo(() => ws?.rows ?? [], [ws]);

  const ports = useMemo(() => [...new Set(rows.flatMap(row => row.ports.map(item => item.port)))].sort((a, b) => a - b), [rows]);
  const query = search.trim().toLowerCase();
  const quickTest = QUICK.find(item => item.id === quick)?.test ?? (() => true);
  const visible = rows
    .filter(quickTest)
    .filter(row => !port || row.ports.some(item => String(item.port) === port))
    .filter(row => !route.tech || row.technologies.some(tech => tech.name.toLowerCase() === route.tech?.toLowerCase()))
    .filter(row => !query || [row.name, row.ip || '', ...row.technologies.map(tech => tech.name)].join(' ').toLowerCase().includes(query))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : b.risk - a.risk || a.name.localeCompare(b.name));
  const active = visible.filter(row => !isInactive(row));
  const inactive = visible.filter(isInactive);
  const selected = route.host ? rows.find(row => row.name === route.host) : undefined;
  // Çözülemeyen bir host doğrudan açıldıysa grubu da aç.
  const inactiveOpen = showInactive || Boolean(selected && isInactive(selected));
  const open = (row: AssetRow) => navigate({ view: 'assets', host: row.name, tech: route.tech });
  const filtered = Boolean(query || port || route.tech || quick !== 'all');
  const sortButton = (id: SortKey, label: string) => (
    <button type="button" className={sort === id ? 'on' : ''} onClick={() => setSort(id)} aria-pressed={sort === id}>
      {label}{sort === id ? ' ↓' : ''}
    </button>
  );

  return (
    <>
      <ViewHead eyebrow="Varlık envanteri" title="Ağ ve uygulama yüzeyi" />

      <div className="ac-quick" role="group" aria-label="Hızlı filtre">
        {QUICK.map(item => {
          const count = rows.filter(item.test).length;
          return (
            <button key={item.id} type="button" className={`ac-quick-tile ${quick === item.id ? 'on' : ''} ${item.id === 'high' && count ? 'is-alert' : ''}`}
              aria-pressed={quick === item.id} onClick={() => setQuick(item.id)}>
              <span className="ac-quick-n">{count}</span>
              <span className="ac-quick-l">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="ac-filters">
        <label className="ac-search">
          <SearchIcon />
          <input type="search" placeholder="Host, IP veya teknoloji ara" value={search} onChange={event => setSearch(event.target.value)} aria-label="Varlıklarda ara" />
        </label>
        {ports.length > 0 && (
          <label className="ac-select">
            <span>Port</span>
            <select value={port} onChange={event => setPort(event.target.value)}>
              <option value="">Tümü</option>
              {ports.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        )}
        {route.tech && (
          <span className="ac-pill">Teknoloji: {route.tech}
            <button type="button" aria-label="Teknoloji filtresini kaldır" onClick={() => navigate({ view: 'assets', host: route.host })}><CloseIcon /></button>
          </span>
        )}
        <span className="ac-filters-count">{filtered ? `${visible.length} / ${rows.length} varlık` : `${rows.length} varlık`}</span>
      </div>

      <div className="ac-split">
        <div className="ac-tablebox">
          <table className={`ac-table ac-assets ${selected ? 'is-compact' : ''}`}>
            <thead>
              <tr>
                <th>{sortButton('name', 'Host')}</th>
                <th>Servisler</th>
                <th className="ac-center">TLS</th>
                <th className="ac-center">Başlık</th>
                <th className="col-opt">WAF</th>
                <th className="col-opt">Teknoloji</th>
                <th>{sortButton('risk', 'Risk')}</th>
              </tr>
            </thead>
            <tbody>
              {active.map(row => <AssetRowView key={row.name} row={row} selected={selected?.name === row.name} onOpen={() => open(row)} />)}
            </tbody>
            {inactive.length > 0 && (
              <tbody>
                <tr className="ac-group-row">
                  <td colSpan={selected ? 5 : 7}>
                    <button type="button" className="ac-group-toggle" aria-expanded={inactiveOpen} onClick={() => setShowInactive(!inactiveOpen)}>
                      <span aria-hidden="true">{inactiveOpen ? '▾' : '▸'}</span> DNS’te çözülemeyen {inactive.length} kayıt
                      <span className="ac-muted"> · pasif kaynaklarda görülmüş, şu an yanıt vermiyor</span>
                    </button>
                  </td>
                </tr>
                {inactiveOpen && inactive.map(row => <AssetRowView key={row.name} row={row} selected={selected?.name === row.name} onOpen={() => open(row)} />)}
              </tbody>
            )}
          </table>
          {!visible.length && <div className="ac-empty small">Filtrelere uyan varlık yok.</div>}
        </div>
        {selected && <AssetDrawer row={selected} onClose={() => navigate({ view: 'assets', tech: route.tech })} />}
      </div>
    </>
  );
}

export function AssetsView() {
  return <TargetGate><AssetsTable /></TargetGate>;
}
