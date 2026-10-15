import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const prompt = createInterface({ input: stdin, output: stdout, terminal: true });
try {
  const password = await prompt.question('OSINT giriş parolası: ', { signal: AbortSignal.timeout(120_000) });
  if (password.length < 12) throw new Error('Parola en az 12 karakter olmalı.');
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64);
  stdout.write(`OSINT_LOGIN_PASSWORD_HASH=scrypt$${salt.toString('base64url')}$${digest.toString('base64url')}\n`);
} finally {
  prompt.close();
}
