import { useCallback, useSyncExternalStore } from 'react';

export type ViewId = 'dashboard' | 'assets' | 'findings' | 'tech' | 'scope' | 'ai' | 'targets';

export const VIEW_IDS: readonly ViewId[] = ['dashboard', 'assets', 'findings', 'tech', 'scope', 'ai', 'targets'];

export interface Route {
  view: ViewId;
  /** Varlıklar sayfasında açık detay paneli. */
  host?: string;
  /** Varlıklar sayfasında teknoloji filtresi. */
  tech?: string;
  /** Bulgular sayfasında seçili bulgu. */
  finding?: string;
}

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const view = (VIEW_IDS as readonly string[]).includes(path) ? path as ViewId : 'dashboard';
  const params = new URLSearchParams(query);
  const route: Route = { view };
  const host = params.get('host');
  const tech = params.get('tech');
  const finding = params.get('finding');
  if (host) route.host = host;
  if (tech) route.tech = tech;
  if (finding) route.finding = finding;
  return route;
}

export function routeToHash(route: Route): string {
  const params = new URLSearchParams();
  if (route.host) params.set('host', route.host);
  if (route.tech) params.set('tech', route.tech);
  if (route.finding) params.set('finding', route.finding);
  const query = params.toString();
  return `#/${route.view}${query ? `?${query}` : ''}`;
}

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

const getHash = () => window.location.hash;

/** Hash tabanlı basit yönlendirme; yenilemede açık sayfa korunur. */
export function useHashRoute(): [Route, (next: Route) => void] {
  const hash = useSyncExternalStore(subscribe, getHash, () => '');
  const navigate = useCallback((next: Route) => {
    const target = routeToHash(next);
    if (window.location.hash !== target) window.location.hash = target;
  }, []);
  return [parseHash(hash), navigate];
}
