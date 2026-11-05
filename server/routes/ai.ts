import { Router, type Response } from 'express';
import { isValidDomain } from '../lib/validate';
import { allowAiRequest } from '../lib/ai/limits';
import { buildConversation, MAX_CONTEXT_CHARS, validateHistory } from '../lib/ai/prompt';
import { listProviders, resolveProvider } from '../lib/ai/providers';
import { ProviderError, streamChat } from '../lib/ai/stream';

const router = Router();

router.get('/api/ai/providers', (_req, res) => {
  res.json({ providers: listProviders() });
});

/**
 * Sağlayıcı hatasını tarayıcıya dönecek koda çevirir. 401/403 asla iletilmez:
 * istemci 401'i oturum sonu olarak yorumlar.
 */
function statusFor(error: unknown): number {
  return error instanceof ProviderError && error.status === 429 ? 429 : 502;
}

function messageFor(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  if (error instanceof Error && error.name === 'TimeoutError') return 'Sağlayıcı zamanında yanıt vermedi.';
  return 'Yapay zekâ sağlayıcısına ulaşılamadı.';
}

router.post('/api/ai/chat', async (req, res) => {
  const body = (req.body ?? {}) as { provider?: unknown; domain?: unknown; context?: unknown; messages?: unknown };
  if (typeof body.provider !== 'string') return res.status(400).json({ error: 'provider alanı gerekli.' });
  const provider = resolveProvider(body.provider);
  if (!provider) return res.status(400).json({ error: 'Bilinmeyen sağlayıcı.' });
  if (!provider.configured) {
    return res.status(503).json({ error: `${provider.definition.label} yapılandırılmamış; sunucuda eksik ortam değişkeni: ${provider.missing.join(', ')}.` });
  }
  if (typeof body.domain !== 'string' || !isValidDomain(body.domain)) return res.status(400).json({ error: 'Geçerli bir domain gerekli.' });
  if (!body.context || typeof body.context !== 'object' || Array.isArray(body.context)) return res.status(400).json({ error: 'Tarama verisi (context) gerekli.' });
  if (JSON.stringify(body.context).length > MAX_CONTEXT_CHARS) return res.status(413).json({ error: 'Tarama verisi çok büyük.' });
  const history = validateHistory(body.messages);
  if (!history.ok) return res.status(400).json({ error: history.error });

  const limit = allowAiRequest(String(res.locals.userEmail || 'anonim'));
  if (!limit.allowed) {
    res.set('Retry-After', String(limit.retryAfterSeconds));
    return res.status(429).json({ error: `AI istek sınırına ulaşıldı; ${Math.ceil(limit.retryAfterSeconds / 60)} dakika sonra tekrar deneyin.` });
  }

  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });

  let started = false;
  const write = (target: Response, text: string) => {
    if (!started) {
      target.status(200).set({
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
        'X-AI-Provider': provider.definition.id,
        'X-AI-Model': encodeURIComponent(provider.model || '')
      });
      target.flushHeaders();
      started = true;
    }
    if (text) target.write(text);
  };

  try {
    const result = await streamChat({
      provider,
      messages: buildConversation(body.domain.toLowerCase(), body.context, history.history),
      signal: controller.signal,
      onText: text => write(res, text)
    });
    if (controller.signal.aborted) return;
    if (result.refused) {
      write(res, started
        ? '\n\n> Yanıt sağlayıcının güvenlik filtresi tarafından durduruldu; yukarıdaki kısım eksik olabilir.'
        : '> Sağlayıcı bu isteği güvenlik filtresi nedeniyle yanıtlamadı. Farklı bir sağlayıcı deneyebilir ya da soruyu yeniden ifade edebilirsiniz.');
    } else if (!started) {
      write(res, '> Sağlayıcı boş yanıt döndürdü.');
    }
    if (result.truncated) write(res, '\n\n> Yanıt uzunluk sınırında kesildi.');
    res.end();
  } catch (error) {
    if (controller.signal.aborted) return;
    if (!started) return res.status(statusFor(error)).json({ error: messageFor(error) });
    res.write(`\n\n> Hata: ${messageFor(error)}`);
    res.end();
  }
});

export default router;
