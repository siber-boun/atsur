# Faz 7 — Subdomain takeover tespiti

> Ön okuma: `plan/anaplan.md`, `plan/plan_faz3.md`.
> **Bu, projenin ekleyeceği tek en yüksek değerli özelliktir:** ilk kez "liste" değil,
> eyleme dönüştürülebilir bir **zafiyet** üretilir.

## 1. Amaç

Subdomain takeover, bir subdomain'in CNAME ile bir bulut servisine (S3, Azure, GitHub Pages…)
işaret etmesi ama o servisteki kaynağın silinmiş/sahipsiz olmasıdır. Saldırgan o kaynağı kendi
adına oluşturarak subdomain üzerinde içerik yayınlayabilir — çerez çalma, phishing ve marka
istismarı için kullanılır.

Faz 3 zaten CNAME zincirini ve `nxdomainAtEnd` bilgisini üretiyor. Bu faz o veriyi **yorumlar**.

**Önemli:** Vakaların büyük bölümü (dangling CNAME) **hiç HTTP isteği gerektirmez** — yalnız
Faz 3'ün DNS verisiyle tespit edilir. Bu da özelliği ucuz ve hızlı kılar.

## 2. Ön koşullar

- **Faz 3 tamamlanmış olmalı.** `DnsResult.cnameTarget` ve `DnsResult.nxdomainAtEnd` alanları
  bu fazın tek girdisidir.
- Faz 2'den `httpPool` mevcut.

## 3. Kapsam

**Yapılacaklar**
- `fingerprints/takeover.ts`: servis parmak izi tablosu.
- `lib/takeover.ts`: karar ağacı ve güven kademelendirmesi.
- `/api/scan` akışında CNAME'i olan hostlar için otomatik kontrol.
- `POST /api/takeover`: yeniden kontrol ve ikinci doğrulama partisi için.
- `lib/takeover.ts` için birim testleri.

**Bilinçli olarak yapılmayacaklar**
- **Takeover'ı doğrulamak için kaynak oluşturma girişimi yapılmayacak** (S3 bucket açma vb.).
  Bu, hedefin altyapısında değişiklik demektir; araç yalnız **tespit** eder.
- Kalıp eşleşmesi tek başına "vulnerable" ilan edilmeyecek (§5.2, kural 4).
- UI (banner, rozet) Faz 8'e ait — bu faz yalnız backend verisi üretir.

## 4. Dosya manifestosu

**Oluşturulacak:**
```
server/fingerprints/takeover.ts
server/lib/takeover.ts
server/lib/takeover.test.ts
server/routes/takeover.ts        # POST /api/takeover
```

**Değiştirilecek:**
| Dosya | Değişiklik |
|---|---|
| `server/routes/scan.ts` | CNAME'i olan hostlar için takeover kontrolü |
| `server/types.ts` | `TakeoverFinding` tipi, `SubdomainData.takeover?` |
| `server/index.ts` | Route kaydı |

## 5. Teknik detay

### 5.1 `fingerprints/takeover.ts`

