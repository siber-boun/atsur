# Faz 3 — DNS doğrulama + wildcard tespiti

> Ön okuma: `plan/anaplan.md`, `plan/plan_faz2.md`.
> **Bu faz projenin asıl doğruluk kazancıdır** ve Faz 4, 5, 6'nın tamamı buna dayanır.

## 1. Amaç

Bugün crt.sh'den gelen kayıtlar hiçbir DNS doğrulamasından geçmiyor. Sertifika şeffaflık logları
kalıcıdır: yıllar önce kapatılmış bir subdomain için 2019'da kesilmiş bir sertifika hâlâ logdadır.
Sonuç, kullanıcıya sunulan listenin büyük bölümünün **artık var olmayan hostlar** olmasıdır.

Bu faz iki şey ekler:

1. **Doğrulama katmanı:** her adayı çözümleyip *canlı / ölü / özel / hata* olarak sınıflandırma.
   Ölü kayıtlar Faz 8'de varsayılan olarak gizlenecek — "bayat crt.sh gürültüsü" şikâyeti
   asıl burada çözülür.
2. **Wildcard tespiti:** `*.hedef.com` kaydı olan zone'larda her rastgele isim çözümlenir.
   Bu tespit edilmeden eklenen her yeni kaynak ve özellikle brute-force (Faz 5) çöp üretir.

Ayrıca CNAME zinciri burada yakalanır; **Faz 6'daki takeover tespiti tamamen buna dayanır.**

## 2. Ön koşullar

- **Faz 2 tamamlanmış olmalı.** `dnsPool` ve `lib/ssrf.ts` mevcut olmalı.
- `lib/pool.ts` içindeki `mapPool` kullanılabilir durumda.

## 3. Kapsam

**Yapılacaklar**
- `lib/dns.ts`: çözümleme, sınıflandırma, CNAME zinciri, in-process önbellek.
- `lib/wildcard.ts`: wildcard tespiti ve aday eşleştirme.
- `POST /api/validate` ve `GET /api/wildcard` endpoint'leri.

**Bilinçli olarak yapılmayacaklar**
- Yeni kaynak eklenmeyecek (Faz 4).
- Brute-force yapılmayacak (Faz 5).
- Takeover kararı verilmeyecek (Faz 6) — bu faz yalnız **veriyi** (CNAME zinciri, `nxdomainAtEnd`)
  üretir, yorumlamaz.
- `/api/scan`'in yanıt şekli **bu fazda değişmez** (Faz 5'e ait).
- Frontend'e dokunulmayacak (Faz 8).

## 4. Dosya manifestosu

**Oluşturulacak:**
```
server/lib/dns.ts
server/lib/wildcard.ts
server/routes/validate.ts      # POST /api/validate
server/routes/wildcard.ts      # GET  /api/wildcard
```

**Değiştirilecek:**
| Dosya | Değişiklik |
|---|---|
| `server/index.ts` | İki yeni route kaydı |
| `server/types.ts` | `DnsResult`, `WildcardInfo` tipleri |
| `server/config.ts` | Resolver listesi, DNS timeout, önbellek TTL |

## 5. Teknik detay

### 5.1 `lib/dns.ts`

```ts
export type DnsStatus = 'live' | 'dead' | 'private' | 'error';

export interface DnsResult {
  host: string;
  status: DnsStatus;
  a: string[];              // çözümlenen IPv4 adresleri
  cname: string[];          // tam zincir, sırayla
  cnameTarget?: string;     // zincirin son halkası — Faz 6 buna bakar
  nxdomainAtEnd?: boolean;  // CNAME var ama son hedef NXDOMAIN -> dangling
  wildcardMatch?: boolean;
}

export async function resolveHost(host: string): Promise<DnsResult>;
export async function resolveMany(hosts: string[]): Promise<DnsResult[]>;  // dnsPool kullanır
```

**Kritik kararlar:**

| Karar | Gerekçe |
|---|---|
| `dns.promises.Resolver` ile **açık resolver'lar** (`1.1.1.1`, `8.8.8.8`) | Render konteynerinin kendi resolver'ı farklı sonuç verir; "lokalde çalışıyor, prod'da yanlış" hatalarının bir numaralı kaynağıdır |
| `NXDOMAIN` / `ENOTFOUND` → `dead` | Kesin bilgi: kayıt yok |
| `SERVFAIL` / `ETIMEOUT` / `ESERVFAIL` → `error` | **Timeout asla `dead` sayılmaz.** Aksi hâlde ağ dalgalanması gerçek hostları listeden siler |
| Tüm IP'ler özelse → `private` | `lib/ssrf.ts` ile |
| CNAME zinciri **max derinlik 10** | Döngü koruması |

