# Faz 7 — TLS / e-posta / cookie / CORS derinliği

> Ön okuma: `plan/anaplan.md`, `plan/plan_faz2.md`.
> Bu fazın dört alt işi **birbirinden bağımsızdır** ve paralel yapılabilir. Faz 3-6'ya bağımlı
> değildir; takvim sıkışırsa erken kazanç için öne alınabilir.

## 1. Amaç

Mevcut analizler yüzeysel: TLS'te yalnız son kullanma tarihine bakılıyor, e-posta güvenliğinde
SPF kaydının varlığı ve `-all` içerip içermediği substring ile kontrol ediliyor. Cookie ve CORS
hiç bakılmıyor — oysa gerekli HTTP başlıkları zaten çekiliyor.

Bu faz dört alanı derinleştirir. **Hepsinde ortak kural: yeni alanlar opsiyonel ve eklemeli;
mevcut A-F / A-E not harfleri korunur** (`grade-${x}` CSS sınıfları buna bağlı).

## 2. Ön koşullar

- **Faz 1 ve Faz 2 tamamlanmış olmalı** (`lib/tls.ts` iskeleti, `httpPool`, SSRF koruması).

## 3. Kapsam

**Yapılacaklar**
- **7a.** TLS derinliği: protokol, cipher, zincir, SAN, hostname eşleşmesi, CAA.
- **7b.** E-posta: gerçek SPF parser (10-lookup limiti), DMARC parser, MTA-STS, TLS-RPT, DNSSEC.
- **7c.** Cookie güvenlik bayrakları.
- **7d.** CORS yanlış yapılandırma tespiti.

**Bilinçli olarak yapılmayacaklar**
- Aktif zafiyet sömürüsü yok; yalnız pasif gözlem ve standart uyum kontrolü.
- Hassas yol taraması (`.git/`, `.env` vb.) **bu fazda yok** — kapsam dışı.
- UI değişiklikleri Faz 8'e ait.

## 4. Dosya manifestosu

**Oluşturulacak:**
```
server/lib/tls.ts          # (Faz 1'de iskelet oluşturulduysa genişletilir)
server/lib/spf.ts
server/lib/spf.test.ts
server/lib/dmarc.ts
server/lib/cookies.ts
server/lib/cors.ts
```

**Değiştirilecek:**
| Dosya | Değişiklik |
|---|---|
| `server/routes/advanced.ts` | TLS derinliği + cookie + CORS |
| `server/routes/emailsec.ts` | Yeni parser'lar + MTA-STS/TLS-RPT/DNSSEC + CAA |
| `server/types.ts` | `SslInfo`, `EmailSecurityInfo` genişlemesi, `CookieFinding`, `CorsFinding` |

## 5. Teknik detay

### 5.1 (7a) TLS derinliği

```ts
export interface SslInfo {
  // --- mevcut alanlar, KORUNUR ---
  valid: boolean; daysLeft: number; issuer: string; isSelfSigned: boolean; grade: string;
  // --- yeni, hepsi opsiyonel ---
  protocol?: string;                 // 'TLSv1.3'
  cipher?: { name: string; version: string; weak: boolean };
  legacyProtocols?: { tls10: 'yes' | 'no' | 'unknown'; tls11: 'yes' | 'no' | 'unknown' };
  chain?: { subject: string; issuer: string }[];
  chainComplete?: boolean;
  san?: string[];
  hostnameMatch?: boolean;
  caa?: { hasRecord: boolean; issuers: string[] };
}
```

**Uyarılar:**

| Konu | Kural |
|---|---|
| **Zincir yürüyüşü** | `cert.issuerCertificate` kök sertifikada **kendine işaret eder**. `cert === cert.issuerCertificate` olduğunda durun, yoksa sonsuz döngü |
| **TLS 1.0/1.1 probu** | Node 18+ varsayılan olarak reddeder. Prob için ayrı bir `tls.connect` gerekir: `minVersion: 'TLSv1'`, `ciphers: 'DEFAULT:@SECLEVEL=0'`. Render'ın OpenSSL derlemesine göre yine başarısız olabilir |
| **Başarısız prob** | `'unknown'` döndürün. **Asla yanlış `'no'` demeyin** — "TLS 1.0 desteklenmiyor" yanlış bilgisi, bilgi vermemekten kötüdür |
| **Zayıf cipher** | RC4, 3DES, CBC-SHA1, NULL, EXPORT |
| **CAA** | `dns.promises.resolveCaa()` — **apex seviyesinde**, her subdomain için tekrarlanmaz. `/api/email-sec` yanıtına konur ("Domain Güvenliği" başlığı altında) |

