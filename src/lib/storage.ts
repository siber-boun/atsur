import type { StoredSubdomain, SubdomainData, SubdomainDetail, UserData } from '../types';

const USERS_KEY = 'osint_users';

export function emptyUserData(): UserData {
  return { domains: [], subdomainsCache: {}, subdomainDetailsCache: {}, emailSecCache: {} };
}

export function readStoredUsers(): Record<string, UserData> {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) as Record<string, UserData> : {};
  } catch {
    return {};
  }
}

export function writeStoredUsers(users: Record<string, UserData>) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {
    // Kota dolu veya depolama kapalı; uygulama bellekteki durumla çalışmaya devam eder.
  }
}

/** Kullanıcı kaydını okur, değiştirir ve geri yazar. Kayıt yoksa hiçbir şey yapmaz. */
export function updateStoredUser(email: string, update: (data: UserData) => void) {
  const users = readStoredUsers();
  if (!users[email]) return;
  update(users[email]);
  writeStoredUsers(users);
}

export function normalizeCachedDetail(detail: SubdomainDetail): SubdomainDetail {
  const normalized: SubdomainDetail = {
    ...detail,
    analyzing: false,
    techAnalyzing: false,
    advancedAnalyzing: false
  };
  if (detail.technologies !== undefined) {
    normalized.technologies = Array.isArray(detail.technologies) ? detail.technologies : [];
  }
  return normalized;
}

/**
 * Eski kayıtlarda subdomain listesi düz string dizisi olabilir. Bunlar yüklenirken
 * o dönemin tek kaynağı olan crt.sh ile işaretlenmiş nesnelere çevrilir.
 */
export function normalizeSubdomainList(list: StoredSubdomain[] | undefined): SubdomainData[] {
  if (!Array.isArray(list)) return [];
  return list
    .map(item => typeof item === 'string' ? { subdomain: item, source: 'crt.sh' } : item)
    .filter((item): item is SubdomainData => Boolean(item && typeof item.subdomain === 'string'));
}

export function normalizeSubdomainCache(cache: Record<string, StoredSubdomain[]> | undefined): Record<string, SubdomainData[]> {
  return Object.fromEntries(Object.entries(cache || {}).map(([domain, list]) => [domain, normalizeSubdomainList(list)]));
}

const PREFS_KEY = 'atsur_prefs';

/** Görünüm tercihleri (son AI sağlayıcısı gibi). Okunamazsa boş döner. */
export function readPref(key: string): string | null {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Record<string, string>;
    return typeof prefs[key] === 'string' ? prefs[key] : null;
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string) {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Record<string, string>;
    prefs[key] = value;
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Tercih kaydedilemezse varsayılan kullanılır.
  }
}
