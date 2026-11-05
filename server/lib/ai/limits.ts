// Kullanıcı başına AI isteği sınırı. Sağlayıcı maliyetini ve kötüye kullanımı sınırlar.
const attempts = new Map<string, { count: number; resetAt: number }>();

function positive(raw: string | undefined, fallback: number) {
  const parsed = Number.parseInt(raw || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function allowAiRequest(email: string, now = Date.now(), env: Record<string, string | undefined> = process.env): { allowed: boolean; retryAfterSeconds: number } {
  const limit = positive(env.AI_REQUESTS_PER_WINDOW, 30);
  const windowMs = positive(env.AI_WINDOW_MS, 15 * 60 * 1000);
  const key = email.trim().toLowerCase();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    if (attempts.size > 10_000) for (const [entry, value] of attempts) if (value.resetAt <= now) attempts.delete(entry);
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetAiLimits() {
  attempts.clear();
}