**CNAME zinciri:** `resolveCname` ile zincir iteratif izlenir. Son hedefin `resolve4`'ü
NXDOMAIN dönerse `nxdomainAtEnd = true`. **Bu, Faz 6'nın en yüksek değerli sinyalidir**
(dangling CNAME → takeover adayı) ve hiç HTTP isteği gerektirmez.

**Önbellek:** In-process `Map`, 5 dk TTL, ~5000 giriş tavanı (LRU veya basit FIFO tahliye).
Render'ın belleği sınırlı; sınırsız `Map` bellek sızıntısıdır. Süreç yeniden başlayınca önbellek
kaybolur — bu kabul edilebilir, kalıcılık bu turda kapsam dışı.

### 5.2 `lib/wildcard.ts`

```ts
export interface WildcardInfo {
  isWildcard: boolean;
  wildcardIps: string[];
  wildcardCname?: string;
  confidence: 'high' | 'low';
}

export async function detectWildcard(domain: string): Promise<WildcardInfo>;
export function matchesWildcard(result: DnsResult, info: WildcardInfo): boolean;
```

**Algoritma:**
1. 3 adet rastgele 12 karakterlik etiket üret: `<rastgele>.<domain>`.
2. Hepsini çözümle.
3. ≥2'si çözümleniyorsa `isWildcard = true`, `confidence = 'high'`; yalnız 1'i çözümleniyorsa
   `confidence = 'low'` (geçici DNS tuhaflığı olabilir).
4. Çözümlenen IP'lerin birleşimi `wildcardIps`.

**Aday eşleştirme:** Bir adayın A kaydı kümesi `wildcardIps`'in alt kümesiyse **ve** ayırt edici
bir CNAME'i yoksa → `wildcardMatch = true`.

> ⚠ **Wildcard eşleşen adaylar SİLİNMEZ, gruplanır.** Aynı load balancer arkasındaki gerçek
> hostlar da aynı IP'yi döndürebilir; silmek gerçek bulguyu kaybettirir. Faz 8'de katlanmış
> (collapsed) bir grup olarak gösterilecek.

### 5.3 Endpoint'ler

```
GET  /api/wildcard?domain=example.com
     -> WildcardInfo

POST /api/validate
     Body: { "domain": "example.com", "hosts": ["a.example.com", "b.example.com"] }
     -> { "wildcard": WildcardInfo, "results": DnsResult[] }
```

**Sınırlar:**
- `hosts` en fazla **150** eleman; aşılırsa `400` ve açık hata mesajı (sessizce kırpma yok).
- `domain` `isValidDomain`'den geçmeli; her `host` `domain`'in altında olmalı
  (`=== domain || endsWith('.' + domain)`) — aksi hâlde bu endpoint keyfi host çözümleme
  aracına dönüşür.
- 150 host × `dnsPool` 40 ≈ 2-4 sn; Render zaman aşımlarının çok altında.

`express.json()` zaten mount edilmiş (`index.ts:14`), `cors()` açık — POST için ek kurulum gerekmez.

## 6. Kabul kriterleri

- [ ] `GET /api/wildcard?domain=<bilinen-wildcard-zone>` → `isWildcard: true`, `confidence: 'high'`.
- [ ] `GET /api/wildcard?domain=<wildcard-olmayan>` → `isWildcard: false`.
- [ ] `POST /api/validate` 150 host ile **5 saniyenin altında** yanıtlıyor.
- [ ] 151 host gönderildiğinde `400` dönüyor (sessizce kırpmıyor).
- [ ] `domain` altında olmayan bir host gönderildiğinde reddediliyor.
- [ ] Var olmayan bir hostname → `status: 'dead'`.
- [ ] DNS timeout senaryosunda → `status: 'error'` (**`dead` değil**).
- [ ] `127.0.0.1`'e çözümlenen host → `status: 'private'`.
- [ ] CNAME'i olan bir host için `cname[]` dolu ve `cnameTarget` zincirin sonu.
- [ ] Hedefi silinmiş bir CNAME için `nxdomainAtEnd: true`.
- [ ] Aynı host art arda iki kez sorgulandığında ikincisi önbellekten (belirgin şekilde hızlı).
- [ ] Bilinen bayat kayıtları olan bir domain için ölü sayısı > 0 ve `dig` ile örneklem doğrulandı.

## 7. Doğrulama adımları

