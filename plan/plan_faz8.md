# Faz 8 — Frontend

> Ön okuma: `plan/anaplan.md` (özellikle **§6 Yol boyunca korunacak sözleşmeler**),
> `plan_faz3.md`, `plan_faz5.md`, `plan_faz6.md`.
> **Bu faz, Faz 3/4/5/6 kontratları donmadan başlamamalıdır.**

## 1. Amaç

Önceki yedi faz backend'de doğrulanmış veri ve yeni bulgular üretti. Bu faz onları kullanıcıya
gösterir ve iki yapısal borcu kapatır:

1. **Ateşle-unut istek fırlatma.** `handleAnalyzeSubdomain` (`src/App.tsx:243`) `await` edilmiyor;
   bu, backend havuzuyla (Faz 2) birlikte ikinci savunma katmanı olarak istemci kuyruğuna dönüşür.
2. **Dağılmış legacy-string korumaları.** Beş ayrı yerde tekrarlanan `typeof item === 'string'`
   kontrolü tek fonksiyonda toplanır — **davranış korunarak**.

Ayrıca **Supabase dikişi** burada atılır: sonraki adımda veritabanına geçiş, UI'ya dokunmadan
tek dosyalık değişiklik olacak şekilde hazırlanır.

## 2. Ön koşullar

- Faz 3 (`DnsResult`, `status`), Faz 4 (`sources[]`, `/api/sources`), Faz 5 (`ScanResponse`),
  Faz 6 (`TakeoverFinding`) kontratları donmuş olmalı.
- Faz 7 alanları opsiyonel olduğundan bu fazdan sonra da eklenebilir.

## 3. Kapsam

**Yapılacaklar**
- Hedefli komponent çıkarma (tam yeniden yazma **değil**).
- `lib/normalize.ts`: legacy-string ve şema uyumu tek noktada.
- `lib/storage.ts`: `UserStore` arayüzü — Supabase dikişi.
- `lib/scanRunner.ts`: istemci tarafı istek kuyruğu.
- `api.ts`: tipli sarmalayıcılar + 503 retry.
- Yeni UI yüzeyleri: takeover banner'ı, DNS durum göstergeleri, kaynak rozetleri, filtreler.
- Vitest kurulumu + `normalize` testleri.

**Bilinçli olarak yapılmayacaklar**
- **`App.tsx` tamamen yeniden yazılmayacak.** Auth ve `localStorage` effect'leri
  (`App.tsx:87-122`) en yüksek regresyon riskli bölgedir; yalnız gerekli olan çıkarılır.
- `index.css` bölünmeyecek — 1077 satırı parçalamak getirisi olmayan bir churn'dür.
  Yeni kurallar dosyanın sonuna `/* === v2 === */` işaretiyle eklenir.
- **Düz metin parola sorunu çözülmeyecek** — kapsam dışı; `UserStore` dikişi bunu Supabase
  adımında mümkün kılar.
- Supabase entegrasyonu **yapılmayacak**, yalnız hazırlığı yapılır.

## 4. Dosya manifestosu

**Oluşturulacak:**
```
src/types.ts                          # App.tsx:6-51'deki tüm arayüzler buraya
src/api.ts                            # API_BASE_URL + tipli çağrılar + 503 retry/backoff
src/lib/normalize.ts
src/lib/normalize.test.ts
src/lib/storage.ts                    # UserStore + LocalStorageStore
src/lib/scanRunner.ts
src/components/SubdomainRow.tsx       # App.tsx:624-742
src/components/AdvancedSummaryTable.tsx  # App.tsx:784-843
src/components/EmailSecurityBox.tsx   # App.tsx:758-776
src/components/TakeoverBanner.tsx     # YENİ
src/components/ScanOptionsBar.tsx     # YENİ
src/components/SourceBadges.tsx       # YENİ (App.tsx:619-622'nin yerine)
```

**Değiştirilecek:**
| Dosya | Değişiklik |
|---|---|
| `src/App.tsx` | ~876 → ~450 satır; kabuk + auth + state |
| `src/index.css` | Sona yeni kurallar |
| `package.json` | `vitest` devDependency + `"test": "vitest run"` |

## 5. Teknik detay

### 5.1 `lib/normalize.ts` — legacy uyumun tek noktası

