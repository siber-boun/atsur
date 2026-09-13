# Faz 5 — Tarama orkestrasyonu + brute-force

> Ön okuma: `plan/anaplan.md`, `plan/plan_faz3.md`, `plan/plan_faz4.md`.
> **Bu faz `/api/scan`'in yanıt şeklini değiştirir — projenin tek kırıcı değişikliği.**

## 1. Amaç

Faz 3 doğrulamayı, Faz 4 kaynakları getirdi. Bu faz ikisini tek bir tarama akışında birleştirir
ve isteğe bağlı brute-force ekler.

İki kısıt akışı belirliyor:
- **Render ücretsiz katmanı** uzun süren tek bir isteği kaldıramaz; iş parçalara bölünmeli.
- **Wildcard tespiti olmadan brute-force yapılamaz** — aksi hâlde binlerce sahte sonuç üretir.

## 2. Ön koşullar

- **Faz 3 ve Faz 4 tamamlanmış olmalı.**
- `detectWildcard`, `resolveMany`, `runSources` kullanılabilir durumda.

## 3. Kapsam

**Yapılacaklar**
- `/api/scan`'in kaynak + wildcard + kısmi doğrulamayı birleştirmesi.
- `POST /api/brute`: sözlük ve permütasyon tabanlı, wildcard'a bağlı, opsiyonel.
- `fingerprints/wordlist.ts` ve `fingerprints/permutations.ts`.
- `sources/axfr.ts` (opsiyonel, varsayılan kapalı).

