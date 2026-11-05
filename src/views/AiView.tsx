import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useConsole } from '../lib/console';
import { API_BASE_URL, fetchJsonWithTimeout, statusFromError, streamText } from '../lib/api';
import { buildAiContext, contextSizeKb } from '../lib/aiContext';
import { readPref, writePref } from '../lib/storage';
import type { AiChatMessage, AiReport } from '../types';
import { MiniMarkdown } from '../components/MiniMarkdown';
import { Card, EmptyState, ViewHead } from '../components/ui';
import { TargetGate } from './TargetGate';

interface ProviderInfo {
  id: string;
  label: string;
  configured: boolean;
  model: string | null;
  missing: string[];
}

type ProvidersState =
  | { status: 'loading' }
  | { status: 'ready'; providers: ProviderInfo[] }
  | { status: 'error'; message: string };

const SUGGESTIONS = [
  'Önce hangi hostla başlamalıyım?',
  'Yönetime 3 cümlelik özet yaz.',
  'Sızma testi kapsamına öncelikle hangi hostları almalıyım?',
  'En kritik bulgunun düzeltme adımlarını detaylandır.'
];

function useProviders(): ProvidersState {
  const [state, setState] = useState<ProvidersState>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    fetchJsonWithTimeout<{ providers: ProviderInfo[] }>(`${API_BASE_URL}/api/ai/providers`, {}, 60000, controller.signal)
      .then(data => setState({ status: 'ready', providers: data.providers }))
      .catch(error => {
        if (controller.signal.aborted) return;
        const status = statusFromError(error);
        setState({
          status: 'error',
          message: status === 404
            ? 'Sunucu AI özelliğini henüz desteklemiyor. Backend’in yeni sürümünün Render’a deploy edilmesi gerekiyor.'
            : 'Sağlayıcı listesi alınamadı. Sunucu uyanıyor olabilir; sayfayı birazdan yenileyin.'
        });
      });
    return () => controller.abort();
  }, []);
  return state;
}

