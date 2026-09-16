# subdomainfinder — Ana Plan

> Bu doküman seti, geliştirmeyi yapacak ekip için yazılmıştır. Ekibin bu dokümanların
> üretildiği sohbete erişimi yoktur; her faz dosyası kendi kendine yeterlidir.
> **Uygulama sırası:** Faz 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Her faz ayrı dosyada.

## 1. Proje bugün ne yapıyor

`subdomainfinder` (arayüzde "BUSIBER OSINT Platform"), hedef bir şirketin alan adı üzerinden
pasif subdomain taraması yapan ve bulunan subdomain'lerde çalışan web servislerini analiz eden
bir OSINT aracıdır. Canlı: https://siber-boun.github.io/subdomainfinder/

**Mimari (iki bağımsız deploy, ortak kod yok, veritabanı yok):**

- **Frontend:** React 19 + TypeScript + Vite. Tek bir `App.tsx` (~876 satır) içinde auth ekranları,
  dashboard, tarama orkestrasyonu ve tüm render mantığı var. Router yok, komponent kütüphanesi yok.
  `index.css` (~1077 satır) tüm stil. GitHub Pages'e `base: '/subdomainfinder/'` ile deploy edilir.
- **Backend:** Express 5 + CORS, `server/index.ts` (~473 satır), `tsx` ile çalışır, CommonJS, port 3001.
  **Render.com ücretsiz katmanında ayrı deploy edilir** ve GitHub Pages workflow'u tarafından
  *deploy edilmez*. ~15 dk boştaysa uyur, ilk istek ~40 sn sürer.
- **Kalıcılık yok:** Kullanıcılar, domainler ve tüm tarama önbellekleri tarayıcıda `localStorage`
  (`osint_users` anahtarı) içinde tutulur. Parolalar düz metin saklanır.

**Mevcut endpoint'ler** (hepsi GET, hepsi `isValidDomain` regex'iyle doğrulanır):

| Endpoint | İşlev |
|---|---|
| `/api/scan?domain=` | crt.sh + HackerTarget birleştirip subdomain listesi döner |
| `/api/crt?q=` | crt.sh passthrough proxy |
| `/api/analyze?domain=` | IP çözümler, 24 portu TCP ile yoklar, açık olanlara HEAD atıp durum kodu + Cloudflare tespiti |
| `/api/tech?subdomain=` | `TECH_SIGNATURES` ile teknoloji parmak izi (header + HTML regex) |
| `/api/advanced?subdomain=` | TLS sertifika notu (A-F), güvenlik başlığı skoru (A-E), WAF tespiti |
| `/api/email-sec?domain=` | SPF / DMARC / DKIM, skor ve not |
| `/health` | Canlılık kontrolü |

## 2. Neden bu çalışma yapılıyor

Araç bugün bir **liste üreticisi**; hedef onu **doğrulanmış bulgu üreten** bir araca dönüştürmek.

**Sorun 1 — Doğruluk.** crt.sh'den gelen kayıtlar hiçbir DNS doğrulamasından geçmiyor. Sertifika
şeffaflık logları yıllar önce kapanmış hostları da tuttuğu için liste şişkin ve ölü kayıtlarla dolu.
Kaynak sayısı ikiyle sınırlı; HackerTarget ücretsiz kotası dolduğunda kod sessizce boş dönüyor.

**Sorun 2 — Derinlik.** TLS'te yalnızca son kullanma tarihi bakılıyor, e-postada temel SPF/DMARC/DKIM
var. Eyleme dönüştürülebilir bir zafiyet (özellikle subdomain takeover) hiç üretilmiyor.

