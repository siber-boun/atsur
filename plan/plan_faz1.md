# Faz 1 — Backend modülerleştirme (saf taşıma)

> Ön okuma: `plan/anaplan.md`, `plan/plan_faz0.md`.
> **Bu fazda hiçbir davranış değişmez.** Endpoint'lerin JSON çıktıları birebir aynı kalır.

## 1. Amaç

`server/index.ts` şu an 473 satır ve sonraki fazlarda ~5 katına çıkacak (10+ kaynak modülü,
DNS doğrulama, takeover mantığı, havuzlar). Tek dosyada büyümeye devam ederse hem inceleme
hem de paralel çalışma imkânsız hâle gelir.

Bu faz kodu modüler bir yapıya böler ama **tek satır iş mantığı değiştirmez**. Fonksiyonlar
bayt bayt taşınır. Böylece sonraki fazların diff'leri gerçekten değişen şeyi gösterir.

## 2. Ön koşullar

- **Faz 0 tamamlanmış olmalı** (yollar `server/index.ts` biçiminde).
- Backend lokalde çalışır durumda (`cd server && npm start` → `/health` 200).

## 3. Kapsam

**Yapılacaklar**
- `server/index.ts`'in klasör yapısına bölünmesi.
- `server/tsconfig.json` eklenmesi.
- Dört yerde tekrarlanan dinamik `node-fetch` import'unun tek bir `lib/http.ts`'e indirgenmesi.

**Bilinçli olarak yapılmayacaklar**
- **Hiçbir davranış değişikliği.** Bug düzeltmesi bile yapılmayacak — `index.ts:83`'teki hatalı
  `endsWith` filtresi *biliniyor* ama bu fazda **düzeltilmeyecek** (Faz 4'e ait).
- Yeni endpoint eklenmeyecek.
- Havuz / SSRF eklenmeyecek (Faz 2).
- Tip iyileştirmesi, `any` temizliği yapılmayacak — taşıma saf kalmalı.

## 4. Dosya manifestosu

**Oluşturulacak:**
```
server/tsconfig.json
server/config.ts
server/types.ts
server/lib/validate.ts        # isValidDomain (index.ts:118-121)
server/lib/net.ts             # checkPort (22-42), checkHttp (45-68)
server/lib/http.ts            # tek node-fetch sarmalayıcı
server/fingerprints/tech.ts   # TECH_SIGNATURES (248-282)
server/fingerprints/waf.ts    # /api/advanced içindeki WAF kuralları
server/sources/crtsh.ts       # fetchCrtSh (70-91)
server/sources/hackertarget.ts# fetchHackerTarget (94-115)
server/routes/scan.ts         # /api/scan (124-157)
server/routes/crt.ts          # /api/crt (161-182)
server/routes/analyze.ts      # /api/analyze (184-246)
server/routes/tech.ts         # /api/tech (284-324)
server/routes/advanced.ts     # /api/advanced (331-408)
server/routes/emailsec.ts     # /api/email-sec (410-473)
server/routes/health.ts       # /health (326-329)
```

**Değiştirilecek:**
- `server/index.ts` → yalnızca express kurulumu + route kaydı (~80 satır).
- `server/package.json` → `"test": "node --test"` script'i (Faz 2'de kullanılacak).

> Faz 2-7'de eklenecek `lib/pool.ts`, `lib/dns.ts`, `lib/ssrf.ts`, `lib/tls.ts`, `lib/wildcard.ts`,
> `lib/takeover.ts`, `lib/spf.ts`, `lib/dmarc.ts`, `sources/*` ve `fingerprints/takeover.ts`
> **bu fazda oluşturulmaz.** Klasörler ilgili fazda doğar.

## 5. Teknik detay

### 5.1 `server/tsconfig.json`

`server/` paketi `"type": "commonjs"` ve `tsx` ile çalışıyor; şu an `tsconfig.json`'ı yok.
Editörün ve ileride eklenecek `tsc --noEmit` kontrolünün aynı kuralları görmesi için eklenmeli:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2022",
    "lib": ["es2022"],
    "moduleResolution": "node",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["**/*.ts"]
}
```

### 5.2 Import biçimi

`tsx`, uzantısız relative import'ları çözer. **`.js` soneki eklemeyin:**

```ts
import { isValidDomain } from './lib/validate';    // doğru
import { isValidDomain } from './lib/validate.js'; // yanlış
```

### 5.3 `lib/http.ts` — tek `node-fetch` sarmalayıcı

Mevcut kodda `const fetch = (await import('node-fetch')).default;` satırı **dört ayrı yerde**
tekrarlanıyor (`fetchCrtSh`, `fetchHackerTarget`, `/api/crt`, `/api/tech`). Tek yerde toplanmalı:

```ts
// server/lib/http.ts
export async function getFetch() {
  return (await import('node-fetch')).default;
}
export async function fetchText(url: string, init?: any): Promise<string> { /* ... */ }
export async function fetchJson<T = any>(url: string, init?: any): Promise<T> { /* ... */ }
```

> Bu, davranış değişikliği değil tekilleştirmedir; aynı `node-fetch` çağrısı yapılır.
> Faz 4'te buraya timeout/AbortSignal desteği eklenecek.

### 5.4 `server/index.ts` sonrası hâli

```ts
import express from 'express';
import cors from 'cors';
import { PORT } from './config';
import scanRoute from './routes/scan';
import crtRoute from './routes/crt';
// ... diğer route'lar

const app = express();
app.use(cors());
app.use(express.json());

