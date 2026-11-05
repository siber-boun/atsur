import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { afterEach } from 'node:test';
import express from 'express';
import aiRoute from '../../routes/ai';
import { resetAiLimits } from './limits';
import { buildConversation, validateHistory } from './prompt';
import { listProviders, resolveProvider } from './providers';
import { readChatCompletionStream, setAnthropicFactory, setFetch } from './stream';

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'AI_CLAUDE_MODEL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENCODE_API_KEY', 'OPENCODE_MODEL', 'OPENCODE_BASE_URL', 'AI_REQUESTS_PER_WINDOW'];
const savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  setFetch(null);
  setAnthropicFactory(null);
  resetAiLimits();
});

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
}

async function withServer(run: (base: string) => Promise<void>) {
  const app = express();
  app.use((req, res, next) => express.json({ limit: req.path === '/api/ai/chat' ? '256kb' : '16kb' })(req, res, next));
  app.use((_req, res, next) => { res.locals.userEmail = 'test@example.com'; next(); });
  app.use(aiRoute);
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

const post = (base: string, body: unknown) => fetch(`${base}/api/ai/chat`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});

const validBody = { provider: 'openai', domain: 'example.com', context: { hosts: [] } };

test('sağlayıcı listesi anahtar içermez; Claude dışındakiler model ister', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-secret', OPENAI_API_KEY: 'sk-openai', OPENCODE_API_KEY: 'k', OPENCODE_MODEL: 'm' };
  const providers = listProviders(env);
  assert.equal(JSON.stringify(providers).includes('sk-'), false);
  const byId = Object.fromEntries(providers.map(provider => [provider.id, provider]));
  assert.equal(byId.claude.configured, true);
  assert.equal(byId.claude.model, 'claude-opus-5-5');
  assert.equal(byId.openai.configured, false);
  assert.deepEqual(byId.openai.missing, ['OPENAI_MODEL']);
  assert.deepEqual(byId.opencode.missing, ['OPENCODE_BASE_URL']);
  assert.equal(byId.gemini.configured, false);
});

test('base URL yalnız https kabul edilir', () => {
  const resolved = resolveProvider('opencode', { OPENCODE_API_KEY: 'k', OPENCODE_MODEL: 'm', OPENCODE_BASE_URL: 'http://internal:8080/v1' });
  assert.equal(resolved?.configured, false);
  assert.equal(resolveProvider('opencode', { OPENCODE_API_KEY: 'k', OPENCODE_MODEL: 'm', OPENCODE_BASE_URL: 'https://gw.example/v1/' })?.baseUrl, 'https://gw.example/v1');
  assert.equal(resolveProvider('yok'), null);
});

test('geçmiş doğrulaması rapor+soru sırasını zorunlu kılar', () => {
  assert.deepEqual(validateHistory(undefined), { ok: true, history: [] });
  assert.equal(validateHistory([{ role: 'user', content: 'x' }]).ok, false);
  assert.equal(validateHistory([{ role: 'assistant', content: 'rapor' }]).ok, false);
  assert.equal(validateHistory([{ role: 'assistant', content: 'rapor' }, { role: 'user', content: 'soru' }]).ok, true);
  assert.equal(validateHistory([{ role: 'assistant', content: 'rapor' }, { role: 'user', content: ' ' }]).ok, false);
  const conversation = buildConversation('example.com', { a: 1 }, []);
  assert.equal(conversation.length, 1);
  assert.match(conversation[0].content, /<tarama_verisi>\n\{"a":1\}\n<\/tarama_verisi>/);
});

test('SSE okuyucu bölünmüş satırları birleştirir ve [DONE] ile durur', async () => {
  let text = '';
  const result = await readChatCompletionStream(sseBody([
    'data: {"choices":[{"delta":{"content":"Mer"}}]}\n\nda',
    'ta: {"choices":[{"delta":{"content":"haba"}}]}\n\n: yorum\n\n',
    'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n',
    'data: {"choices":[{"delta":{"content":"görünmemeli"}}]}\n\n'
  ]), chunk => { text += chunk; });
  assert.equal(text, 'Merhaba');
  assert.equal(result.truncated, true);
});