**Bilinçli olarak yapılmayacaklar**
- **SSE / streaming eklenmeyecek.** Gerekçe §5.1'de.
- Brute-force **port taraması yapmayacak** — yalnız DNS.
- Brute-force **asla otomatik çalışmayacak**; kullanıcı açıkça istemeli (UI'daki onay kutusu Faz 8).
- Frontend değişikliği yok (Faz 8) — ancak `Array.isArray` koruması §5.3'te açıklandığı gibi
  Faz 8'de veya daha önce gitmelidir.

## 4. Dosya manifestosu

**Oluşturulacak:**
```
server/routes/brute.ts
server/fingerprints/wordlist.ts
server/fingerprints/permutations.ts
server/sources/axfr.ts            # opsiyonel
```

**Değiştirilecek:**
| Dosya | Değişiklik |
|---|---|
| `server/routes/scan.ts` | Yanıt şekli + `validate=1` desteği |
| `server/types.ts` | `ScanResponse`, `SubdomainData` genişlemesi |
| `server/index.ts` | `brute` route kaydı |
| `server/config.ts` | Brute-force sınırları |

## 5. Teknik detay

### 5.1 Neden SSE değil, parçalı istek

Değerlendirildi ve **reddedildi**. Gerekçeler bu kod tabanına özgüdür:

1. `src/App.tsx`'te abort/cleanup altyapısı yok. Domain başına bir `EventSource` yaşam döngüsü
   yönetimi gerektirir; 876 satırlık tek komponentte bu yanlış yapılır.
2. Render ücretsiz katmanı uzun ömürlü bağlantıları düşürür.
3. Mevcut soğuk başlangıç UX'i (`wakingUp`, `App.tsx:213-216`) ayrık `fetch` çağrıları üzerine kurulu.
4. Frontend zaten progressive dolduruyor; parçalı istek neredeyse sıfır maliyetle uyuyor.

> SSE, **Supabase adımında** taramalar sunucuda kalıcı hâle gelince doğru seçim olacaktır.

### 5.2 `/api/scan` akışı

```
GET /api/scan?domain=example.com&validate=1
```

1. `runSources(domain)` → tüm kaynaklar, `sourcePool` ile
2. Sonuçları tek Map'te birleştir (`source` + `sources[]`)
3. `detectWildcard(domain)`
4. `validate=1` ise: **ilk 150** adayı `resolveMany` ile doğrula
5. Kalan adaylar `status: 'unknown'` olarak döner; frontend `POST /api/validate` ile 100'lük
   parçalar hâlinde tamamlar

### 5.3 ⚠ Kırıcı değişiklik — yanıt artık dizi değil nesne

```ts
// ÖNCE:  SubdomainData[]
// SONRA:
export interface ScanResponse {
  domain: string;
  wildcard: WildcardInfo;
  sources: SourceStatus[];
  results: SubdomainData[];      // sıralama korunur: subdomain.localeCompare
  truncatedValidation: boolean;  // 150 sınırına takıldıysa true
}
```

`src/App.tsx:225` şu an `const data: SubdomainData[] = await response.json()` yapıyor.
**İki satırlık koruma gereklidir:**

```ts
const raw = await response.json();
const list: SubdomainData[] = Array.isArray(raw) ? raw : raw.results;
```

> **Deploy sırası kritik:** Backend ve frontend bağımsız deploy edilir (Render vs GitHub Pages).
> Bu koruma, backend değişikliğiyle **aynı sürümde ya da ondan önce** frontend'e girmelidir.
> Aksi hâlde canlıda "sonuç yok" görünen bir pencere oluşur.

### 5.4 `POST /api/brute`

```
POST /api/brute
Body: { "domain": "example.com", "mode": "wordlist" | "permutation" | "both", "seeds"?: string[] }
```

**Wildcard kapısı — zorunlu:**

```ts
const wc = await detectWildcard(domain);
if (wc.isWildcard && wc.confidence === 'high') {
  return res.json({ skipped: 'wildcard', wildcard: wc, results: [] });
}
```

**Sözlük** (`fingerprints/wordlist.ts`): ~400-600 küratörlü etiket, **inline TypeScript dizisi**
olarak. Dosyadan okumayın — Render dosya sistemi geçicidir ve ek bir deploy hata kaynağıdır.

Örnek kategoriler: `admin, api, dev, staging, test, uat, beta, vpn, mail, webmail, git, gitlab,
jenkins, grafana, kibana, prometheus, s3, cdn, static, assets, portal, sso, auth, login, internal,
intranet, jira, confluence, docs, status, monitor, backup, db, redis, proxy, gateway, m, mobile`

**Permütasyon** (`fingerprints/permutations.ts`): canlı seed'lerin ilk ~30'u için
`dev-{x}`, `{x}-dev`, `staging-{x}`, `{x}-test`, `{x}2`, `{x}-old`, `{x}-new`.

**Sınırlar:**
| Sınır | Değer | Gerekçe |
|---|---|---|
| Toplam aday tavanı | 2000 | Aşılırsa **açık hata** döner, sessizce kırpılmaz |
| Eşzamanlılık | `dnsPool` (40) | Faz 2 bütçesi |
| DNS timeout | 3 sn | 600 etiket ≈ 5-8 sn |

**Brute-force yalnız DNS çözümlemesi yapar.** Port taraması, kullanıcının açıkça tetiklediği
`/api/analyze` yolunda kalır.

### 5.5 `sources/axfr.ts` (opsiyonel)

`resolveNs(domain)` → her NS için port 53'e ham TCP DNS sorgusu (uzunluk önekli mesaj, QTYPE 252).
Node'da AXFR primitifi yoktur; el yazımı ~120 satır gerekir.

- En fazla 4 NS × 5 sn
- `?axfr=1` ile açılır, **varsayılan kapalı**

> **Bu maddenin değer/emek oranı en düşüktür** (yaklaşık 500 zone'da 1 isabet).
> Takvim sıkışırsa **ilk kesilecek iş budur.**

## 6. Kabul kriterleri

- [ ] `/api/scan?domain=X&validate=1` → `ScanResponse` nesnesi; `results[]` içindeki ilk 150 kaydın
      `status` alanı dolu, kalanlar `'unknown'`.
- [ ] 150'den fazla aday olduğunda `truncatedValidation: true`.
- [ ] `/api/scan?domain=X` (validate'siz) doğrulama yapmadan hızlıca dönüyor.
- [ ] `sources[]` alanı `SourceStatus[]` içeriyor.
- [ ] `results[]` sıralaması eskisiyle aynı (`localeCompare`).
- [ ] **Wildcard zone'da `POST /api/brute` → `{ skipped: 'wildcard' }` ve hiç DNS sorgusu yapmıyor.**
- [ ] Wildcard olmayan zone'da brute-force çalışıyor ve yalnız `status: 'live'` kayıtlar döndürüyor.
- [ ] 2000 aday tavanı aşıldığında açık hata dönüyor (sessiz kırpma yok).
- [ ] Brute-force sırasında **hiçbir port taraması yapılmıyor** (ağ izleme ile doğrulanmış).
- [ ] Brute-force `/api/brute` çağrılmadan **asla** tetiklenmiyor.
- [ ] `Array.isArray` koruması frontend'e girmiş (veya Faz 8 ile aynı sürümde gidecek şekilde
      planlanmış ve PR'da not edilmiş).

## 7. Doğrulama adımları

```bash
cd server && npm start &
sleep 3

# Yeni yanıt şekli
curl -s "localhost:3001/api/scan?domain=example.com&validate=1" \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('anahtarlar:', list(d.keys()))
print('kaynak sayısı:', len(d['sources']))
print('sonuç:', len(d['results']))
print('wildcard:', d['wildcard']['isWildcard'])
print('truncated:', d['truncatedValidation'])
st={}
for r in d['results']: st[r.get('status','yok')] = st.get(r.get('status','yok'),0)+1
print('durum dağılımı:', st)
"

# Wildcard kapısı
curl -s -X POST localhost:3001/api/brute -H 'Content-Type: application/json' \
  -d '{"domain":"<wildcard-zone>","mode":"wordlist"}' | python3 -m json.tool
#   -> {"skipped": "wildcard", ...}

# Normal brute-force
time curl -s -X POST localhost:3001/api/brute -H 'Content-Type: application/json' \
  -d '{"domain":"example.com","mode":"both"}' | python3 -m json.tool | head -30

# Aday tavanı
curl -s -X POST localhost:3001/api/brute -H 'Content-Type: application/json' \
  -d '{"domain":"example.com","mode":"permutation","seeds":[<3000 seed>]}' 
#   -> açık hata, sessiz kırpma değil
```

**Port taraması yapılmadığının kanıtı:** brute-force sürerken
`lsof -i -p $(pgrep -f "tsx index.ts") | grep -c ESTABLISHED` ile TCP bağlantılarını izleyin;
yalnız DNS (53/udp) trafiği olmalı, 80/443 vb. bağlantı denemesi olmamalı.

## 8. Devir kontratı

```ts
export interface ScanResponse {
  domain: string;
  wildcard: WildcardInfo;
  sources: SourceStatus[];
  results: SubdomainData[];
  truncatedValidation: boolean;
}

export interface SubdomainData {
  subdomain: string;
  source: string;              // 'A + B'  KORUNUR
  sources?: string[];
  ip?: string;
  ips?: string[];
  status?: 'live' | 'dead' | 'private' | 'unknown';
  cname?: string[];
  wildcardMatch?: boolean;
  discoveredBy?: 'passive' | 'brute' | 'permutation' | 'axfr' | 'cert-san';
}
```

**Endpoint'ler:** `GET /api/scan?domain=&validate=1`, `POST /api/brute {domain, mode, seeds?}`

> Faz 8 bu şekle göre yazılacaktır. `takeover?` alanı Faz 6'da bu tipe eklenir.

## 9. Riskler ve geri alma

| Risk | Belirti | Çözüm |
|---|---|---|
| **Deploy sırası hatası** | Canlıda "sonuç yok" — eski frontend yeni nesne yanıtını dizi sanıyor | `Array.isArray` koruması backend'den **önce veya aynı anda** deploy edilmeli |
| Wildcard kapısı atlandı | Binlerce sahte "canlı" subdomain | Kapı `/api/brute`'un ilk satırı olmalı; kabul kriterinde test var |
| Brute-force Render'ı boğdu | Dyno yavaşlar/düşer | `dnsPool` 40, aday tavanı 2000, 3 sn timeout |
| Sözlük dosyadan okundu | Deploy'da `ENOENT` | **Inline TS dizisi** — dosya I/O yok |
| 150 sınırı kullanıcıyı şaşırttı | "Neden bazıları doğrulanmamış?" | `truncatedValidation` alanı UI'da açıklanmalı (Faz 8) |
| AXFR zaman kuyusu | Faz gecikir | Varsayılan kapalı; takvim sıkışırsa tamamen çıkar |

**Geri alma:** `/api/scan` yanıt şekli kırıcı olduğu için geri alma **frontend ile koordineli**
yapılmalıdır. `Array.isArray` koruması her iki yönde de çalıştığı için, koruma girdikten sonra
backend'i geri almak güvenlidir.