**Not ayarlaması:** TLS 1.0/1.1 desteği, zayıf cipher ve hostname uyuşmazlığı puan düşürür.
**A-F harfleri korunur.** `grade-D` / `grade-E` sınıflarının `src/index.css`'te tanımlı olduğu
doğrulanmalı; yoksa Faz 8'de eklenir.

### 5.2 (7b) E-posta güvenliği

**Mevcut kod `index.ts:426`'da `txt.includes('-all')` substring kontrolü yapıyor** — gerçek bir
parser değil. Yerine:

**`lib/spf.ts`:**

```ts
export interface SpfResult {
  hasRecord: boolean;
  all: '-all' | '~all' | '?all' | '+all' | null;
  lookupCount: number;
  permerror: boolean;
  permerrorReason?: 'too-many-lookups' | 'multiple-records' | 'syntax';
  truncated: boolean;
  raw?: string;
}
export async function evaluateSpf(domain: string): Promise<SpfResult>;
```

| Kural | Açıklama |
|---|---|
| **10-lookup limiti** | `include`, `a`, `mx`, `ptr`, `exists`, `redirect` mekanizmaları DNS sorgusu yapar. Özyinelemeli sayılır; **10'u aşarsa `permerror`** = kayıt fiilen geçersizdir. *Çoğu domainin düştüğü, çoğu aracın atladığı bulgudur* |
| Döngü koruması | Ziyaret edilen `include` hedefleri için `visited` kümesi |
| Toplam sorgu tavanı | 30; aşılırsa `truncated: true` |
| `+all` / `?all` | Nötr değil, **bulgudur** (herkesin o domain adına mail atmasına izin verir) |
| Birden fazla SPF kaydı | `permerror` |

**`lib/dmarc.ts`:** `p=`, `sp=`, `pct=` (`pct<100` + `p=reject` zayıftır), `rua=`/`ruf=` varlığı,
`adkim`/`aspf` (strict vs relaxed).

**Ek kontroller:**
| Kontrol | Yöntem |
|---|---|
| MTA-STS | `_mta-sts.<domain>` TXT + `https://mta-sts.<domain>/.well-known/mta-sts.txt` → `mode: enforce\|testing\|none` |
| TLS-RPT | `_smtp._tls.<domain>` TXT |
| **DNSSEC** | Node'un `dns` modülü AD bit'ini **veremez**. DoH kullanın: `GET https://cloudflare-dns.com/dns-query?name=<d>&type=A` + `Accept: application/dns-json` → yanıttaki `.AD` alanı. Tek ek HTTP çağrısı, bağımlılık yok |

**Yeni skor (100 üzerinden, A-E harfleri korunur):**

| Madde | Puan |
|---|---|
| SPF var | 15 |
| SPF `-all` | 15 (`~all` 8, `+all`/`?all` **0 ve işaretli**) |
| SPF permerror yok | 10 |
| DMARC var | 15 |
| DMARC `p=reject` | 15 (`quarantine` 10) |
| DMARC `rua` var | 5 |
| DKIM var | 10 |
| DNSSEC | 5 |
| MTA-STS enforce | 5 |
| TLS-RPT | 5 |

### 5.3 (7c) Cookie bayrakları

`routes/advanced.ts` şu an **HEAD** isteği atıyor. HEAD genelde `Set-Cookie` döndürmez →
**GET'e geçin**, başlıklar geldikten sonra gövdeyi `destroy()` edin (gövdeye ihtiyaç yok).

```ts
export interface CookieFinding {
  name: string; secure: boolean; httpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None' | null;
  issues: string[];
}
```

Bulgu üretme kuralları:
- HTTPS yanıtında `Secure` yok
- Oturum benzeri adda (`/sess|sid|token|auth|jwt/i`) `HttpOnly` yok
- `SameSite=None` ama `Secure` yok

### 5.4 (7d) CORS yanlış yapılandırması

İstekte `Origin: https://evil-osint-probe.example` başlığı gönderin ve yanıta bakın:

```ts
export interface CorsFinding {
  acao: string | null; credentials: boolean; reflectsOrigin: boolean;
  severity: 'high' | 'medium' | 'info' | 'none';
  note?: string;
}
```

| Durum | Önem |
|---|---|
| ACAO saldırgan origin'i **yansıtıyor** + `credentials: true` | **high** |
| ACAO `*` + `credentials: true` | **high** (tarayıcı reddeder ama yapılandırma hatasıdır) |
| ACAO `null` | medium |
| ACAO `*` tek başına | info |

Her ikisi de `/api/advanced` yanıtında `security` ve `waf`'ın yanına eklenir.

## 6. Kabul kriterleri