test('route: yapılandırılmamış sağlayıcı 503, geçersiz alanlar 400, büyük gövde 413', async () => {
  delete process.env.OPENAI_API_KEY;
  await withServer(async base => {
    assert.equal((await post(base, validBody)).status, 503);
    process.env.OPENAI_API_KEY = 'k';
    process.env.OPENAI_MODEL = 'test-model';
    assert.equal((await post(base, { ...validBody, provider: 'yok' })).status, 400);
    assert.equal((await post(base, { ...validBody, domain: 'not a domain' })).status, 400);
    assert.equal((await post(base, { ...validBody, context: null })).status, 400);
    assert.equal((await post(base, { ...validBody, messages: [{ role: 'user', content: 'x' }] })).status, 400);
    assert.equal((await post(base, { ...validBody, context: { blob: 'x'.repeat(300_000) } })).status, 413);
  });
});

test('route: OpenAI uyumlu akış istemciye düz metin olarak iletilir', async () => {
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.OPENAI_MODEL = 'test-model';
  let sent: { url: string; body: { model: string; stream: boolean; messages: Array<{ role: string }> }; auth: string } | undefined;
  setFetch(async (url, init) => {
    sent = { url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get('authorization') || '' };
    return new Response(sseBody(['data: {"choices":[{"delta":{"content":"## Yönetici özeti\\n"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"Tamam."}}]}\n\ndata: [DONE]\n\n']), { status: 200 });
  });
  await withServer(async base => {
    const response = await post(base, { ...validBody, messages: [{ role: 'assistant', content: 'rapor' }, { role: 'user', content: 'soru?' }] });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /text\/plain/);
    assert.equal(response.headers.get('x-ai-provider'), 'openai');
    assert.equal(await response.text(), '## Yönetici özeti\nTamam.');
  });
  assert.equal(sent?.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(sent?.auth, 'Bearer sk-test');
  assert.equal(sent?.body.stream, true);
  assert.deepEqual(sent?.body.messages.map(message => message.role), ['system', 'user', 'assistant', 'user']);
});

test('route: sağlayıcının 401 hatası tarayıcıya 502 olarak döner', async () => {
  process.env.OPENAI_API_KEY = 'sk-bad';
  process.env.OPENAI_MODEL = 'test-model';
  setFetch(async () => new Response(JSON.stringify({ error: { message: 'Incorrect API key' } }), { status: 401 }));
  await withServer(async base => {
    const response = await post(base, validBody);
    assert.equal(response.status, 502);
    const data = await response.json() as { error: string };
    assert.match(data.error, /API anahtarı geçersiz/);
  });
});

test('route: kullanıcı başına istek sınırı uygulanır', async () => {
  process.env.OPENAI_API_KEY = 'k';
  process.env.OPENAI_MODEL = 'm';
  process.env.AI_REQUESTS_PER_WINDOW = '2';
  setFetch(async () => new Response(sseBody(['data: [DONE]\n\n']), { status: 200 }));
  await withServer(async base => {
    assert.equal((await post(base, validBody)).status, 200);
    assert.equal((await post(base, validBody)).status, 200);
    const limited = await post(base, validBody);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
  });
});

test('route: Claude akışı, yedek model ve red mesajı', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  let params: Record<string, unknown> | undefined;
  const events = [
    { type: 'content_block_start', index: 0, content_block: { type: 'fallback' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Kısmi yanıt' } },
    { type: 'message_delta', delta: { stop_reason: 'refusal' } }
  ];
  setAnthropicFactory(() => ({
    beta: { messages: { stream: (request: Record<string, unknown>) => { params = request; return (async function* () { yield* events; })(); } } }
  }) as never);
  await withServer(async base => {
    const response = await post(base, { ...validBody, provider: 'claude' });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /^Kısmi yanıt/);
    assert.match(text, /güvenlik filtresi/);
  });
  assert.equal(params?.model, 'claude-opus-5-5');
  assert.equal(params?.fallbacks, 'default');
  assert.deepEqual(params?.betas, ['server-side-fallback-2026-07-01']);
  assert.deepEqual(params?.output_config, { effort: 'medium' });
  assert.equal('temperature' in (params || {}), false);
});
