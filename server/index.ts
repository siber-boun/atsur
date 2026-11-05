import express from 'express';
import cors from 'cors';
import { LIMITS, PORT } from './config';
import advancedRoute from './routes/advanced';
import analyzeRoute from './routes/analyze';
import crtRoute from './routes/crt';
import emailSecurityRoute from './routes/emailsec';
import healthRoute from './routes/health';
import scanRoute from './routes/scan';
import techRoute from './routes/tech';
import validateRoute from './routes/validate';
import wildcardRoute from './routes/wildcard';
import sourcesRoute from './routes/sources';
import bruteRoute from './routes/brute';
import aiRoute from './routes/ai';

import authRoute from './routes/auth';
import { validateAuthConfig, requireTrustedRequest, requireAuthentication } from './lib/auth';

validateAuthConfig();
const app = express();
app.disable('x-powered-by');
let inFlight = 0;

const allowedOrigins = new Set([
  'https://osint.busiber.workers.dev',
  ...(process.env.CORS_ALLOWED_ORIGINS || 'https://osint-2pq.pages.dev,http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map((origin) => origin.trim()).filter(Boolean)
]);
app.set('trust proxy', 1);
app.use(cors({ origin(origin, callback) {
  callback(null, !origin || allowedOrigins.has(origin));
} }));
app.use(requireTrustedRequest);
// AI isteği tarama özetini taşıdığı için daha büyük gövde kabul eder; diğer uçlar 16 KB'de kalır.
const smallJson = express.json({ limit: '16kb' });
const aiJson = express.json({ limit: '256kb' });
app.use((req, res, next) => (req.path === '/api/ai/chat' ? aiJson : smallJson)(req, res, next));
app.use(requireAuthentication);
app.use(authRoute);
app.use((req, res, next) => {
  if (req.path === '/health') {
    res.locals.inFlight = inFlight;
    return next();
  }
  if (inFlight >= LIMITS.maxInFlight) {
    res.set('Retry-After', '2');
    return res.status(503).json({ error: 'Sunucu şu anda yoğun, lütfen tekrar deneyin.' });
  }
  inFlight += 1;
  res.locals.inFlight = inFlight;
  let complete = false;
  const done = () => {
    if (complete) return;
    complete = true;
    inFlight -= 1;
  };
  res.once('finish', done);
  res.once('close', done);
  next();
});

app.use(scanRoute);
app.use(crtRoute);
app.use(analyzeRoute);
app.use(techRoute);
app.use(healthRoute);
app.use(advancedRoute);
app.use(emailSecurityRoute);
app.use(validateRoute);
app.use(wildcardRoute);
app.use(sourcesRoute);
app.use(bruteRoute);
app.use(aiRoute);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