Şu an beş ayrı yerde `typeof item === 'string'` kontrolü var:
`App.tsx:284, 309, 342, 612, 780`. Her yeni komponent altıncısını eklerdi.

```ts
export function normalizeSubdomain(item: SubdomainData | string): SubdomainData {
  if (typeof item === 'string') {
    return { subdomain: item, source: 'crt.sh', sources: ['crtsh'], status: 'unknown' };
  }
  return {
    ...item,
    sources: item.sources ?? (item.source ? item.source.split(' + ') : []),
    status: item.status ?? 'unknown',
  };
}

export function normalizeUserData(raw: unknown): UserData;   // schemaVersion 0 -> 2
```

**Sınırda bir kez çağrılır:** yüklemede (`App.tsx:94`) ve `/api/scan` yanıtı geldiğinde.
Alt akıştaki tüm kod artık yalnız normalize edilmiş nesne görür.

> ⚠ Bu, davranışı **korur**: düz string kayıtlar eskiden olduğu gibi crt.sh rozetiyle render edilir.
> `normalize.test.ts` bunun regresyonunu yakalayan ana testtir.

### 5.2 `lib/storage.ts` — Supabase dikişi

```ts
export interface UserStore {
  load(userId: string): Promise<UserData | null>;
  save(userId: string, data: UserData): Promise<void>;
  upsertDomain(userId: string, domain: string): Promise<void>;
  upsertScan(userId: string, domain: string, subs: SubdomainData[], meta: ScanMeta): Promise<void>;
  deleteDomain(userId: string, domain: string): Promise<void>;
}
```

İki tasarım kararı sonraki adımı tek dosyalık değişikliğe indirger:

1. **Metotlar şimdiden `async`** — `localStorage` senkron olsa bile. Böylece ağ çağrısına
   dönüştüklerinde çağrı noktaları değişmez.
2. **Varlık bazlı metotlar** (blob değil). `App.tsx:109-122`'deki "her state değişiminde tüm
   `osint_users` blob'unu yeniden yaz" effect'i, mutation noktalarındaki açık `store.upsertX()`
   çağrılarıyla değiştirilir.

> **Bu ikinci madde bu fazın en kritik ve en görünmez işidir.** Blob yazma deseni bir ağ
> deposuna karşı patolojiktir (her tuş vuruşunda tüm veriyi POST etmek gibi). Kullanıcıya
> hiçbir görünür etkisi yoktur ama Supabase geçişini mümkün kılan şey budur.

Hedef şema (şimdi **yapılmayacak**, yalnız buna doğru tasarlanacak):
`users`, `domains(user_id, domain)`, `scans(domain_id, scanned_at, wildcard, sources)`,
`subdomains(scan_id, subdomain, sources[], status, ips[], cname[], takeover jsonb)`,
`subdomain_details(subdomain_id, jsonb)`.

### 5.3 Veri şekilleri

```ts
export interface SubdomainData {
  subdomain: string;
  source: string;                    // KORUNUR — eski UI + eski önbellek
  sources?: string[];
  ip?: string;                       // KORUNUR
  ips?: string[];
  status?: 'live' | 'dead' | 'private' | 'unknown';
  cname?: string[];
  wildcardMatch?: boolean;
  takeover?: TakeoverFinding;
  discoveredBy?: 'passive' | 'brute' | 'permutation' | 'axfr' | 'cert-san';
}

export interface SubdomainDetail {   // mevcut alanların hepsi aynen
  ip: string | null; ports?: PortInfo[]; isCloudflare?: boolean; analyzing?: boolean;
  technologies?: TechInfo[]; techAnalyzing?: boolean;
  ssl?: SslInfo; security?: SecurityInfo; waf?: WafInfo; advancedAnalyzing?: boolean;
  cookies?: CookieFinding[];         // Faz 7
  cors?: CorsFinding;                // Faz 7
  blocked?: 'private-ip';            // Faz 2
}

export interface UserData {
  schemaVersion?: number;            // 2
  password: string;                  // değişmiyor (kapsam dışı)
  domains: string[];
  subdomainsCache: Record<string, SubdomainData[]>;
  subdomainDetailsCache: Record<string, SubdomainDetail>;
  emailSecCache: Record<string, EmailSecurityInfo>;
  scanMetaCache?: Record<string, ScanMeta>;
}
```

