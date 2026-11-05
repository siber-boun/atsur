# AI Analiz kurulumu

AI Analiz sayfası, seçili hedefin tarama özetini bir yapay zekâ sağlayıcısına gönderip rapor ve soru-cevap üretir. API anahtarları yalnız backend ortam değişkenlerinde tutulur; tarayıcıya gönderilmez. Hiçbir değişken girilmezse sayfa "yapılandırılmamış" durumu gösterir, uygulamanın geri kalanı etkilenmez.

Render panelinde backend servisine (Root Directory: `server`) istediğiniz sağlayıcıların değişkenlerini ekleyip yeniden deploy edin. Bir sağlayıcı, satırındaki zorunlu değişkenlerin hepsi doluysa seçilebilir olur.

| Sağlayıcı | Zorunlu | İsteğe bağlı | Bağlantı |
|---|---|---|---|
| Claude | `ANTHROPIC_API_KEY` | `AI_CLAUDE_MODEL` (varsayılan `claude-opus-5-5`) | Resmi `@anthropic-ai/sdk` |
| ChatGPT | `OPENAI_API_KEY`, `OPENAI_MODEL` | `OPENAI_BASE_URL` (varsayılan `https://api.openai.com/v1`) | OpenAI uyumlu `/chat/completions` |
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` | `GEMINI_BASE_URL` (varsayılan `https://generativelanguage.googleapis.com/v1beta/openai`) | OpenAI uyumlu `/chat/completions` |
| OpenRouter | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | `OPENROUTER_BASE_URL` (varsayılan `https://openrouter.ai/api/v1`) | OpenAI uyumlu `/chat/completions` |
| OpenCode | `OPENCODE_API_KEY`, `OPENCODE_MODEL`, `OPENCODE_BASE_URL` | — | OpenAI uyumlu `/chat/completions` |

Notlar:

- Claude dışındaki sağlayıcılar için varsayılan model yoktur; model adını sağlayıcının güncel dokümanından alıp `*_MODEL` değişkenine yazın.
- Gemini, OpenRouter ve OpenCode adresleri geliştirme sırasında sağlayıcı dokümanlarından doğrulanamadı (ağ erişimi kapalıydı). İlk kullanımda adresin ve kimlik doğrulama biçiminin (`Authorization: Bearer <anahtar>`) sağlayıcının güncel dokümanıyla eşleştiğini kontrol edin. OpenCode için adres bilinçli olarak varsayılansızdır.
- `*_BASE_URL` yalnız `https://` kabul eder ve `…/v1` gibi kök adres olmalıdır; sunucu sonuna `/chat/completions` ekler.
- Claude isteklerinde `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) açıktır: güvenlik sınıflandırıcısı bir isteği reddederse Anthropic'in önerdiği yedek model aynı çağrı içinde devam eder. Reddedilen yanıtlar arayüzde ayrıca belirtilir.

Kötüye kullanım ve maliyet sınırları:

- `AI_REQUESTS_PER_WINDOW` (varsayılan 30) ve `AI_WINDOW_MS` (varsayılan 900000 = 15 dk): kullanıcı başına istek sınırı. Sınır aşılırsa 429 döner.
- İstek gövdesi `/api/ai/chat` için 256 KB, diğer uçlar için 16 KB ile sınırlıdır. Tarama özeti en fazla 200 KB, geçmiş en fazla 20 mesajdır.
- Sağlayıcının 401/403 hatası tarayıcıya 502 olarak iletilir (tarayıcı 401'i oturum sonu sayar).

Gizlilik: tarama özeti (host adları, IP'ler, portlar, TLS ve başlık sonuçları, teknolojiler, bulgular, e-posta kayıtları) maskelenmeden seçilen sağlayıcıya gönderilir. Ham HTML ve yanıt gövdeleri gönderilmez. Hedef sistemlerden gelen metinler prompt içinde `<tarama_verisi>` etiketiyle veri olarak işaretlenir.

Uçlar (ikisi de oturum ister; POST ayrıca `X-CSRF-Token` ister):

- `GET /api/ai/providers` → `{ providers: [{ id, label, configured, model, missing }] }`
- `POST /api/ai/chat` gövdesi `{ provider, domain, context, messages }` → `text/plain` akışı. `messages` boşsa rapor üretilir; doluysa rapor (assistant) ile başlayıp soru (user) ile biten geçmiş olmalıdır.
