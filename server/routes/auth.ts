import { Router } from 'express';
import { allowLoginAttempt, createSessionToken, requireAuthentication, revokeSessionToken, sessionFromToken, verifyLogin } from '../lib/auth';

const router = Router();

router.post('/api/auth/login', (req, res) => {
  if (!allowLoginAttempt(req)) {
    res.set('Retry-After', '900');
    return res.status(429).json({ error: 'Çok fazla giriş denemesi. Bir süre sonra tekrar deneyin.' });
  }
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!verifyLogin(email, password)) return res.status(401).json({ error: 'Hatalı e-posta veya şifre.' });
  const normalizedEmail = email.trim().toLowerCase();
  return res.json({ token: createSessionToken(normalizedEmail), email: normalizedEmail });
});

router.get('/api/auth/session', requireAuthentication, (_req, res) => {
  res.json({ email: res.locals.userEmail, expiresAt: res.locals.sessionExpiresAt });
});

router.post('/api/auth/logout', requireAuthentication, (_req, res) => {
  const token = res.locals.sessionToken as string;
  const session = sessionFromToken(token);
  if (session) revokeSessionToken(token, session.expiresAt);
  res.status(204).end();
});

export default router;