function AiPanel({ providers }: { providers: ProviderInfo[] }) {
  const { ws, domain, ai } = useConsole();
  const configured = providers.filter(provider => provider.configured);
  const saved = ai.report;
  const [providerId, setProviderId] = useState(() => {
    const preferred = saved?.provider || readPref('aiProvider');
    return configured.find(provider => provider.id === preferred)?.id || configured[0]?.id || '';
  });
  const [messages, setMessages] = useState<AiChatMessage[]>(saved?.messages || []);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState<{ text: string; kind: 'report' | 'answer' } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const context = useMemo(() => (ws ? buildAiContext(ws) : null), [ws]);
  const provider = providers.find(item => item.id === providerId);
  const reportProvider = saved ? providers.find(item => item.id === saved.provider) : undefined;

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (streaming?.kind === 'answer') endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [streaming?.text, streaming?.kind]);

  if (!ws || !domain || !context) return null;

  const run = async (history: AiChatMessage[], kind: 'report' | 'answer') => {
    if (!provider || streaming) return;
    const targetDomain = domain;
    const controller = new AbortController();
    abortRef.current = controller;
    setError('');
    setStreaming({ text: '', kind });
    let text = '';
    try {
      await streamText(`${API_BASE_URL}/api/ai/chat`, { provider: provider.id, domain: targetDomain, context, messages: history },
        chunk => { text += chunk; setStreaming({ text, kind }); }, controller.signal);
    } catch (streamError) {
      if (!controller.signal.aborted) {
        const message = streamError instanceof Error ? streamError.message.replace(/ \(\d{3}\)$/, '') : 'İstek başarısız oldu.';
        setError(message);
      }
    } finally {
      abortRef.current = null;
      setStreaming(null);
    }
    if (!text.trim()) {
      // Yeni rapor isteği boş döndüyse eski konuşma korunur.
      if (kind === 'answer') setMessages(history.slice(0, -1));
      return;
    }
    const stopped = controller.signal.aborted ? '\n\n> Yanıt kullanıcı tarafından durduruldu.' : '';
    const next: AiChatMessage[] = [...history, { role: 'assistant', content: text + stopped }];
    setMessages(next);
    const report: AiReport = { provider: provider.id, model: provider.model || '', createdAt: kind === 'report' ? new Date().toISOString() : saved?.createdAt || new Date().toISOString(), messages: next };
    ai.saveReport(targetDomain, report);
  };

  const ask = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || !messages.length || streaming) return;
    const history: AiChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(history);
    setDraft('');
    void run(history, 'answer');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(draft);
  };

  const pickProvider = (id: string) => {
    setProviderId(id);
    writePref('aiProvider', id);
  };

  const reportText = messages[0]?.content;
  const conversation = messages.slice(1);

  return (
    <div className="ac-split">
      <div className="ac-ai-main">
        <Card title="Sağlayıcı" sub="API anahtarları sunucu ortam değişkenlerinde">
          <div className="ac-providers" role="radiogroup" aria-label="Yapay zekâ sağlayıcısı">
            {providers.map(item => (
              <button key={item.id} type="button" role="radio" aria-checked={item.id === providerId}
                className={`ac-prov ${item.id === providerId ? 'on' : ''}`} disabled={!item.configured || Boolean(streaming)}
                onClick={() => pickProvider(item.id)} title={item.configured ? undefined : `Eksik: ${item.missing.join(', ')}`}>
                <span className="ac-prov-n">{item.label}</span>
                <span className="ac-prov-m">{item.configured ? item.model : 'yapılandırılmamış'}</span>
              </button>
            ))}
          </div>
          <div className="ac-inline spaced">
            {streaming ? (
              <button type="button" className="ac-btn is-cancel" onClick={() => abortRef.current?.abort()}>Durdur</button>
            ) : (
              <button type="button" className="ac-btn primary" disabled={!provider} onClick={() => void run([], 'report')}>
                {reportText ? 'Yeniden üret' : 'Analiz et'}
              </button>
            )}
            {reportText && !streaming && (
              <>
                <button type="button" className="ac-btn" onClick={() => {
                  void navigator.clipboard.writeText(messages.map(message => `${message.role === 'user' ? '**Soru:** ' : ''}${message.content}`).join('\n\n'))
                    .then(() => setCopied('Kopyalandı')).catch(() => setCopied('Kopyalanamadı'));
                }}>{copied || 'Kopyala'}</button>
                <button type="button" className="ac-btn ghost" onClick={() => { setMessages([]); ai.saveReport(domain, null); }}>Temizle</button>
              </>
            )}
          </div>
          <p className="ac-note spaced">
            Tarama verileri <b>{provider?.label || 'seçili sağlayıcının'}</b> sunucularına gönderilir. Çıktı yapay zekâ yorumudur; önemli kararlardan önce doğrulayın.
          </p>
          {error && <p className="ac-alert" role="alert">{error}</p>}
        </Card>

        {!reportText && !streaming && (
          <EmptyState title="Henüz analiz yok">
            <p className="ac-note">“Analiz et”, seçili hedefin varlıklarını, portlarını, TLS ve başlık sonuçlarını, teknolojilerini, bulgularını ve e-posta güvenliğini yorumlar.</p>
          </EmptyState>
        )}

        {(reportText || streaming?.kind === 'report') && (
          <Card title="Analiz raporu" sub={streaming?.kind === 'report' ? `${provider?.label} yazıyor…`
            : saved ? `${reportProvider?.label || saved.provider} · ${saved.model} · ${new Date(saved.createdAt).toLocaleString('tr-TR')}` : undefined}
            className="ac-report">
            <div aria-live="polite" aria-busy={streaming?.kind === 'report'}>
              <MiniMarkdown source={streaming?.kind === 'report' ? streaming.text || '…' : reportText || ''} />
            </div>
          </Card>
        )}

        {reportText && streaming?.kind !== 'report' && (
          <Card title="Bu sonuçlar hakkında sor" sub="soru-cevap">
            {conversation.length > 0 && (
              <div className="ac-chat">
                {conversation.map((message, index) => (
                  <div key={index} className={`ac-msg ${message.role}`}>
                    <span className="ac-msg-who">{message.role === 'user' ? 'Sen' : reportProvider?.label || provider?.label || 'AI'}</span>
                    {message.role === 'user' ? <p>{message.content}</p> : <MiniMarkdown source={message.content} />}
                  </div>
                ))}
                {streaming?.kind === 'answer' && (
                  <div className="ac-msg assistant" aria-live="polite">
                    <span className="ac-msg-who">{provider?.label} yazıyor…</span>
                    <MiniMarkdown source={streaming.text || '…'} />
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
            <div className="ac-chips spaced">
              {SUGGESTIONS.map(question => (
                <button key={question} type="button" className="ac-hostchip" disabled={Boolean(streaming) || !provider} onClick={() => ask(question)}>{question}</button>
              ))}
            </div>
            <form className="ac-cmd ac-chat-input" onSubmit={submit}>
              <input type="text" value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000}
                placeholder="Örn. ftp hostu için hangi testleri önerirsin?" aria-label="Yapay zekâya soru" disabled={Boolean(streaming)} />
              <button type="submit" className="ac-btn small primary" disabled={!draft.trim() || Boolean(streaming) || !provider}>Gönder</button>
            </form>
          </Card>
        )}
      </div>

      <aside className="ac-card ac-ai-side">
        <div className="ac-card-h"><h2>Gönderilecek veri</h2><span className="ac-card-sub">~{contextSizeKb(context)} KB JSON</span></div>
        <div className="ac-kv">
          <span className="ac-k">Varlık</span><span className="ac-num">{context.hosts.length}{ws.rows.length > context.hosts.length ? ` / ${ws.rows.length}` : ''} (canlı {ws.stats.live})</span>
          <span className="ac-k">Bulgu</span><span className="ac-num">{ws.findings.length}</span>
          <span className="ac-k">Teknoloji</span><span className="ac-num">{ws.technologies.length}</span>
          <span className="ac-k">E-posta</span><span className="ac-num">{ws.email ? 'SPF · DMARC · DKIM' : 'yok'}</span>
          <span className="ac-k">Kaynaklar</span><span className="ac-num">{ws.meta ? `${ws.meta.sources.filter(source => source.ok).length}/${ws.meta.sources.length}` : '—'}</span>
        </div>
        <p className="ac-note">Ham HTML ve sayfa içerikleri gönderilmez. Hedef sistemlerden gelen metinler modele “veri” olarak işaretlenir.</p>
        <p className="ac-note">Son rapor ve sohbet bu hedef için tarayıcıda saklanır.</p>
        {!ws.stats.analyzed && <p className="ac-alert">Tam kapsamlı analiz henüz çalışmadı; TLS, başlık ve teknoloji bilgisi olmadan yorum sınırlı kalır.</p>}
      </aside>
    </div>
  );
}

function AiContent() {
  const { domain } = useConsole();
  const providers = useProviders();
  return (
    <>
      <ViewHead eyebrow="AI Analiz" title={<>Yapay zekâ yorumu <span className="ac-mono ac-muted ac-h1-sub">{domain}</span></>} />
      {providers.status === 'loading' && <p className="ac-note" role="status">Sağlayıcılar yükleniyor…</p>}
      {providers.status === 'error' && <p className="ac-alert" role="alert">{providers.message}</p>}
      {providers.status === 'ready' && (providers.providers.some(provider => provider.configured)
        ? <AiPanel key={domain} providers={providers.providers} />
        : (
          <EmptyState title="Hiçbir yapay zekâ sağlayıcısı yapılandırılmamış">
            <p className="ac-note">Render panelinde backend servisine aşağıdaki ortam değişkenlerinden birini (ya da birkaçını) ekleyip yeniden deploy edin:</p>
            <ul className="ac-env-list">
              {providers.providers.map(provider => (
                <li key={provider.id}><b>{provider.label}</b>: <code>{provider.missing.join(', ')}</code></li>
              ))}
            </ul>
          </EmptyState>
        ))}
    </>
  );
}

export function AiView() {
  return <TargetGate><AiContent /></TargetGate>;
}