```bash
cd server && npm start &
sleep 3

# --- Wildcard ---
curl -s "localhost:3001/api/wildcard?domain=example.com" | python3 -m json.tool

# --- Doğrulama ---
curl -s -X POST localhost:3001/api/validate \
  -H 'Content-Type: application/json' \
  -d '{"domain":"example.com","hosts":["www.example.com","kesinlikle-yok-12345.example.com"]}' \
  | python3 -m json.tool
#   www -> "status": "live"
#   kesinlikle-yok-12345 -> "status": "dead"

# --- Sınır kontrolleri ---
python3 -c "
import json
print(json.dumps({'domain':'example.com','hosts':['h%d.example.com'%i for i in range(151)]}))
" > /tmp/too_many.json
curl -s -o /dev/null -w "151 host: %{http_code}\n" -X POST localhost:3001/api/validate \
  -H 'Content-Type: application/json' -d @/tmp/too_many.json     # 400 bekleniyor

curl -s -X POST localhost:3001/api/validate -H 'Content-Type: application/json' \
  -d '{"domain":"example.com","hosts":["evil.attacker.com"]}'     # reddedilmeli

# --- Süre ölçümü (150 host) ---
python3 -c "
import json
print(json.dumps({'domain':'example.com','hosts':['h%d.example.com'%i for i in range(150)]}))
" > /tmp/h150.json
curl -s -o /dev/null -w "150 host: %{time_total}s\n" -X POST localhost:3001/api/validate \
  -H 'Content-Type: application/json' -d @/tmp/h150.json          # < 5s

# --- Önbellek ---
time curl -s -X POST localhost:3001/api/validate -H 'Content-Type: application/json' \
  -d '{"domain":"example.com","hosts":["www.example.com"]}' > /dev/null
time curl -s -X POST localhost:3001/api/validate -H 'Content-Type: application/json' \
  -d '{"domain":"example.com","hosts":["www.example.com"]}' > /dev/null   # belirgin hızlı
```

**Ölü kayıt örneklemi:** `status: 'dead'` dönen 5 hostu elle doğrulayın:
```bash
dig +short <host>    # boş çıktı = gerçekten yok
```

## 8. Devir kontratı

Faz 4, 5, 6 ve 8 şunlara güvenir:

```ts
// server/lib/dns.ts
export type DnsStatus = 'live' | 'dead' | 'private' | 'error';
export interface DnsResult {
  host: string; status: DnsStatus; a: string[]; cname: string[];
  cnameTarget?: string; nxdomainAtEnd?: boolean; wildcardMatch?: boolean;
}
export function resolveHost(host: string): Promise<DnsResult>;
export function resolveMany(hosts: string[]): Promise<DnsResult[]>;

// server/lib/wildcard.ts
export interface WildcardInfo { isWildcard: boolean; wildcardIps: string[]; wildcardCname?: string; confidence: 'high' | 'low' }
export function detectWildcard(domain: string): Promise<WildcardInfo>;
export function matchesWildcard(result: DnsResult, info: WildcardInfo): boolean;
```

**Endpoint'ler:** `GET /api/wildcard?domain=`, `POST /api/validate {domain, hosts[]}` (max 150).

> **Faz 6 için kritik:** `cnameTarget` ve `nxdomainAtEnd` alanları takeover tespitinin
> tek girdisidir; bu alanların anlamı Faz 6 başlayana kadar değiştirilmemelidir.

## 9. Riskler ve geri alma

| Risk | Belirti | Çözüm |
|---|---|---|
| Timeout `dead` sayıldı | Gerçek hostlar listeden kayboluyor | Hata kodu ayrımını (`ENOTFOUND` vs `ETIMEOUT`) test edin; şüphede `error` deyin |
| Wildcard yanlış pozitif | Gerçek hostlar `wildcardMatch` ile gruplanıp gizleniyor | 3 örnekten ≥2 kuralı; `confidence: 'low'` durumunda gruplama yapılmamalı |
| Wildcard eşleşenler silindi | Gerçek bulgu kaybı | **Silme yok, gruplama var** — kabul kriterine dahil |
| Önbellek sınırsız büyüdü | Uzun çalışan dyno'da bellek şişmesi | 5000 giriş tavanı + TTL zorunlu |
| Açık resolver'lar engellendi | Tüm sonuçlar `error` | Sistem resolver'ına düşen bir yedek (fallback) ekleyin, ama hangisinin kullanıldığını logla |
| `/api/validate` keyfi host çözümlemeye açıldı | Kötüye kullanım | `host.endsWith('.' + domain)` kontrolü zorunlu |

**Geri alma:** İki yeni endpoint ve iki yeni modül; mevcut endpoint'lere dokunulmadığı için
`git revert` güvenlidir.
