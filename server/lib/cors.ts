import type { IncomingHttpHeaders } from 'node:http';

export interface CorsFinding {
  acao: string | null;
  credentials: boolean;
  reflectsOrigin: boolean;
  severity: 'high' | 'medium' | 'info' | 'none';
  note?: string;
}

export const CORS_PROBE_ORIGIN = 'https://evil-osint-probe.example';

export function inspectCors(headers: IncomingHttpHeaders, probeOrigin = CORS_PROBE_ORIGIN): CorsFinding {
  const acaoValue = headers['access-control-allow-origin'];
  const acao = Array.isArray(acaoValue) ? acaoValue[0] || null : acaoValue || null;
  const credentialsValue = headers['access-control-allow-credentials'];
  const credentials = String(Array.isArray(credentialsValue) ? credentialsValue[0] : credentialsValue || '').toLowerCase() === 'true';
  const reflectsOrigin = acao === probeOrigin;
  if ((reflectsOrigin || acao === '*') && credentials) {
    return { acao, credentials, reflectsOrigin, severity: 'high', note: reflectsOrigin ? 'Sunucu denetim origin’ini kimlik bilgileriyle yansıtıyor' : 'Wildcard origin ile kimlik bilgileri birlikte izinli' };
  }
  if (acao === 'null') return { acao, credentials, reflectsOrigin, severity: 'medium', note: 'null origin kabul ediliyor' };
  if (acao === '*') return { acao, credentials, reflectsOrigin, severity: 'info', note: 'Tüm origin’lere açık CORS politikası' };
  return { acao, credentials, reflectsOrigin, severity: 'none' };
}