app.use(scanRoute);
app.use(crtRoute);
// ...

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
```

Route dosyaları `express.Router()` döndürür; yol tanımları route dosyasında kalır
(`router.get('/api/scan', ...)`) ki endpoint yolları tek bakışta görülebilsin.

### 5.5 `server/config.ts`

Şimdilik sadece mevcut sabitler; Faz 2'de havuz bütçeleri, Faz 4'te API anahtarları eklenecek.

```ts
export const PORT = process.env.PORT || 3001;
export const HTTP_HTTPS_PORTS = [
  80, 8080, 8000, 8008, 8888, 8081, 8082, 8083, 8084, 8090,
  443, 8443, 8444, 9443, 4443,
  3000, 3001, 4000, 5000, 9000, 9090, 9200, 7080, 7443
];
export const HTTPS_PORTS = [443, 8443, 8444, 9443, 4443, 7443];
```

> `HTTPS_PORTS` şu an `analyze` içinde inline dizi olarak duruyor (`index.ts:211`);
> taşınırken aynı değerlerle sabitlenir.

## 6. Kabul kriterleri

- [ ] `server/index.ts` 100 satırın altında ve yalnızca kurulum + route kaydı içeriyor.
- [ ] Yukarıdaki manifestodaki tüm dosyalar oluşturulmuş.
- [ ] `cd server && npx tsc --noEmit` hatasız geçiyor.
- [ ] `npm start` çalışıyor, tüm endpoint'ler yanıt veriyor.
- [ ] **Regresyon kanıtı:** Taşıma öncesi ve sonrası altı endpoint'in çıktısı, anahtar sırası
      dışında birebir aynı (aşağıdaki diff prosedürü ile kanıtlanmış ve PR'a eklenmiş).
- [ ] `grep -rn "await import('node-fetch')" server/ | wc -l` → **1** (yalnız `lib/http.ts`).
- [ ] Bilinen hatalar (`endsWith` bug'ı vb.) **düzeltilmemiş** — bu faz saf taşıma.

## 7. Doğrulama adımları

**Regresyon diff'i — bu fazın en önemli doğrulaması.**

```bash
# --- TAŞIMADAN ÖNCE (mevcut main üzerinde) ---
cd server && npm start &
sleep 5
D=example.com; S=www.example.com
mkdir -p /tmp/before
curl -s "http://localhost:3001/api/scan?domain=$D"        | python3 -m json.tool --sort-keys > /tmp/before/scan.json
curl -s "http://localhost:3001/api/crt?q=$D"              | python3 -m json.tool --sort-keys > /tmp/before/crt.json
curl -s "http://localhost:3001/api/analyze?domain=$S"     | python3 -m json.tool --sort-keys > /tmp/before/analyze.json
curl -s "http://localhost:3001/api/tech?subdomain=$S"     | python3 -m json.tool --sort-keys > /tmp/before/tech.json
curl -s "http://localhost:3001/api/advanced?subdomain=$S" | python3 -m json.tool --sort-keys > /tmp/before/advanced.json
curl -s "http://localhost:3001/api/email-sec?domain=$D"   | python3 -m json.tool --sort-keys > /tmp/before/emailsec.json
kill %1

# --- TAŞIMADAN SONRA --- (aynı komutlar, /tmp/after dizinine)
# --- KARŞILAŞTIRMA ---
diff -r /tmp/before /tmp/after && echo "REGRESYON YOK"
```

> **Not:** `/api/analyze` ve `/api/advanced` çıktıları ağ koşullarına göre değişebilir
> (port durumları, TLS gün sayısı). Bu alanlarda fark çıkarsa, farkın *ağ kaynaklı* olduğunu
> aynı komutu iki kez çalıştırıp karşılaştırarak doğrulayın. `scan`, `crt`, `tech` ve
> `email-sec` çıktıları deterministik olmalıdır.

## 8. Devir kontratı

Faz 2 ve sonrası şunları sabit kabul eder:

```ts
// server/lib/validate.ts
export function isValidDomain(domain: string): boolean;

// server/lib/net.ts
export function checkPort(port: number, host: string): Promise<boolean>;
export function checkHttp(protocol: string, host: string, port: number):
  Promise<{ status: number | string; isCloudflare: boolean; protocolUsed: string }>;

// server/lib/http.ts
export function getFetch(): Promise<typeof import('node-fetch').default>;
export function fetchJson<T>(url: string, init?: any): Promise<T>;
export function fetchText(url: string, init?: any): Promise<string>;

// server/config.ts
export const PORT: string | number;
export const HTTP_HTTPS_PORTS: number[];
export const HTTPS_PORTS: number[];
```

**Tüm endpoint yolları ve JSON yanıt şekilleri Faz 1 sonunda değişmemiştir.**

> ⚠ Faz 2, `checkPort`'un imzasını **değiştirecek** (hostname yerine çözümlenmiş IP alacak).
> Bu, Faz 2'nin devir kontratında belirtilmiştir; Faz 1 mevcut imzayı korur.

## 9. Riskler ve geri alma

| Risk | Belirti | Çözüm |
|---|---|---|
| Taşıma sırasında farkında olmadan davranış değişti | Regresyon diff'i fark gösterir | Diff'i satır satır incele; ağ kaynaklı değilse taşımayı düzelt |
| Dairesel import | `undefined is not a function` benzeri çalışma zamanı hatası | `config.ts` ve `types.ts` hiçbir şey import etmemeli; `lib/*` yalnız `config`/`types` import etmeli; `routes/*` her şeyi import edebilir |
| `tsx` import çözümleme hatası | `Cannot find module './lib/validate'` | Uzantı **eklemeyin**; `tsconfig.json`'da `moduleResolution: "node"` olduğunu doğrulayın |
| Route kaydı unutuldu | Endpoint 404 döner | Kabul kriterindeki altı endpoint çağrısı bunu yakalar |

**Geri alma:** Saf taşıma olduğu için `git revert` güvenlidir; hiçbir veri/şema değişmez.
