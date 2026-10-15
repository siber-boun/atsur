import { randomBytes, scryptSync } from 'node:crypto';
import { stdin, stdout } from 'node:process';

function readHiddenPassword() {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Parolayı gizli okumak için bu betiği bir terminalde çalıştırın.');
  }
  return new Promise((resolve, reject) => {
    let password = '';
    stdout.write('OSINT giriş parolası: ');
    stdin.setRawMode(true);
    stdin.resume();
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    const onData = chunk => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') {
          cleanup();
          reject(new Error('İşlem iptal edildi.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          resolve(password);
          return;
        }
        if (char === '\u007f' || char === '\b') password = password.slice(0, -1);
        else if (char >= ' ') password += char;
      }
    };
    stdin.on('data', onData);
  });
}

try {
  const password = await readHiddenPassword();
  if (password.length < 12) throw new Error('Parola en az 12 karakter olmalı.');
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64);
  stdout.write(`OSINT_LOGIN_PASSWORD_HASH=scrypt$${salt.toString('base64url')}$${digest.toString('base64url')}\n`);
} catch (error) {
  stdout.write(`${error.message}\n`);
  process.exitCode = 1;
}
