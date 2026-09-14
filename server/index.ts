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

const app = express();
let inFlight = 0;

app.use(cors());
app.use(express.json());
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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
