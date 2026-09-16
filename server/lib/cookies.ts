export interface CookieFinding {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None' | null;
  issues: string[];
}

/** Parse each Set-Cookie header separately; Node preserves repeated headers as an array. */
export function inspectCookies(values: string[] | undefined, isHttps = true): CookieFinding[] {
  return (values || []).map((value) => {
    const parts = value.split(';').map((part) => part.trim()).filter(Boolean);
    const name = parts[0]?.split('=', 1)[0] || 'Bilinmeyen';
    const flags = new Map(parts.slice(1).map((part) => {
      const index = part.indexOf('=');
      return [(index === -1 ? part : part.slice(0, index)).toLowerCase(), index === -1 ? '' : part.slice(index + 1)];
    }));
    const secure = flags.has('secure');
    const httpOnly = flags.has('httponly');
    const rawSameSite = flags.get('samesite')?.toLowerCase();
    const sameSite = rawSameSite === 'strict' ? 'Strict' : rawSameSite === 'lax' ? 'Lax' : rawSameSite === 'none' ? 'None' : null;
    const issues: string[] = [];
    if (isHttps && !secure) issues.push('HTTPS üzerinde Secure bayrağı yok');
    if (/(sess|sid|token|auth|jwt)/i.test(name) && !httpOnly) issues.push('Oturum benzeri cookie’de HttpOnly bayrağı yok');
    if (sameSite === 'None' && !secure) issues.push('SameSite=None için Secure bayrağı zorunludur');
    return { name, secure, httpOnly, sameSite, issues };
  });
}
