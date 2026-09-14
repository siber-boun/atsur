import type { RequestInit } from 'node-fetch';

export async function getFetch() {
  return (await import('node-fetch')).default;
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const fetch = await getFetch();
  const response = await fetch(url, init);
  return response.text();
}

export async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const fetch = await getFetch();
  const response = await fetch(url, init);
  return response.json() as Promise<T>;
}