Referans: `can-i-take-over-xyz/fingerprints.json` (doğrulandı: 117 kayıt, 41'i `vulnerable: true`,
36'sı `edge case`). **Yalnızca `vulnerable: true` olanlar yüksek güven bulgusu üretmelidir.**

```ts
export interface TakeoverFingerprint {
  service: string;                 // 'AWS S3', 'GitHub Pages', ...
  cname: RegExp[];                 // /\.s3[.-][a-z0-9-]*\.amazonaws\.com$/
  bodyFingerprints: string[];      // 'NoSuchBucket', "There isn't a GitHub Pages site here"
  nxdomainIsVulnerable: boolean;   // Azure *.cloudapp.net gibi: NXDOMAIN tek başına yeterli
  status: 'vulnerable' | 'edge-case';
  note?: string;
}

export const TAKEOVER_FINGERPRINTS: TakeoverFingerprint[];
```

Başlangıç için ~30 kayıt: AWS S3, CloudFront, Azure (cloudapp / azurewebsites / trafficmanager /
blob), GitHub Pages, Heroku, Shopify, Fastly, Netlify, Vercel, Zendesk, Readme.io, Surge.sh,
Tumblr, Unbounce, Statuspage, Pantheon, Ghost, Helpjuice, Desk.com, Bitbucket, WordPress.com,
Cargo, Webflow.

### 5.2 `lib/takeover.ts` — karar ağacı

```ts
export interface TakeoverFinding {
  vulnerable: boolean;
  confidence: 'high' | 'medium' | 'low';
  service?: string;
  cname?: string;
  reason: 'dangling-cname' | 'fingerprint-match' | 'cname-match-no-fingerprint' | 'none';
  note?: string;
}

export async function checkTakeover(dns: DnsResult): Promise<TakeoverFinding>;
```

**Sıra önemlidir:**

| # | Koşul | Sonuç | HTTP? |
|---|---|---|---|
| 1 | CNAME yok | `vulnerable: false`, `reason: 'none'` | Hayır (ucuz çıkış — hostların çoğu burada durur) |
| 2 | `nxdomainAtEnd === true` | `vulnerable: true`, `confidence: 'high'`, `reason: 'dangling-cname'` | **Hayır** |
| 3 | `cnameTarget` bir parmak izi kalıbına uyuyor → `https://host` çek, gövdede `bodyFingerprints` ara → bulundu | `vulnerable: true`, `confidence: 'high'`, `reason: 'fingerprint-match'`, `service` dolu | Evet |
| 4 | Kalıp uydu ama gövde imzası yok | `vulnerable: false`, `confidence: 'low'`, `reason: 'cname-match-no-fingerprint'` | Evet |

> ### ⚠ Pazarlık konusu olmayan kural
> **Yalnız CNAME kalıbı eşleşmesiyle asla "vulnerable: true" denmeyecektir.**
> Bir subdomain'in S3'e işaret etmesi normaldir; zafiyet, bucket'ın *sahipsiz* olmasıdır.
> Takeover tarayıcılarını güvenilmez yapan tam olarak bu ayrımın atlanmasıdır.
> Yanlış pozitif, eksik bulgudan daha hızlı güven kaybettirir.

**HTTP çağrısı kuralları (adım 3-4):** `httpPool` üzerinden, 5 sn timeout,
`rejectUnauthorized: false`, **yalnız ilk 32 KB** okunur (gövde büyükse `destroy`).

### 5.3 `/api/scan` entegrasyonu

CNAME'i olan hostlar domain başına genelde birkaç tanedir; bu nedenle takeover kontrolü
`/api/scan?validate=1` bütçesine sığar:

```ts
const cnameHosts = results.filter(r => r.cname?.length);
const findings = await mapPool(cnameHosts, httpPool, r => checkTakeover(r));
```

`SubdomainData.takeover` alanı **opsiyoneldir**; CNAME'i olmayan kayıtlarda hiç bulunmaz.

### 5.4 `POST /api/takeover`

```
Body: { "hosts": ["a.example.com", ...] }    // max 25
-> { "results": Array<{ host: string; finding: TakeoverFinding }> }
```

Kullanım: Faz 5'teki ikinci doğrulama partisi (150 sonrası) ve kullanıcının "yeniden kontrol et"
eylemi.

## 6. Kabul kriterleri

- [ ] `npm test` → `takeover.test.ts` dört karar dalını da kapsıyor.
- [ ] CNAME'i olmayan host → `reason: 'none'`, **hiç HTTP isteği yapılmıyor**.
- [ ] Hedefi NXDOMAIN olan CNAME → `confidence: 'high'`, `reason: 'dangling-cname'`,
      **hiç HTTP isteği yapılmadan**.
- [ ] Bilinen bir servise işaret eden ama sahipli (çalışan) CNAME →
      `vulnerable: false`, `reason: 'cname-match-no-fingerprint'`, `confidence: 'low'`.
- [ ] **Yanlış pozitif testi:** iyi yönetilen 3 büyük domain taranıyor ve
      **sıfır** `confidence: 'high'` bulgu çıkıyor. (Çıkarsa, aksi kanıtlanana kadar **bug** sayılır.)
- [ ] `/api/scan` yanıtında CNAME'li kayıtlarda `takeover` alanı var, diğerlerinde yok.
- [ ] `POST /api/takeover` 25 host sınırını aşınca `400` dönüyor.
- [ ] Takeover kontrolü `/api/scan` süresini belirgin şekilde uzatmıyor (CNAME'li host sayısı az).

## 7. Doğrulama adımları

```bash
cd server && npm test
npm start &
sleep 3

# Karar ağacı — canlı
curl -s -X POST localhost:3001/api/takeover -H 'Content-Type: application/json' \
  -d '{"hosts":["www.example.com"]}' | python3 -m json.tool

# Tarama entegrasyonu
curl -s "localhost:3001/api/scan?domain=example.com&validate=1" | python3 -c "
import json,sys
d=json.load(sys.stdin)
t=[r for r in d['results'] if r.get('takeover')]
print('takeover alanı olan kayıt:', len(t))
for r in t[:5]:
    print(' ', r['subdomain'], r['takeover']['confidence'], r['takeover']['reason'])
hi=[r for r in t if r['takeover'].get('confidence')=='high' and r['takeover'].get('vulnerable')]
print('YÜKSEK GÜVEN BULGU:', len(hi))
"
```

**Pozitif kontrol (kontrolünüzdeki bir domain gerekir):**
1. Sahip olduğunuz bir domainde, sahiplenilmemiş bir `*.github.io` adresine CNAME açın.
2. `POST /api/takeover` → `confidence: 'high'` bekleyin.
3. **Testten sonra CNAME kaydını silin.**

**Negatif kontrol (yanlış pozitif avı):** İyi yönetilen 3 büyük domain tarayın.
Yüksek güvenli herhangi bir bulgu çıkarsa elle doğrulayın; gerçek değilse karar ağacı hatalıdır.

## 8. Devir kontratı

```ts
// server/lib/takeover.ts
export interface TakeoverFinding {
  vulnerable: boolean;
  confidence: 'high' | 'medium' | 'low';
  service?: string;
  cname?: string;
  reason: 'dangling-cname' | 'fingerprint-match' | 'cname-match-no-fingerprint' | 'none';
  note?: string;
}
export function checkTakeover(dns: DnsResult): Promise<TakeoverFinding>;
```

`SubdomainData` şu alanla genişler: `takeover?: TakeoverFinding`

**Endpoint:** `POST /api/takeover { hosts: string[] }` (max 25)

> **Faz 8 için:** UI yalnız `vulnerable === true && confidence === 'high'` olanları kırmızı
> banner sayımına katmalı; `low` güvenli bulgular amber rozet olarak gösterilmeli ve
> banner sayısına **dahil edilmemelidir.**

## 9. Riskler ve geri alma

| Risk | Belirti | Çözüm |
|---|---|---|
| **Yanlış pozitif** | Kullanıcı olmayan zafiyet için uğraşır, araca güveni biter | Güven kademelendirmesi + "kalıp tek başına yetmez" kuralı + negatif kontrol testi |
| Parmak izi tablosu eskir | Yeni servisler kaçırılır | `can-i-take-over-xyz` periyodik gözden geçirilmeli; tablo tek dosyada |
| HTTP kontrolü taramayı yavaşlattı | `/api/scan` uzuyor | Yalnız CNAME'li hostlar kontrol edilir; `httpPool` + 5 sn timeout |
| Büyük gövde belleği doldurdu | RSS artışı | 32 KB tavanı, sonra `destroy()` |
| Edge-case'ler `vulnerable` sayıldı | Yanlış pozitif dalgası | `status: 'edge-case'` olan parmak izleri **asla** `high` üretmemeli |

**Geri alma:** `takeover` alanı opsiyonel olduğu için `git revert` güvenlidir; eski önbelleklerde
alan yoksa UI zaten göstermez.
