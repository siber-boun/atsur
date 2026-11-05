import Anthropic from '@anthropic-ai/sdk';
import { AI_SYSTEM_PROMPT, type ChatTurn } from './prompt';
import type { ResolvedProvider } from './providers';

export interface StreamResult {
  /** Model yanıtı güvenlik nedeniyle reddetti. */
  refused: boolean;
  /** Claude isteği yedek modele devretti. */
  fallbackUsed: boolean;
  truncated: boolean;
}

export interface StreamOptions {
  provider: ResolvedProvider;
  messages: ChatTurn[];
  signal: AbortSignal;
  onText: (text: string) => void;
}

export class ProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 180_000;

type AnthropicFactory = (apiKey: string) => Pick<Anthropic, 'beta'>;
let anthropicFactory: AnthropicFactory = apiKey => new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });

/** Testlerde sahte istemci vermek için. */
export function setAnthropicFactory(factory: AnthropicFactory | null) {
  anthropicFactory = factory || (apiKey => new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 }));
}

async function streamAnthropic({ provider, messages, signal, onText }: StreamOptions): Promise<StreamResult> {
  const client = anthropicFactory(provider.apiKey as string);
  const result: StreamResult = { refused: false, fallbackUsed: false, truncated: false };
  try {
    // Güvenlik içerikli istekler sınıflandırıcıya takılabilir; reddedilen istek
    // sunucu tarafında Anthropic'in önerdiği yedek modelle yeniden çalıştırılır.
    const stream = client.beta.messages.stream({
      model: provider.model as string,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: AI_SYSTEM_PROMPT,
      messages
    }, { signal });
    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block.type === 'fallback') {
        result.fallbackUsed = true;
      } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onText(event.delta.text);
      } else if (event.type === 'message_delta') {
        if (event.delta.stop_reason === 'refusal') result.refused = true;
        if (event.delta.stop_reason === 'max_tokens') result.truncated = true;
      }
    }
    return result;
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof Anthropic.AuthenticationError) throw new ProviderError('Claude API anahtarı geçersiz.', 401);
    if (error instanceof Anthropic.RateLimitError) throw new ProviderError('Claude istek sınırına ulaşıldı; biraz sonra tekrar deneyin.', 429);
    if (error instanceof Anthropic.BadRequestError) throw new ProviderError(`Claude isteği reddetti: ${error.message}`, 400);
    if (error instanceof Anthropic.APIError) throw new ProviderError(`Claude hata döndürdü (${error.status ?? 'bağlantı'}).`, error.status);
    throw error;
  }
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
let fetchImpl: FetchLike = (url, init) => fetch(url, init);

/** Testlerde sahte fetch vermek için. */
export function setFetch(next: FetchLike | null) {
  fetchImpl = next || ((url, init) => fetch(url, init));
}

/**
 * OpenAI uyumlu /chat/completions akışını (SSE) okur. Satırlar parça sınırında
 * bölünebildiği için tampon tutulur; "data: [DONE]" akışı bitirir.
 */
export async function readChatCompletionStream(body: ReadableStream<Uint8Array>, onText: (text: string) => void): Promise<StreamResult> {
  const result: StreamResult = { refused: false, fallbackUsed: false, truncated: false };
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handleLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return false;
    const data = trimmed.slice(5).trim();
    if (data === '[DONE]') return true;
    try {
      const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string | null; refusal?: string | null }; finish_reason?: string | null }>; error?: { message?: string } };
      if (parsed.error) throw new ProviderError(parsed.error.message || 'Sağlayıcı akış sırasında hata döndürdü.');
      const choice = parsed.choices?.[0];
      if (choice?.delta?.content) onText(choice.delta.content);
      if (choice?.delta?.refusal) { result.refused = true; onText(choice.delta.refusal); }
      if (choice?.finish_reason === 'length') result.truncated = true;
      if (choice?.finish_reason === 'content_filter') result.refused = true;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      // Yorum satırları ve bozuk parçalar atlanır.
    }
    return false;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (handleLine(line)) { await reader.cancel().catch(() => undefined); return result; }
      newline = buffer.indexOf('\n');
    }
  }
  buffer += decoder.decode();
  if (buffer) handleLine(buffer);
  return result;
}

async function streamOpenAiCompatible({ provider, messages, signal, onText }: StreamOptions): Promise<StreamResult> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.model,
      stream: true,
      messages: [{ role: 'system', content: AI_SYSTEM_PROMPT }, ...messages]
    }),
    signal: AbortSignal.any([signal, timeout])
  });
  const label = provider.definition.label;
  if (!response.ok || !response.body) {
    let detail = '';
    try {
      const data = await response.json() as { error?: { message?: string } | string };
      detail = typeof data.error === 'string' ? data.error : data.error?.message || '';
    } catch { /* gövde JSON değil */ }
    const reason = response.status === 401 || response.status === 403 ? 'API anahtarı geçersiz ya da yetkisiz'
      : response.status === 429 ? 'istek sınırına ulaşıldı'
        : response.status === 404 ? 'model ya da adres bulunamadı'
          : `HTTP ${response.status}`;
    throw new ProviderError(`${label}: ${reason}${detail ? ` — ${detail.slice(0, 200)}` : ''}`, response.status);
  }
  return readChatCompletionStream(response.body, onText);
}

export function streamChat(options: StreamOptions): Promise<StreamResult> {
  return options.provider.definition.kind === 'anthropic' ? streamAnthropic(options) : streamOpenAiCompatible(options);
}
