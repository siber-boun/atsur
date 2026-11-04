export const httpStatusLabel = (status?: number) => {
  if (status === undefined) return 'Yanıt alınamadı';
  const labels: Record<number, string> = {
    200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 206: 'Partial Content',
    301: 'Moved', 302: 'Found', 303: 'See Other', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 429: 'Too Many Requests',
    500: 'Server Error', 502: 'Bad Gateway', 503: 'Unavailable', 504: 'Gateway Timeout'
  };
  return labels[status] || 'HTTP yanıtı';
};

export type Tone = 'ok' | 'redir' | 'warn' | 'bad' | 'tcp' | 'none';

/** Port durum değerinin rengi: sayısal HTTP kodu ya da "TCP Açık" gibi metin. */
export function portTone(status: number | string, verificationSource?: string): Tone {
  if (verificationSource === 'browser') return 'ok';
  const code = typeof status === 'number' ? status : Number.parseInt(String(status), 10);
  if (Number.isFinite(code) && code >= 100) {
    if (code < 300) return 'ok';
    if (code < 400) return 'redir';
    if (code < 500) return 'warn';
    return 'bad';
  }
  if (/açık|yanıt/i.test(String(status))) return 'tcp';
  return 'none';
}

export function gradeTone(grade?: string): Tone {
  if (!grade) return 'none';
  if (grade === 'A' || grade === 'B') return 'ok';
  if (grade === 'C') return 'warn';
  if (['D', 'E', 'F'].includes(grade)) return 'bad';
  return 'none';
}

export function formatCount(value: number | undefined | null): string {
  return typeof value === 'number' ? value.toLocaleString('tr-TR') : '—';
}

export const httpStatusTone = (status?: number) => {
  if (status === undefined) return 'unknown';
  if (status >= 200 && status < 300) return 'success';
  if (status >= 300 && status < 400) return 'info';
  if (status >= 400 && status < 500) return 'warning';
  return 'danger';
};
