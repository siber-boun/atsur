import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const COOKIE_NAME = '__Host-osint_session';
const sessions = new Map<string, { email: string; expiresAt: number; csrfToken: string }>();
const apiAttempts = new Map<string, { count: number; resetAt: number }>();
const keyFor = (token: string) => createHash('sha256').update(token).digest('hex');

function passwordHash() {
  const [scheme, salt, digest, ...extra] = (process.env.OSINT_LOGIN_PASSWORD_HASH || '').split('$');
  if (scheme !== 'scrypt' || !salt || !digest || extra.length ||
      Buffer.from(salt, 'base64url').length < 16 || Buffer.from(digest, 'base64url').length !== 64) {
    throw new Error('OSINT_LOGIN_PASSWORD_HASH must be scrypt$<salt>$<64-byte-digest>');
  }
  return { salt: Buffer.from(salt, 'base64url'), digest: Buffer.from(digest, 'base64url') };
}

export function validateAuthConfig() {
  if (!process.env.OSINT_LOGIN_EMAIL?.trim()) throw new Error('OSINT_LOGIN_EMAIL is required');
  passwordHash();
}

export async function verifyLogin(email: unknown, password: unknown): Promise<boolean> {
  if (typeof email !== 'string' || typeof password !== 'string' || email.length > 320 || password.length > 1024) return false;
  const expected = passwordHash();
  const actual = await new Promise<Buffer>((resolve, reject) => scrypt(password, expected.salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result)));
  return timingSafeEqual(actual, expected.digest) && email.trim().toLowerCase() === process.env.OSINT_LOGIN_EMAIL!.trim().toLowerCase();
}

export function createSessionToken(email: string, now = Date.now()): string {
  for (const [key, session] of sessions) if (session.expiresAt * 1000 <= now) sessions.delete(key);
  const token = randomBytes(32).toString('base64url');
  sessions.set(keyFor(token), { email, expiresAt: Math.floor((now + SESSION_TTL_MS) / 1000), csrfToken: randomBytes(32).toString('base64url') });
  return token;
}

export function sessionFromToken(token: string, now = Date.now()) {
  const key = keyFor(token);
  const session = sessions.get(key);
  if (!session || session.expiresAt * 1000 <= now) { sessions.delete(key); return null; }
  return session;
}

export function revokeSessionToken(token: string) { sessions.delete(keyFor(token)); }

export function requestToken(req: Request): string {
  const values = (req.headers.cookie || '').split(';').map(value => value.trim()).filter(value => value.startsWith(COOKIE_NAME + '='));
  return values.length === 1 ? values[0].slice(COOKIE_NAME.length + 1) : '';
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
}

// Custom header blocks cross-origin form submissions, including login CSRF.
export function requireTrustedRequest(req: Request, res: Response, next: NextFunction) {
  res.set('Cache-Control', 'no-store');
  if (req.path === '/health' || req.method === 'OPTIONS') return next();
  const allowed = new Set(['https://osint.busiber.workers.dev', ...(process.env.CORS_ALLOWED_ORIGINS || 'https://osint-2pq.pages.dev,http://localhost:5173,http://127.0.0.1:5173').split(',').map(x => x.trim())]);
  const origin = req.header('origin');
  if ((origin && !allowed.has(origin)) || req.header('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'İstek kaynağı kabul edilmedi.' });
  if (!['GET', 'HEAD'].includes(req.method) && req.header('x-osint-request') !== '1') return res.status(403).json({ error: 'İstek doğrulanamadı.' });
  return next();
}

export function allowApiRequest(email: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const limit = Number.parseInt(process.env.USER_API_REQUESTS || '600', 10);
  const windowMs = Number.parseInt(process.env.USER_API_WINDOW_MS || '900000', 10);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 600;
  const safeWindow = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 900_000;
  const key = email.trim().toLowerCase();
  const current = apiAttempts.get(key);
  if (!current || current.resetAt <= now) {
    if (apiAttempts.size > 10_000) {
      for (const [entryKey, value] of apiAttempts) if (value.resetAt <= now) apiAttempts.delete(entryKey);
    }
    apiAttempts.set(key, { count: 1, resetAt: now + safeWindow });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= safeLimit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function requireAuthentication(req: Request, res: Response, next: NextFunction) {
  if (req.path === '/health' || (req.path === '/api/auth/login' && req.method === 'POST') || req.method === 'OPTIONS') return next();
  const token = requestToken(req);
  const session = token ? sessionFromToken(token) : null;
  if (!session) { clearSessionCookie(res); return res.status(401).json({ error: 'Oturum gerekli veya süresi dolmuş.' }); }
  if (!['GET', 'HEAD'].includes(req.method) && req.header('x-csrf-token') !== session.csrfToken) return res.status(403).json({ error: 'Oturum doğrulaması başarısız.' });
  res.locals.userEmail = session.email;
  res.locals.sessionExpiresAt = session.expiresAt;
  res.locals.csrfToken = session.csrfToken;
  res.locals.sessionToken = token;
  return next();
}