**Kapsam dışı (bilinçli):** Sürekli izleme / ASM (zamanlanmış tarama, tarama diff'i, uyarı),
sunucu tarafı veritabanı. Kalıcılık şimdilik `localStorage` kalacak; **sonraki adımda Supabase**
düşünülüyor, bu yüzden veri şekilleri ve depolama arayüzü buna hazır tasarlanacak (Faz 8).

## 3. Canlı doğrulanmış kaynak araştırması

> **Bu tablo fiilen test edilerek üretilmiştir.** İnternetteki "API anahtarı gerekmez" listeleri
> (subfinder/subfree vb. araçların dokümanları dahil) bayatlamıştır. Aşağıdaki iki kaynak,
> yaygın olarak "ücretsiz ve anahtarsız" diye önerilmesine rağmen **artık kullanılamaz durumdadır**.

| Kaynak | Test sonucu | Karar |
|---|---|---|
| crt.sh `?q=%.{d}&output=json` | ✅ HTTP 200 | Kullan. **Mevcut kod `?q={d}` sorguluyor; `%.{d}` wildcard kalıbı belirgin şekilde daha fazla kayıt döndürür.** |
| Certspotter `/v1/issuances?domain={d}&include_subdomains=true&expand=dns_names` | ✅ HTTP 200 | Kullan. Anahtarsız kullanım "kişisel/deneme" şartlı ve sıkı kotalı → **429'u hata değil `skipped` say** |
| RapidDNS `/subdomain/{d}?full=1` | ✅ HTTP 200, 99 eşleşme | Kullan. HTML kazıma, kırılgan → parser izole edilmeli |
| urlscan.io `/api/v1/search/?q=domain:{d}` | — | Kullanma (Faz 6'da kaldırıldı) |
| **AlienVault OTX** | ❌ **HTTP 429** — `{"detail": "Anonymous access to this endpoint is limited. Please authenticate."}` | **Artık anahtarsız DEĞİL.** Ücretsiz OTX hesabı anahtarıyla, key-gated kaynak olarak ekle |
| **Anubis (jldc.me)** | ❌ 301 → `jonlu.ca` → **403 (Cloudflare)** | **Ölü. Kapsama alma.** |
| Wayback CDX | ❌ İki denemede de HTTP 000 (45 sn timeout) | Düşük öncelik. Sert timeout + boyut tavanıyla opsiyonel |
| Google / Bing `site:` kazıma | — | **Kapsama alma** (aşağıdaki uyarıya bakınız) |
| SecurityTrails / VirusTotal / Chaos / Shodan | — | Ücretsiz anahtar, env var ile, anahtar yoksa sessizce atlanır |

### ⚠ Kritik mimari uyarı — bu bir CLI aracı değil

Yukarıdaki kaynak listeleri genellikle **kullanıcının kendi makinesinden (residential IP)** çalışan
CLI araçları için derlenmiştir. Bu proje ise **paylaşımlı bir Render datacenter IP'sinden** çalışır:

1. Google/Bing `site:` kazıması datacenter IP'sinden neredeyse anında CAPTCHA'ya takılır → kapsam dışı.
2. Anahtarsız kaynakların kotası **tüm kullanıcılar arasında ortaktır**. Tek bir yoğun kullanıcı
   servisi herkes için bozar. Certspotter (anonim) ilk 429 yiyecek kaynaklardandır.
3. Bu nedenle her kaynak, **bağımsız hata veren "en iyi çaba" eklentisi** olarak tasarlanmalıdır.
   Mevcut koddaki `Promise.allSettled` deseni (`index.ts:131`) bunun doğru temelidir.

### Takeover parmak izi kaynağı

`can-i-take-over-xyz/fingerprints.json` doğrulandı: **117 kayıt**, şema
`{service, cname[], fingerprint, nxdomain, http_status, vulnerable, status}`;
**41 `vulnerable`**, 40 `not vulnerable`, 36 `edge case`.
Yalnızca `vulnerable: true` olanlar "yüksek güven" bulgusu üretmelidir.

## 4. Mevcut kodda doğrulanmış üç gerçek

Bunlar ekibin bilmeden tökezleyeceği noktalardır:

**(a) `handleAnalyzeSubdomain` (`App.tsx:243`) gerçekte `await` edilmiyor.**
İki `.then()` zinciri başlatıp hemen döner. `handleAnalyzeAll`'daki `await ... ` + 300 ms bekleme
yalnızca "300 ms aralıklı ateşle-unut" demektir. 200 subdomain'lik bir domain ≈ 60 saniye içinde
200 eşzamanlı `/api/analyze` isteği, her biri 24 port üzerinde `Promise.all` →
**~4800 eşzamanlı soket. Bu rakam gerçektir ve frontend'de çözülemez; havuz backend'de olmalıdır.**

**(b) `CLAUDE.md` hatalı.** `/api/analyze?subdomain=` yazıyor; kod `req.query.domain` okuyor
(`index.ts:185`) ve `App.tsx:247` `?domain=` gönderiyor. Frontend ile backend uyumlu — **endpoint'i
değil, dokümanı düzeltin** (Faz 0).

**(c) `index.ts:83`'teki `endsWith(domain)` filtresi hatalı.** `example.com` araması için
`notexample.com`'u da kabul eder. Doğrusu: `=== domain || endsWith('.' + domain)` (Faz 4).

## 5. Faz haritası

| Faz | Başlık | Ön koşul | Neden bu sırada |
|---|---|---|---|
| **0** | Dizin düzleştirme + repo hijyeni | — | İçerik değişmeden, tek commit. Sonra yapılırsa git rename takibi bozulur ve diff okunamaz olur |
| **1** | Backend modülerleştirme (saf taşıma) | 0 | 473 satırlık `index.ts` çok büyüyecek; davranış değişmeden bölünmeli |
| **2** | Eşzamanlılık havuzu + SSRF koruması | 1 | **Ağ çağrısı yapan her şeyden önce.** Mevcut sınırsız kodun üstüne 10 kaynak eklemek dyno'yu OOM eder |
| **3** | DNS doğrulama + wildcard tespiti | 2 | Asıl doğruluk kazancı. 4, 5 ve 6'dan önce gelmeli |
| **4** | Kaynak mimarisi + yeni kaynaklar | 3 | Önce doğrulama olmazsa yeni kaynaklar gürültüyü çoğaltır |
| **5** | Tarama orkestrasyonu + brute-force | 3, 4 | Wildcard tespiti olmadan brute-force binlerce false positive üretir |
| **6** | TLS / e-posta / cookie / CORS derinliği | 1, 2 | Bağımsız ve paralelleştirilebilir. Takvim sıkışırsa erken kazanç için öne alınabilir |
| **7** | Subdomain takeover tespiti | 3 | 3'ün CNAME zincirine muhtaç. **Tek en yüksek değerli özellik** |
| **8** | Frontend | 3, 4, 7 kontratları donmuş olmalı | Backend kontratları sabitlenmeden başlanmamalı |

### Pazarlık konusu olmayan sıralama kuralları

1. **Faz 2 her şeyden önce.** Mevcut kod sınırsız eşzamanlılıkla çalışıyor; üstüne 10 kaynak ve
   brute-force eklemek Render dyno'sunu bellek yetersizliğinden düşürür.
2. **Faz 3, Faz 5'ten önce.** Wildcard tespiti olmadan brute-force, hiç yayınlamamaktan kötüdür.
3. **Faz 3, Faz 7'den önce.** Takeover tespiti CNAME zincirine muhtaçtır.

### Deploy sırası (her fazda)

**Önce Render (backend), sonra GitHub Pages (frontend).** İkisi bağımsız deploy edildiği için her
backend yanıt değişikliği, canlıdaki *eski* frontend tarafından tolere edilebilir olmalıdır
(yeni alanlar hep opsiyonel). Tek istisna Faz 5'teki `/api/scan` dizi→nesne değişimidir; bu yüzden
frontend'deki `Array.isArray` koruması backend değişikliğiyle **aynı ya da önceki** sürümde gider.

## 6. Yol boyunca korunacak sözleşmeler

Bu maddeler her fazda geçerlidir ve ihlali regresyon sayılır:

- **Legacy `localStorage` uyumu.** Eski kayıtlarda `subdomainsCache` değerleri `SubdomainData[]`
  yerine düz `string[]` olabilir. Kodda buna karşı 5 ayrı `typeof item === 'string'` koruması var
  (`App.tsx:284, 309, 342, 612, 780`). Faz 8 bunları tek fonksiyonda birleştirir ama **davranışı
  korur**. Hiçbir faz eski önbelleği çöpe çıkarmamalıdır.
- **Yeni alanlar hep opsiyonel ve eklemeli.** Cache invalidation yapılmayacak; eski önbellekler
  render olmaya devam etmeli.
- **`source: string` alanı korunur.** `App.tsx:619-622` `'HackerTarget'` ve `includes('+')`
  string'lerine bakıyor. Yeni `sources: string[]` alanı bunun *yanına* eklenir, yerine değil.
- **A-F / A-E not harfleri korunur.** `grade-${x}` CSS sınıfları buna bağlı.
- **Kapsam (`handleGenerateScope`) prefix listesi ve aktif-web koşulu değişmez**; yalnız filtreye
  yeni koşullar *eklenir*.

## 7. Test yaklaşımı

Projede şu an test koşucusu ve test yok. **Dar kapsamlı test eklenmesi önerilir** — yalnızca
sessizce bozulduğunda UI'da görünmeyen saf fonksiyonlar için:

- Frontend (Vitest): `normalizeSubdomain` / `normalizeUserData` (legacy-string korunumu),
  `lib/spf.ts` lookup sayımı, `lib/takeover.ts` karar mantığı. ~30 vaka.
- Backend (`node --test` + tsx): `lib/pool.ts` (sıra + limit), `lib/ssrf.ts` (CIDR tablosu —
  off-by-one hatası SSRF'i sessizce geri açar).

**Ağ katmanı test edilmeyecek** — `net.Socket` / `tls.connect` mock'lamak getirisinden pahalıdır.

## 8. Genel geliştirme kurulumu

```bash
# Faz 0 SONRASI yollar (Faz 0 öncesi her şey dns-platform/ altındadır)
npm install                  # frontend bağımlılıkları (kök)
cd server && npm install     # backend ayrı paket, ayrı install

# İki terminal:
cd server && npm start       # backend  -> http://localhost:3001
npm run dev                  # frontend -> http://localhost:5173/subdomainfinder/
```

> **⚠ En sık tökezlenen nokta:** `vite.config.ts`, `/api` isteklerini `localhost:3001`'e proxy'ler
> **ama bu proxy yalnızca `VITE_API_URL` boşken devreye girer.** `.env` dosyası `VITE_API_URL`'i
> canlı Render adresine ayarladığı için `npm run dev` varsayılan olarak **production backend'e**
> gider (ve ~40 sn soğuk başlangıç bekler). Lokal backend'i test etmek için `.env`'deki bu satırı
> yorum satırı yapın.

## 9. Riskler (tüm fazlar için geçerli)

| Risk | Etki | Azaltma |
|---|---|---|
| Render free tier (0.1 CPU / 512 MB) bağlayıcı kısıttır | Dyno OOM olur, tarama ortasında kullanıcı genel hata görür | Tüm havuz bütçeleri `config.ts`'te ve env ile override edilebilir; `/health` doluluğu raporlar → prod'da kod değişikliği olmadan ayarlanır |
| Render **Root Directory** ayarı repoda görünmez | Faz 0'da dizin taşınırsa backend deploy'u **sessizce kırılır** | Faz 0 kabul kriterinde Render panelinin güncellenmesi ve `/health` kontrolü zorunlu |
| HTML kazıyan kaynaklar (RapidDNS) sessizce kırılır | `[]` döner, "sonuç yok" gibi görünür | `/api/sources` kaynak başına sayı raporlar; 40→0 düşüşü UI'da görünür olur |
| Takeover false positive'i | Kullanıcı güvenini eksik bulgudan daha hızlı yok eder | Güven kademelendirmesi; **kalıp eşleşmesi tek başına asla "vulnerable" demez** |
| Ücretsiz API'ler tek egress IP'den rate-limit yer | Kaynaklar boş döner | 429 = `skipped` (hata değil); domain başına 1 saatlik in-process cache |
| `localStorage`'da düz metin parola | Güvenlik aracı için itibar sorunu | **Bu turda kapsam dışı.** Faz 8'deki `UserStore` dikişi, Supabase adımında UI'ya dokunmadan düzeltmeyi mümkün kılar. O zamana kadar bu kimlik bilgilerini daha değerli kılacak özellik eklenmemeli |
| Bağımsız deploy'lar sürüm kayması penceresi yaratır | Frontend/backend uyumsuzluğu | "Yeni alanlar hep opsiyonel" disiplini + Faz 5'teki `Array.isArray` koruması |

## 10. Faz dosyaları

| Dosya | İçerik |
|---|---|
| `plan_faz0.md` | Dizin düzleştirme + repo hijyeni |
| `plan_faz1.md` | Backend modülerleştirme (saf taşıma) |
| `plan_faz2.md` | Eşzamanlılık havuzu + SSRF koruması |
| `plan_faz3.md` | DNS doğrulama + wildcard tespiti |
| `plan_faz4.md` | Kaynak mimarisi + yeni kaynaklar |
| `plan_faz5.md` | Tarama orkestrasyonu + brute-force |
| `plan_faz6.md` | TLS / e-posta / cookie / CORS derinliği |
| `plan_faz7.md` | Subdomain takeover tespiti |
| `plan_faz8.md` | Frontend |

Her faz dosyası şu sabit iskeleti kullanır:
**Amaç → Ön koşullar → Kapsam (ve yapılmayacaklar) → Dosya manifestosu → Teknik detay →
Kabul kriterleri → Doğrulama adımları → Devir kontratı → Riskler ve geri alma.**
