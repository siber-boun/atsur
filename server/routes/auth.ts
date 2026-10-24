import { Router } from 'express';
import { clearSessionCookie, createSessionToken, requestToken, revokeSessionToken, sessionFromToken, setSessionCookie, verifyLogin } from '../lib/auth';

const router = Router();
router.post('/api/auth/login', async (req, res) => {
  if (!await verifyLogin(req.body?.email, req.body?.password)) return res.status(401).json({ error: 'Hatalı e-posta veya şifre.' });
  const email = (req.body.email as string).trim().toLowerCase();
  const oldToken = requestToken(req);
  if (oldToken) revokeSessionToken(oldToken);
  const token = createSessionToken(email);
  setSessionCookie(res, token);
  const session = sessionFromToken(token)!;
  return res.json({ email, expiresAt: session.expiresAt, csrfToken: session.csrfToken });
});
router.get('/api/auth/session', (_req, res) => {
  res.json({ email: res.locals.userEmail, expiresAt: res.locals.sessionExpiresAt, csrfToken: res.locals.csrfToken });
});
router.post('/api/auth/logout', (_req, res) => {
  revokeSessionToken(res.locals.sessionToken);
  clearSessionCookie(res);
  res.status(204).end();
});
export default router;