**Her yeni alan opsiyonel ve eklemeli → cache invalidation yok, eski önbellekler render olur.**

### 5.4 `lib/scanRunner.ts`

Ateşle-unut döngüsünün yerine istemci kuyruğu:
- En fazla **6 eşzamanlı** istek
- Her subdomain'in `analyze` + `tech` işi bitmeden slot serbest bırakılmaz
- `503` alınırsa 2 sn backoff ile **bir kez** yeniden dene (Faz 2'nin in-flight guard'ı)

`handleAnalyzeAll` ve `handleAdvancedAnalysis` bunun ince sarmalayıcılarına dönüşür.
**`analyzing` / `techAnalyzing` / `advancedAnalyzing` bayraklarının semantiği aynen korunur**,
böylece render kodu değişmez.

### 5.5 `api.ts` — Faz 5 kırıcı değişikliğinin koruması

```ts
const raw = await response.json();
const list: SubdomainData[] = Array.isArray(raw) ? raw : raw.results;
```

> Bu koruma, backend/frontend bağımsız deploy edildiği için **her iki yönde de** çalışır ve
> sürüm kayması penceresini zararsız kılar.

### 5.6 Yeni UI yüzeyleri (bilinçli olarak küçük tutulur)

| Yüzey | Konum | İçerik |
|---|---|---|
| `ScanOptionsBar` | Sonuç başlığı (`App.tsx:555` civarı) | Canlı/ölü/tümü filtre çipleri + sayılar, "Brute-force dene (opsiyonel)" onay kutusu, wildcard uyarı pill'i, `/api/sources`'tan beslenen "9/12 kaynak aktif" |
| `TakeoverBanner` | Sonuç kartının üstü | Kırmızı, **yalnız `vulnerable && confidence==='high'`** sayımı; satırlara kaydırma bağlantısı |
| Satır göstergeleri | `SubdomainRow` | DNS durum noktası (yeşil canlı / gri ölü / amber wildcard / mavi özel IP), `SourceBadges`, takeover pill'i |
| `AdvancedSummaryTable` | Mevcut tablo | Yeni `Cookie` ve `CORS` sütunları; TLS sütununda protokol + kırmızı "TLS 1.0" çipi |

> **Ölü hostlar %60 opaklıkla ve varsayılan filtrede gizli gösterilir.**
> "Bayat crt.sh gürültüsü" şikâyeti kullanıcı için asıl burada çözülür.
>
> Düşük güvenli takeover bulguları **amber** rozet alır ve **banner sayısına dahil edilmez.**

### 5.7 `handleGenerateScope` güncellemesi

`App.tsx:333`. **Mevcut prefix listesi ve "aktif web servisi" koşulu aynen korunur**;
filtreye yalnız **eklenir**:

```ts
status !== 'dead' && !wildcardMatch && blocked !== 'private-ip'
```

## 6. Kabul kriterleri

- [ ] `npm test` geçiyor; `normalize.test.ts` legacy-string davranışını doğruluyor.
- [ ] **Legacy önbellek testi:** devtools'ta elle
      `subdomainsCache: { "x.com": ["a.x.com","b.x.com"] }` (düz string dizisi) yazılıp sayfa
      yenilendiğinde satırlar crt.sh rozetiyle render oluyor, **çökme yok**.
