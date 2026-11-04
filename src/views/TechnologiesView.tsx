import { useConsole } from '../lib/console';
import { Badge, EmptyState, ViewHead } from '../components/ui';
import { TargetGate } from './TargetGate';

function Technologies() {
  const { ws, navigate } = useConsole();
  if (!ws) return null;
  const groups = new Map<string, typeof ws.technologies>();
  for (const tech of ws.technologies) groups.set(tech.category, [...(groups.get(tech.category) || []), tech]);

  return (
    <>
      <ViewHead eyebrow="Teknolojiler" title={`${ws.technologies.length} teknoloji tespit edildi`} />
      {!ws.technologies.length ? (
        <EmptyState title="Henüz teknoloji tespit edilmedi">
          <p className="ac-note">Teknoloji parmak izi tam kapsamlı analizde, yanıt başlıkları ve sayfa içeriğinden çıkarılır.</p>
        </EmptyState>
      ) : [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([category, items]) => (
        <section key={category} className="ac-techgroup">
          <h2>{category}</h2>
          <div className="ac-techs">
            {items.map(tech => (
              <button key={tech.key} type="button" className="ac-tech" onClick={() => navigate({ view: 'assets', tech: tech.name })}>
                <span className="ac-tech-t">
                  {tech.name}
                  {tech.outdated && <Badge tone="medium">eski sürüm</Badge>}
                  <span className="ac-tech-c">{tech.hosts.length}</span>
                </span>
                {tech.versions.length > 0 && <span className="ac-tech-v">sürüm: {tech.versions.join(', ')}</span>}
                <span className="ac-tech-h">{tech.hosts.join(', ')}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export function TechnologiesView() {
  return <TargetGate><Technologies /></TargetGate>;
}
