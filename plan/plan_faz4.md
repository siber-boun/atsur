# Faz 4 — Kaynak mimarisi + yeni kaynaklar

> Ön okuma: `plan/anaplan.md` (özellikle **§3 Canlı doğrulanmış kaynak araştırması**
> ve oradaki "bu bir CLI değil" uyarısı), `plan/plan_faz3.md`.

## 1. Amaç

Bugün yalnız iki kaynak var (crt.sh, HackerTarget) ve ikisi de `index.ts` içine gömülü.
HackerTarget'ın ücretsiz kotası dolduğunda kod sessizce boş dizi döndürüyor — kullanıcı
"bu domainde subdomain yok" sanıyor.

Bu faz, kaynakları **eklenebilir bir arayüz** arkasına alır ve doğrulanmış yeni kaynakları ekler.
Amaç yalnız sayı artırmak değil; bir kaynağın sessizce kırıldığının **görülebilir** olmasıdır.

## 2. Ön koşullar

- **Faz 3 tamamlanmış olmalı.** Yeni kaynaklar daha fazla aday getirecek; DNS doğrulama katmanı
  hazır olmadan bu yalnız gürültüyü çoğaltır.
- `lib/pool.ts` (`mapPool`, `sourcePool`) ve `lib/http.ts` mevcut.

## 3. Kapsam

**Yapılacaklar**
- `sources/types.ts`: `SubdomainSource` arayüzü ve `SourceStatus`.
- `sources/index.ts`: kayıt defteri + `runSources()`.
- Mevcut iki kaynağın bu arayüze taşınması.
- Doğrulanmış yeni kaynaklar: `certspotter`, `rapiddns`, `urlscan` (anahtarsız);
  `otx`, `securitytrails`, `virustotal`, `chaos`, `shodan` (env anahtarı ile).
- `sources/certsan.ts`: TLS sertifikası SAN alanından subdomain çıkarımı.
- `GET /api/sources` endpoint'i.
- `index.ts:83`'teki hatalı `endsWith` filtresinin düzeltilmesi.
- crt.sh sorgusunun `?q=%.{domain}` wildcard kalıbına çevrilmesi.
- `server/.env.example`.

**Bilinçli olarak yapılmayacaklar**
- **Anubis (jldc.me) eklenmeyecek** — ölü (301 → `jonlu.ca` → 403 Cloudflare). Test edildi.
- **Google / Bing `site:` kazıması eklenmeyecek** — Render datacenter IP'sinden anında CAPTCHA.
- **OTX anahtarsız eklenmeyecek** — `HTTP 429: "Anonymous access to this endpoint is limited."`
  Yalnız env anahtarı ile.