- [ ] Eski `source` string'i (`'crt.sh + HackerTarget'`) olan önbellek doğru rozetleniyor.
- [ ] `App.tsx` 500 satırın altında.
- [ ] Ölü hostlar varsayılan filtrede gizli; filtre çipiyle gösterilebiliyor; sayılar doğru.
- [ ] Yüksek güvenli takeover bulgusu banner'da; düşük güvenli olan **banner sayısına dahil değil**.
- [ ] Brute-force **yalnız** onay kutusu işaretliyken tetikleniyor.
- [ ] Wildcard zone'da uyarı pill'i görünüyor ve brute-force kutusu devre dışı/uyarılı.
- [ ] Aynı anda en fazla 6 istek uçuyor (Network sekmesinde doğrulanmış).
- [ ] 503 yanıtı alındığında istek 2 sn sonra bir kez tekrar ediliyor.
- [ ] **Soğuk başlangıç:** backend 20 dk uyuduktan sonra `wakingUp` animasyonu hâlâ tetikleniyor
      (`App.tsx:214`'teki 3 sn zamanlayıcı `api.ts` çıkarımından sağ çıkmış) ve parçalı
      `/api/validate` çağrıları bunu **tekrar tekrar tetiklemiyor**.
- [ ] Kapsam üretimi (`handleGenerateScope`) ölü/wildcard/özel-IP kayıtları dışlıyor;
      mevcut prefix davranışı değişmemiş.
- [ ] `npm run build` hatasız.

## 7. Doğrulama adımları

```bash
# .env'deki VITE_API_URL'i yorum satırı yapın, sonra:
cd server && npm start &
npm run dev      # http://localhost:5173/subdomainfinder/

npm test         # normalize testleri
npm run build    # tip hataları
```

**Legacy önbellek regresyonu (en kritik test):** Tarayıcı devtools → Console:

```js
localStorage.setItem('osint_users', JSON.stringify({
  "demo@test.com": {
    password: "demo123456",
    domains: ["example.com"],
    subdomainsCache: { "example.com": ["www.example.com", "mail.example.com"] },  // DÜZ STRING
    subdomainDetailsCache: {},
    emailSecCache: {}
  }
}));
location.reload();
```
→ Giriş yapıldığında iki satır crt.sh rozetiyle görünmeli, konsolda hata olmamalı.

**Eşzamanlılık:** Network sekmesini açıp çok subdomain'li bir domain tarayın;
aynı anda 6'dan fazla `/api/analyze` isteği **olmamalı**.

**Soğuk başlangıç:** `.env`'i geri açıp (prod backend) 20 dk bekleyip tarama başlatın;
"Sunucu Uyanıyor" animasyonu görünmeli ve yalnız **bir kez** tetiklenmeli.

## 8. Devir kontratı

Bu son fazdır; devredilecek sonraki faz yoktur. **Supabase adımı için bırakılan arayüz:**

```ts
// src/lib/storage.ts
export interface UserStore { load; save; upsertDomain; upsertScan; deleteDomain }
export class LocalStorageStore implements UserStore { /* osint_users */ }
```

Supabase geçişinde yalnızca `SupabaseStore implements UserStore` yazılır ve `App.tsx`'teki tek
örnekleme satırı değiştirilir. **UI kodu değişmez.** Parola saklama sorunu da o adımda çözülür.

## 9. Riskler ve geri alma

| Risk | Belirti | Çözüm |
|---|---|---|
| **Legacy önbellek bozuldu** (en olası regresyon) | Mevcut kullanıcılar giriş sonrası boş liste veya beyaz ekran görür | `normalize.test.ts` + elle devtools testi; normalize sınırda **bir kez** çağrılmalı |
| Auth effect'leri çıkarma sırasında bozuldu | Giriş/kayıt çalışmıyor, oturum kayboluyor | `App.tsx:87-122` bölgesine dokunmayın; yalnız depolama çağrılarını `store`'a yönlendirin |
| `source` alanı düşürüldü | Eski önbelleklerde rozet kaybı | `source` **korunur**, `sources[]` eklenir |
| Soğuk başlangıç animasyonu kayboldu | Kullanıcı 40 sn boş ekrana bakar | `App.tsx:214` zamanlayıcısı `api.ts`'e taşınırken korunmalı |
| Parçalı `/api/validate` her seferinde "uyanıyor" gösteriyor | Rahatsız edici tekrar | Animasyon yalnız ilk istek için tetiklenmeli |
| `grade-D` / `grade-E` CSS sınıfları yok | Notlar renksiz görünür | `index.css`'te varlığını doğrulayın, yoksa ekleyin |
| İstemci kuyruğu bayrak semantiğini değiştirdi | Satırlar sonsuz "analiz ediliyor" kalır | `analyzing`/`techAnalyzing`/`advancedAnalyzing` davranışı birebir korunmalı |

**Geri alma:** Komponent çıkarma ve `normalize` birleştirmesi ayrı commit'ler hâlinde yapılırsa
tek tek geri alınabilir. Önbellek şeması eklemeli olduğu için geri alma veri kaybına yol açmaz.
