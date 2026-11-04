// Same-origin /api: Vite proxies locally; the production Worker forwards to Render.
export const API_BASE_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || '');

let csrfToken = '';

export function setCsrfToken(token: string) {
  csrfToken = token;
}

function apiHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  headers.set('X-OSINT-Request', '1');
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  return headers;
}

function linkAbort(controller: AbortController, parentSignal?: AbortSignal) {
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  return () => parentSignal?.removeEventListener('abort', abortFromParent);
}

/** HTTP hata mesajından durum kodunu çıkarır ("API isteği başarısız (503)" → 503). */
export function statusFromError(error: unknown): number {
  return error instanceof Error ? Number(error.message.match(/\((\d{3})\)/)?.[1]) || 0 : 0;
}

export async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000,
  parentSignal?: AbortSignal
): Promise<T> {
  const controller = new AbortController();
  const unlink = linkAbort(controller, parentSignal);
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, headers: apiHeaders(init.headers), credentials: 'include', signal: controller.signal });
    if (response.status === 401 && !url.endsWith('/api/auth/login')) window.dispatchEvent(new Event('osint-session-expired'));
    if (!response.ok) throw new Error(`API isteği başarısız (${response.status})`);
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } finally {
    window.clearTimeout(timeoutId);
    unlink();
  }
}

/**
 * Düz metin akışı döndüren bir POST isteği yapar; her parçada `onChunk` çağrılır.
 * Sunucu hata gövdesini JSON `{ error }` olarak döndürürse o mesaj fırlatılır.
 */
export async function streamText(
  url: string,
  body: unknown,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    credentials: 'include',
    signal
  });
  if (response.status === 401) window.dispatchEvent(new Event('osint-session-expired'));
  if (!response.ok || !response.body) {
    let message = `API isteği başarısız (${response.status})`;
    try {
      const data = await response.json() as { error?: string };
      if (data.error) message = `${data.error} (${response.status})`;
    } catch { /* gövde JSON değil */ }
    throw new Error(message);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text) onChunk(text);
  }
  const rest = decoder.decode();
  if (rest) onChunk(rest);
}

export async function verifyHttpsFromBrowser(host: string, parentSignal?: AbortSignal): Promise<boolean> {
  // Yalnız keşfedilmiş DNS adlarına, cookiesiz ve gövdesi okunmadan GET yapılır.
  // no-cors, hedef CORS başlığı göndermese bile bağlantı başarısını doğrulamamızı sağlar.
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)) return false;
  if (parentSignal?.aborted) return false;
  const controller = new AbortController();
  const unlink = linkAbort(controller, parentSignal);
  const timeoutId = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://${host}/`, {
      method: 'GET',
      mode: 'no-cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      signal: controller.signal
    });
    try { await response.body?.cancel(); } catch { /* opaque yanıtta body kullanılamayabilir */ }
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
    unlink();
  }
}
