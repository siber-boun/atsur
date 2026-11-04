import { useMemo, useState } from 'react';
import { useConsole } from '../lib/console';
import type { AssetRow } from '../lib/workspace';
import { CloseIcon, SearchIcon } from '../components/Icons';
import { Badge, Grade, PortChip, SeverityCounts, StatusBadge, ViewHead } from '../components/ui';
import { AssetDrawer } from './AssetDrawer';
import { TargetGate } from './TargetGate';

type StatusFilter = 'all' | 'live' | 'other';
type SortKey = 'risk' | 'name' | 'status';

const STATUS_ORDER = { live: 0, unknown: 1, wildcard: 2, private: 3, error: 4, dead: 5 } as const;

function AssetsTable() {
  const { ws, route, navigate } = useConsole();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [onlyFindings, setOnlyFindings] = useState(false);
  const [port, setPort] = useState('');
  const [sort, setSort] = useState<SortKey>('risk');
  const rows = useMemo(() => ws?.rows ?? [], [ws]);

  const ports = useMemo(() => [...new Set(rows.flatMap(row => row.ports.map(item => item.port)))].sort((a, b) => a - b), [rows]);
  const query = search.trim().toLowerCase();
  const visible = rows
    .filter(row => status === 'all' || (status === 'live' ? row.status === 'live' : row.status !== 'live'))
    .filter(row => !onlyFindings || row.findings.length > 0)
    .filter(row => !port || row.ports.some(item => String(item.port) === port))
    .filter(row => !route.tech || row.technologies.some(tech => tech.name.toLowerCase() === route.tech?.toLowerCase()))
    .filter(row => !query || [row.name, row.ip || '', ...row.technologies.map(tech => tech.name)].join(' ').toLowerCase().includes(query))
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'status') return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name);
      return b.risk - a.risk || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name);
    });
  const selected = route.host ? rows.find(row => row.name === route.host) : undefined;
  const open = (row: AssetRow) => navigate({ view: 'assets', host: row.name, tech: route.tech });
  const sortButton = (id: SortKey, label: string) => (
    <button type="button" className={sort === id ? 'on' : ''} onClick={() => setSort(id)} aria-pressed={sort === id}>{label}</button>
  );

  return (
    <>
      <ViewHead eyebrow="Varlık envanteri" title={<>Ağ ve uygulama yüzeyi <span className="ac-badge t-none">{visible.length} / {rows.length}</span></>} />
      <div className="ac-filters">
        <label className="ac-search">
          <SearchIcon />
          <input type="search" placeholder="Host, IP veya teknoloji ara" value={search} onChange={event => setSearch(event.target.value)} aria-label="Varlıklarda ara" />
        </label>
        <div className="ac-seg" role="group" aria-label="DNS durumu">
          {([['all', 'Tümü'], ['live', 'LIVE'], ['other', 'Diğer']] as const).map(([id, label]) => (
            <button key={id} type="button" className={status === id ? 'on' : ''} aria-pressed={status === id} onClick={() => setStatus(id)}>{label}</button>
          ))}
        </div>
        {ports.length > 0 && (
          <label className="ac-select">
            <span>Port</span>
            <select value={port} onChange={event => setPort(event.target.value)}>
              <option value="">Tümü</option>
              {ports.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        )}
        <label className="ac-check"><input type="checkbox" checked={onlyFindings} onChange={event => setOnlyFindings(event.target.checked)} />Yalnızca bulgusu olanlar</label>
        {route.tech && (
          <span className="ac-pill">Teknoloji: {route.tech}
            <button type="button" aria-label="Teknoloji filtresini kaldır" onClick={() => navigate({ view: 'assets', host: route.host })}><CloseIcon /></button>
          </span>
        )}
      </div>

      <div className="ac-split">
        <div className="ac-tablebox">
          <table className="ac-table">
            <thead>
              <tr>
                <th>{sortButton('name', 'Host')}</th>
                <th>{sortButton('status', 'Durum')}</th>
                <th>IP</th>
                <th>Açık portlar</th>
                <th>HTTP</th>
                <th>TLS</th>
                <th>Başlık</th>
                <th>WAF</th>
                <th>Tekn.</th>
                <th>{sortButton('risk', 'Bulgu')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(row => (
                <tr key={row.name} className={`ac-row ${selected?.name === row.name ? 'sel' : ''}`} onClick={() => open(row)}>
                  <td>
                    <div className="ac-hostcell">
                      <button type="button" className="ac-hostbtn" onClick={event => { event.stopPropagation(); open(row); }}>{row.name}</button>
                      <span className="ac-src">{row.sources.join(' + ') || '—'}</span>
                    </div>
                  </td>
                  <td><StatusBadge status={row.status} /></td>
                  <td className="ac-num">{row.ip || '—'}</td>
                  <td>
                    {row.busy ? <span className="ac-muted ac-small">taranıyor…</span> : row.ports.length ? (
                      <div className="ac-ports">{row.ports.slice(0, 4).map(item => <PortChip key={`${item.port}-${item.transport}`} port={item} />)}
                        {row.ports.length > 4 && <span className="ac-muted ac-small">+{row.ports.length - 4}</span>}</div>
                    ) : <span className="ac-muted">{row.detail?.ports ? 'yok' : '—'}</span>}
                  </td>
                  <td className="ac-num">{row.http ? row.http.status : '—'}</td>
                  <td><Grade grade={row.tlsGrade} label="TLS notu" /></td>
                  <td><Grade grade={row.headerGrade} label="Başlık notu" /></td>
                  <td>{row.wafDetected === undefined ? <span className="ac-muted">—</span> : row.wafDetected ? <Badge tone="ok">{row.wafName || 'Var'}</Badge> : <Badge tone="info">Yok</Badge>}</td>
                  <td className="ac-num">{row.technologies.length || '—'}</td>
                  <td><SeverityCounts findings={row.findings} short /></td>
                </tr>
              ))}
            </tbody>
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
