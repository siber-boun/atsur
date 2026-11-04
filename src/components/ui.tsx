import type { ReactNode } from 'react';
import type { PortInfo } from '../types';
import { gradeTone, portTone, type Tone } from '../lib/format';
import { SEVERITY_META, SEVERITY_ORDER, countBySeverity, type Finding, type Severity } from '../lib/findings';
import type { AssetStatus } from '../lib/workspace';

export function Badge({ tone = 'none', children, title }: { tone?: Tone | Severity | 'live' | 'dead'; children: ReactNode; title?: string }) {
  return <span className={`ac-badge t-${tone}`} title={title}>{children}</span>;
}

export function Grade({ grade, label }: { grade?: string; label?: string }) {
  if (!grade) return <span className="ac-muted">—</span>;
  return <span className={`ac-grade t-${gradeTone(grade)}`} aria-label={label ? `${label}: ${grade}` : grade}>{grade}</span>;
}

const STATUS_LABEL: Record<AssetStatus, string> = {
  live: 'LIVE', dead: 'DEAD', private: 'PRIVATE', error: 'HATA', unknown: 'BEKLİYOR', wildcard: 'WILDCARD'
};

export function StatusBadge({ status }: { status: AssetStatus }) {
  const tone = status === 'live' ? 'live' : status === 'dead' || status === 'error' ? 'dead' : 'none';
  return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>;
}

export function PortChip({ port, href }: { port: PortInfo; href?: string }) {
  const title = `${port.service || 'Servis'} · ${(port.transport || 'tcp').toUpperCase()} · ${port.status}`;
  const content = <>
    <span className="ac-port-n">:{port.port}</span>
    <span className={`ac-port-s t-${portTone(port.status, port.verificationSource)}`}>{port.status}</span>
  </>;
  return href
    ? <a className="ac-port" href={href} target="_blank" rel="noopener noreferrer" title={`${title} · ${href}`}>{content}</a>
    : <span className="ac-port" title={title}>{content}</span>;
}

export function SeverityBadge({ severity, count, short = false }: { severity: Severity; count?: number; short?: boolean }) {
  const meta = SEVERITY_META[severity];
  return (
    <Badge tone={severity} title={count !== undefined ? `${count} ${meta.label}` : meta.label}>
      {count !== undefined ? `${count}${short ? meta.short : ` ${meta.label}`}` : meta.label}
    </Badge>
  );
}

export function SeverityCounts({ findings, short = false }: { findings: Finding[]; short?: boolean }) {
  const counts = countBySeverity(findings);
  const items = SEVERITY_ORDER.filter(severity => counts[severity] > 0);
  if (!items.length) return <span className="ac-muted">—</span>;
  return <span className="ac-inline">{items.map(severity => <SeverityBadge key={severity} severity={severity} count={counts[severity]} short={short} />)}</span>;
}

export function Card({ title, sub, children, className = '', action }: { title?: ReactNode; sub?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`ac-card ${className}`}>
      {(title || sub || action) && (
        <div className="ac-card-h">
          {title && <h2>{title}</h2>}
          {sub && <span className="ac-card-sub">{sub}</span>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function ViewHead({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="ac-view-head">
      <div>
        <p className="ac-eyebrow">{eyebrow}</p>
        <h1 className="ac-h1">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="ac-empty">
      <p className="ac-empty-title">{title}</p>
      {children && <div className="ac-empty-body">{children}</div>}
    </div>
  );
}

/** Not dağılımı için yatay çubuklar. */
export function GradeBars({ grades, values }: { grades: string[]; values: Array<string | undefined> }) {
  const counts = grades.map(grade => ({ grade, count: values.filter(value => value === grade).length }));
  const max = Math.max(1, ...counts.map(item => item.count));
  return (
    <div className="ac-bars">
      {counts.map(({ grade, count }) => (
        <div className="ac-bar" key={grade}>
          <Grade grade={grade} />
          <div className="ac-bar-track" aria-hidden="true">
            <div className={`ac-bar-fill t-${gradeTone(grade)}`} style={{ width: `${(count / max) * 100}%` }} />
          </div>
          <span className="ac-bar-count">{count}</span>
        </div>
      ))}
    </div>
  );
}