**7a — TLS**
- [ ] Modern bir site için `protocol: 'TLSv1.3'` ve `cipher.weak: false`.
- [ ] Zincir yürüyüşü sonsuz döngüye girmiyor (kökte duruyor).
- [ ] TLS 1.0/1.1 probu başarısızsa `'unknown'` dönüyor, **asla yanlış `'no'` değil**.
- [ ] `san[]` dolu ve `hostnameMatch` doğru hesaplanıyor.
- [ ] CAA yalnız apex için sorgulanıyor (N subdomain için N sorgu **yok**).
- [ ] Mevcut `valid`/`daysLeft`/`issuer`/`isSelfSigned`/`grade` alanları **korunmuş**.

**7b — E-posta**
- [ ] `npm test` → `spf.test.ts` geçiyor; 10-lookup sayımı ve include döngüsü test edilmiş.
- [ ] Bilinen permerror'lu bir domain → `permerror: true`,
      `permerrorReason: 'too-many-lookups'`; sonuç `mxtoolbox`/`dmarcian` ile doğrulanmış.
- [ ] `+all` kullanan domain → skor 0 ve bulgu işaretli.
- [ ] DNSSEC'li bir domain → `dnssec: true` (DoH `.AD`).
- [ ] MTA-STS `enforce` olan bir domain doğru raporlanıyor.
- [ ] Eski `EmailSecurityInfo` alanları korunmuş, yeni alanlar opsiyonel.

**7c/7d — Cookie & CORS**
- [ ] `Set-Cookie` yakalanıyor (GET'e geçildiği için).
- [ ] `Secure`/`HttpOnly`/`SameSite` eksiklikleri `issues[]`'e yazılıyor.
- [ ] CORS yansıtma testi doğru `severity` üretiyor.
- [ ] Gövde indirilmiyor (başlıktan sonra `destroy`) — bellek artışı yok.

## 7. Doğrulama adımları

```bash
cd server && npm test        # spf testleri
npm start &
sleep 3

# TLS derinliği
curl -s "localhost:3001/api/advanced?subdomain=www.example.com" | python3 -m json.tool

# E-posta
curl -s "localhost:3001/api/email-sec?domain=example.com" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('spf:', d.get('spf'))
print('dmarc:', d.get('dmarc'))
print('dnssec:', d.get('dnssec'))
print('skor:', d.get('score'), d.get('grade'))
"

# SPF 10-lookup karşılaştırması (bilinen permerror'lu domain ile)
#   Sonucu https://mxtoolbox.com/spf.aspx çıktısıyla karşılaştırın.

# DNSSEC referans kontrolü
curl -s -H 'Accept: application/dns-json' \
  "https://cloudflare-dns.com/dns-query?name=example.com&type=A" | python3 -m json.tool | grep AD
```

**Zincir döngüsü testi:** Kendinden imzalı sertifikası olan bir hostu sorgulayın; yanıt dönmeli,
süreç asmamalı.

## 8. Devir kontratı

```ts
export interface SslInfo { /* mevcut alanlar + opsiyonel yeni alanlar, §5.1 */ }
export interface CookieFinding { name; secure; httpOnly; sameSite; issues }
export interface CorsFinding { acao; credentials; reflectsOrigin; severity; note? }
export interface SpfResult { hasRecord; all; lookupCount; permerror; permerrorReason?; truncated; raw? }
```

`SubdomainDetail` şunlarla genişler: `cookies?: CookieFinding[]`, `cors?: CorsFinding`
`EmailSecurityInfo` şunlarla genişler: `dnssec?`, `mtaSts?`, `tlsRpt?`, `caa?`, genişletilmiş `spf`/`dmarc`

**Tüm yeni alanlar opsiyoneldir; eski önbellekler ve eski frontend sorunsuz çalışır.**

## 9. Riskler ve geri alma

| Risk | Belirti | Çözüm |
|---|---|---|
| Zincir yürüyüşü sonsuz döngü | İstek asılır, dyno CPU %100 | `cert === cert.issuerCertificate` kontrolü |
| TLS 1.0 probu yanlış negatif | "TLS 1.0 desteklenmiyor" yanlış bilgisi | Başarısızlıkta `'unknown'` |
| SPF özyinelemesi patladı | E-posta kontrolü çok yavaş | Derinlik 10 + toplam 30 sorgu tavanı + `visited` kümesi |
| CAA her subdomain için sorgulandı | Gereksiz N sorgu | Yalnız apex, `/api/email-sec` içinde |
| GET'e geçiş gövde indiriyor | Bellek/bant genişliği artışı | Başlıklardan sonra `destroy()` |
| Not harfleri değişti | UI'daki `grade-*` sınıfları bozulur | A-F / A-E korunmalı |

**Geri alma:** Dört alt iş bağımsız olduğundan tek tek geri alınabilir; tüm yeni alanlar
opsiyonel olduğu için frontend'de iz bırakmaz.
