import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const TOKEN_TTL_SECONDS = 2 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 10;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const revokedTokens = new Map<string, number>();
const apiAttempts = new Map<string, { count: number; resetAt: number }>();

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to start the API`);
  return value;
}

function expectedPasswordHash() {
  const [scheme, salt, digest, ...extra] = requiredEnv('OSINT_LOGIN_PASSWORD_HASH').split('$');
  if (scheme !== 'scrypt' || !salt || !digest || extra.length || Buffer.from(digest, 'base64url').length !== 64) {
    throw new Error('OSINT_LOGIN_PASSWORD_HASH must use scrypt$<salt-base64url>$<64-byte-hash-base64url>');
  }
  return { salt: Buffer.from(salt, 'base64url'), digest: Buffer.from(digest, 'base64url') };
}

export function verifyLogin(email: unknown, password: unknown): boolean {
  const loginEmail = requiredEnv('OSINT_LOGIN_EMAIL').trim().toLowerCase();
  const sessionSecret = requiredEnv('OSINT_SESSION_SECRET');
  if (Buffer.byteLength(sessionSecret) < 32) throw new Error('OSINT_SESSION_SECRET must be at least 32 bytes');
  const expected = expectedPasswordHash();
  const suppliedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const suppliedPassword = typeof password === 'string' ? password : '';
  // Derive even when the email is incorrect so the response timing does not expose it.
  const actualDigest = scryptSync(suppliedPassword, expected.salt, 64);
  const emailBuffer = Buffer.from(suppliedEmail);
  const expectedEmailBuffer = Buffer.from(loginEmail);
  const emailMatches = emailBuffer.length === expectedEmailBuffer.length && timingSafeEqual(emailBuffer, expectedEmailBuffer);
  return emailMatches && timingSafeEqual(actualDigest, expected.digest);
}

export function createSessionToken(email: string, now = Date.now()): string {
  const secret = requiredEnv('OSINT_SESSION_SECRET');
  if (Buffer.byteLength(secret) < 32) throw new Error('OSINT_SESSION_SECRET must be at least 32 bytes');
  const expiresAt = Math.floor(now / 1000) + TOKEN_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ email, expiresAt, nonce: randomBytes(16).toString('base64url') })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function tokenPayload(token: string, now = Date.now()): { email: string; expiresAt: number } | null {
  const [payload, suppliedSignature, ...extra] = token.split('.');
  if (!payload || !suppliedSignature || extra.length) return null;
  const expectedSignature = createHmac('sha256', requiredEnv('OSINT_SESSION_SECRET')).update(payload).digest();
  let actualSignature: Buffer;
  try { actualSignature = Buffer.from(suppliedSignature, 'base64url'); } catch { return null; }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { email?: unknown; expiresAt?: unknown };
    if (typeof data.email !== 'string' || typeof data.expiresAt !== 'number' || data.expiresAt <= Math.floor(now / 1000)) return null;
    return { email: data.email, expiresAt: data.expiresAt };
  } catch { return null; }
}

export function revokeSessionToken(token: string, expiresAtSeconds: number) {
  revokedTokens.set(createHash('sha256').update(token).digest('hex'), expiresAtSeconds * 1000);
}

export function sessionFromToken(token: string, now = Date.now()) {
  for (const [key, expiresAt] of revokedTokens) if (expiresAt <= now) revokedTokens.delete(key);
  const hash = createHash('sha256').update(token).digest('hex');
  if (revokedTokens.has(hash)) return null;
  return tokenPayload(token, now);
}

function clientIp(req: Request) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function allowLoginAttempt(req: Request, now = Date.now()): boolean {
  const ip = clientIp(req);
  const current = loginAttempts.get(ip);
  if (!current || current.resetAt <= now) {
    if (loginAttempts.size > 10_000) {
      for (const [key, value] of loginAttempts) if (value.resetAt <= now) loginAttempts.delete(key);
    }
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (current.count >= LOGIN_LIMIT) return false;
  current.count += 1;
  return true;
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
  if (req.path === '/health' || req.path === '/api/auth/login' || req.method === 'OPTIONS') return next();
  const authorization = req.header('authorization') || '';
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization);
  const session = match ? sessionFromToken(match[1]) : null;
  if (!session) return res.status(401).json({ error: 'Oturum gerekli veya süresi dolmuş.' });
  if (req.path !== '/api/auth/session' && req.path !== '/api/auth/logout') {
    const rate = allowApiRequest(session.email);
    if (!rate.allowed) {
      res.set('Retry-After', String(rate.retryAfterSeconds));
      return res.status(429).json({ error: 'Tarama isteği sınırına ulaşıldı; bekleyip tekrar deneyin.', retryAfterSeconds: rate.retryAfterSeconds });
    }
  }
  res.locals.userEmail = session.email;
  res.locals.sessionExpiresAt = session.expiresAt;
  res.locals.sessionToken = match![1];
  return next();
}
