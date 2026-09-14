import type { RequestInit } from 'node-fetch';

export class HttpError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
  }
}

export async function getFetch() {
  return (await import('node-fetch')).default;
}

async function fetchResponse(url: string, init?: RequestInit, timeoutMs = 8000) {
  const fetch = await getFetch();
  const signal = init?.signal || AbortSignal.timeout(timeoutMs);
  const response = await fetch(url, { ...init, signal: signal as any });
  if (!response.ok) throw new HttpError(response.status);
  return response;
}

export async function fetchText(url: string, init?: RequestInit, timeoutMs?: number): Promise<string> {
  const response = await fetchResponse(url, init, timeoutMs);
  return response.text();
}

export async function fetchJson<T = any>(url: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
  const response = await fetchResponse(url, init, timeoutMs);
  return response.json() as Promise<T>;
}