- Wayback CDX **opsiyonel ve varsayılan kapalı** (testlerde iki kez 45 sn timeout).
- AXFR bu fazda **yapılmayacak** (Faz 5'e ertelendi; değer/emek oranı en düşük madde).
- `/api/scan` yanıt şekli değişmeyecek (Faz 5).

## 4. Dosya manifestosu

**Oluşturulacak:**
```
server/sources/types.ts
server/sources/index.ts          # ALL_SOURCES + runSources()
server/sources/certspotter.ts
server/sources/rapiddns.ts
server/sources/urlscan.ts
server/sources/otx.ts            # key-gated
server/sources/securitytrails.ts # key-gated
server/sources/virustotal.ts     # key-gated
server/sources/chaos.ts          # key-gated
server/sources/shodan.ts         # key-gated
server/sources/wayback.ts        # opsiyonel, varsayılan kapalı
server/sources/certsan.ts
server/routes/sources.ts         # GET /api/sources
server/.env.example
```

**Değiştirilecek:**
| Dosya | Değişiklik |
|---|---|
| `server/sources/crtsh.ts` | `SubdomainSource` arayüzüne uyarlama + `%.` wildcard sorgusu + `endsWith` düzeltmesi |
| `server/sources/hackertarget.ts` | Arayüze uyarlama; kota mesajında `skipped` |
| `server/routes/scan.ts` | `runSources()` kullanımı, N kaynaklı birleştirme |
| `server/config.ts` | API anahtarı env okumaları, kaynak timeout'ları |
| `server/lib/http.ts` | `AbortSignal` / timeout desteği |
| `.gitignore` | `server/.env` |

## 5. Teknik detay

### 5.1 `sources/types.ts`

```ts
export interface SourceHit { subdomain: string; ip?: string }

export interface SourceContext {
  fetchJson: <T>(url: string, init?: any) => Promise<T>;
  fetchText: (url: string, init?: any) => Promise<string>;
  signal: AbortSignal;
}

export interface SubdomainSource {
  id: string;              // 'crtsh' | 'certspotter' | ...  kararlı, veri içinde kullanılır
  label: string;           // 'crt.sh'  — UI rozetinde görünen
  requiresKey?: string;    // env değişkeni adı, örn. 'SECURITYTRAILS_API_KEY'
  enabledByDefault?: boolean;  // wayback için false
  timeoutMs?: number;      // varsayılan 8000
  fetch(domain: string, ctx: SourceContext): Promise<SourceHit[]>;
}

export interface SourceStatus {
  id: string; label: string; ok: boolean; count: number; ms: number;
  skipped?: 'no-key' | 'timeout' | 'error' | 'disabled' | 'rate-limited';
}
```

### 5.2 Her kaynağın ortak kuralları

Her kaynak modülü ~25 satırdır ve şu adımları uygular:

1. `fetch` → parse
2. `toLowerCase()`
3. Baştaki `*.` işaretini at
4. **Filtre: `name === domain || name.endsWith('.' + domain)`**
5. Dedupe
6. `catch { return [] }` — **her kaynak bağımsız hata verir**

> ### ⚠ Düzeltilecek hata
> Mevcut `index.ts:83` şu filtreyi kullanıyor: `finalDomain.endsWith(domain)`.
> Bu, `example.com` araması için **`notexample.com`'u da kabul eder.**
> Doğrusu 4. maddedeki kontroldür. Bu düzeltme bu fazda yapılır (Faz 1 saf taşıma olduğu
> için orada bilinçli olarak ertelenmişti).

### 5.3 Kaynak uç noktaları

**Anahtarsız (test edildi, çalışıyor):**

| id | URL | Parse |
|---|---|---|
| `crtsh` | `https://crt.sh/?q=%.{d}&output=json` | `name_value`, `\n` ile böl |
| `certspotter` | `https://api.certspotter.com/v1/issuances?domain={d}&include_subdomains=true&expand=dns_names` | `dns_names[]` |
| `rapiddns` | `https://rapiddns.io/subdomain/{d}?full=1` | HTML; `<td>` içindeki hostname regex'i |
| `urlscan` | `https://urlscan.io/api/v1/search/?q=domain:{d}&size=100` | `results[].page.domain` |

> **crt.sh:** Mevcut kod `?q={d}` kullanıyor; `?q=%.{d}` wildcard kalıbı belirgin şekilde
> daha fazla kayıt döndürür. Bu değişiklik bu fazda yapılır.
>
> **Certspotter:** Anahtarsız kullanım "kişisel/deneme" şartlıdır ve sıkı kotalıdır.
> **HTTP 429 hata değil, `skipped: 'rate-limited'` olarak raporlanmalıdır.**
>
> **RapidDNS:** HTML kazır, kırılgandır. Parser tek fonksiyonda izole edilmeli ki markup
> değiştiğinde tek yer düzeltilsin.

**Anahtar gerektiren (env; anahtar yoksa sessizce `skipped: 'no-key'`):**

| id | env | Not |
|---|---|---|
| `otx` | `OTX_API_KEY` | `https://otx.alienvault.com/api/v1/indicators/domain/{d}/passive_dns`, `X-OTX-API-KEY` header. **Anahtarsız 429 verir** |
| `securitytrails` | `SECURITYTRAILS_API_KEY` | |
| `virustotal` | `VIRUSTOTAL_API_KEY` | Ücretsiz katman 4 istek/dk |
| `chaos` | `CHAOS_API_KEY` | ProjectDiscovery |
| `shodan` | `SHODAN_API_KEY` | |

**`certsan` (bedava, dış servis yok):** `/api/advanced`'in zaten kullandığı `tls.connect` yolundan
apex'in 443 portuna bağlanıp `cert.subjectaltname` okunur; `DNS:` önekleri ve `*.` temizlenir.

### 5.4 `runSources()`

```ts
export async function runSources(domain: string): Promise<{
  hits: Map<string, { subdomain: string; ip?: string; sources: string[] }>;
  statuses: SourceStatus[];
}>;
```

- `mapPool(ALL_SOURCES, LIMITS.source /* 4 */, ...)`
- Kaynak başına `AbortSignal.timeout(s.timeoutMs ?? 8000)`
- `requiresKey` env'i yoksa → hiç çağırma, `skipped: 'no-key'` (hata **değil**)
- `enabledByDefault === false` → `skipped: 'disabled'`
- Birleştirme: `index.ts:139-152`'deki mevcut Map mantığının N kaynağa genellenmiş hâli

### 5.5 Geriye uyum — `source` alanı korunur

`src/App.tsx:619-622` şu an `'HackerTarget'` tam eşleşmesine ve `source.includes('+')` kontrolüne
bakıyor. **Bu alan kırılmamalıdır:**

```ts
{
  subdomain: 'a.example.com',
  source: 'crt.sh + Certspotter',      // KORUNUR: labels.join(' + ')
  sources: ['crtsh', 'certspotter'],   // YENİ: id dizisi
}
```

Yeni UI `sources[]`'u okur; eski UI ve eski `localStorage` önbellekleri `source` ile çalışmaya
devam eder.

### 5.6 `GET /api/sources`

```json
[
  { "id": "crtsh", "label": "crt.sh", "ok": true, "count": 42, "ms": 1120 },
  { "id": "otx", "label": "AlienVault OTX", "ok": false, "count": 0, "ms": 0, "skipped": "no-key" }
]
```

Bu endpoint yalnız kozmetik değildir: **HTML kazıyan bir kaynak sessizce kırıldığında
(40 → 0 düşüşü) tek görünürlük aracıdır.**

### 5.7 `.env` hijyeni — anahtar eklemeden ÖNCE

`server/.env.example` oluşturulmalı ve `server/.env` `.gitignore`'a eklenmelidir.
Faz 0'da kök `.env` takipten çıkarılmıştı; aynı kontrol `server/` için de yapılmalı:

```bash
git ls-files | grep "\.env"     # boş olmalı
```

## 6. Kabul kriterleri

- [ ] Tüm anahtarlar boşken `GET /api/sources` çalışıyor; key-gated kaynaklar `skipped: 'no-key'`,
      **hiçbiri hata değil**, 500 yok.
- [ ] Anahtarsız 4 kaynak (`crtsh`, `certspotter`, `rapiddns`, `urlscan`) bilinen bir domain için
      `count > 0` döndürüyor.
- [ ] `/api/scan` sonuçlarında `source` alanı hâlâ `'crt.sh + X'` biçiminde **ve** yeni `sources[]`
      dizisi mevcut.
- [ ] **`endsWith` hatası düzeltildi:** `example.com` taramasında `notexample.com` benzeri bir kayıt
      sonuçlarda **yok** (birim testi ile kanıtlanmış).
- [ ] crt.sh sorgusu `%.{domain}` kalıbını kullanıyor ve düz `{domain}` sorgusundan **daha fazla**
      benzersiz kayıt döndürüyor (iki sorgu karşılaştırılarak kanıtlanmış).
- [ ] Bir kaynağın timeout'a düşmesi diğerlerini etkilemiyor (ağ kesilerek test edilmiş).
- [ ] Certspotter 429 döndüğünde `skipped: 'rate-limited'` raporlanıyor, `ok: false` ama hata log'u
      gürültüsü yok.
- [ ] `git ls-files | grep "\.env"` boş.
- [ ] `server/.env.example` tüm opsiyonel anahtarları listeliyor.

## 7. Doğrulama adımları

```bash
cd server && npm start &
sleep 3

# Kaynak durumu (anahtarsız ortamda)
curl -s localhost:3001/api/sources | python3 -m json.tool

# Tarama + kaynak etiketleri
curl -s "localhost:3001/api/scan?domain=example.com" | python3 -m json.tool | head -40

# endsWith hatası regresyonu — sonuçlarda domain'in gerçek alt alanı olmayan kayıt olmamalı
curl -s "localhost:3001/api/scan?domain=example.com" \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
items = d if isinstance(d,list) else d.get('results',[])
bad=[x['subdomain'] for x in items
     if not (x['subdomain']=='example.com' or x['subdomain'].endswith('.example.com'))]
print('HATALI KAYITLAR:', bad if bad else 'yok')
"

# crt.sh wildcard kalıbı kazancı
curl -s "https://crt.sh/?q=example.com&output=json"    | python3 -c "import json,sys;print('duz  :',len({n.strip().lower() for i in json.load(sys.stdin) for n in i['name_value'].split(chr(10))}))"
curl -s "https://crt.sh/?q=%25.example.com&output=json" | python3 -c "import json,sys;print('wildcard:',len({n.strip().lower() for i in json.load(sys.stdin) for n in i['name_value'].split(chr(10))}))"
```

**Kaynak izolasyonu testi:** Tarama sürerken ağı kesin (Wi-Fi kapat) → kalan kaynaklar yine dönmeli,
endpoint 500 vermemeli, `statuses` içinde timeout'a düşenler `skipped: 'timeout'` görünmeli.

## 8. Devir kontratı

```ts
// server/sources/types.ts
export interface SourceHit { subdomain: string; ip?: string }
export interface SubdomainSource { id; label; requiresKey?; enabledByDefault?; timeoutMs?; fetch(domain, ctx) }
export interface SourceStatus { id; label; ok; count; ms; skipped? }

// server/sources/index.ts
export const ALL_SOURCES: SubdomainSource[];
export function runSources(domain: string): Promise<{
  hits: Map<string, { subdomain: string; ip?: string; sources: string[] }>;
  statuses: SourceStatus[];
}>;
```

**Veri sözleşmesi (Faz 5 ve 8 buna güvenir):**
```ts
{ subdomain: string; source: string /* 'A + B' KORUNUR */; sources: string[]; ip?: string }
```

**Endpoint:** `GET /api/sources -> SourceStatus[]`

## 9. Riskler ve geri alma

| Risk | Belirti | Çözüm |
|---|---|---|
| HTML kazıyan kaynak sessizce kırıldı | `count: 0`, kullanıcı "sonuç yok" sanır | `/api/sources` sayıları; parser izole edilmiş tek fonksiyonda |
| Ücretsiz API tek Render IP'sinden rate-limit yedi | Kaynaklar boş döner | 429 = `skipped`, hata değil; domain başına 1 saat in-process cache düşünün |
| Yeni kaynaklar gürültüyü artırdı | Liste şişti | Faz 3 doğrulaması bunu dengeler — **bu yüzden Faz 3 önce gelir** |
| API anahtarı repoya sızdı | Güvenlik olayı | `.env.example` + `.gitignore`; kabul kriterinde `git ls-files` kontrolü |
| `source` alanı kırıldı | Eski önbellekler ve rozetler bozulur | `labels.join(' + ')` biçimi korunmalı; `sources[]` **ek** alandır |
| Tüm kaynaklar aynı anda yavaşladı | Tarama uzar | `sourcePool` 4 + kaynak başına 8 sn timeout |

**Geri alma:** Kaynak modülleri eklemeli olduğundan tek tek `ALL_SOURCES`'tan çıkarılabilir;
tam geri alma için `git revert`.
