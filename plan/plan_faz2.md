# Faz 2 — Eşzamanlılık havuzu + SSRF koruması

> Ön okuma: `plan/anaplan.md`, `plan/plan_faz1.md`.
> **Bu faz, ağ çağrısı yapan her şeyden önce gelmelidir.** Sonraki fazlar 10+ yeni kaynak ve
> brute-force ekleyecek; mevcut sınırsız eşzamanlılığın üstüne eklenirse Render dyno'su düşer.

## 1. Amaç

İki yapısal sorun çözülüyor:

**(a) Sınırsız eşzamanlılık.** `handleAnalyzeSubdomain` (`src/App.tsx:243`) gerçekte `await`
edilmiyor — iki `.then()` zinciri başlatıp hemen dönüyor. `handleAnalyzeAll`'daki `await` + 300 ms
bekleme yalnızca "300 ms aralıklı ateşle-unut" demek. 200 subdomain'lik bir domain ≈ 60 saniye
içinde 200 eşzamanlı `/api/analyze`, her biri 24 port üzerinde `Promise.all` (`index.ts:238`) →
**~4800 eşzamanlı soket.** Bu rakam gerçektir ve **frontend'de çözülemez**; havuz backend'de olmalı.

**(b) SSRF.** `isValidDomain` yalnızca *biçim* kontrol ediyor. Saldırganın kendi domain'i
`169.254.169.254` (bulut metadata servisi), `10.0.0.x` veya `127.0.0.1`'e çözümlenirse
`/api/analyze`, `/api/tech` ve `/api/advanced` bu adreslere bağlanır. Backend herkese açık
olduğu için bu, iç ağa yönlendirilebilir bir prob aracı demektir.

## 2. Ön koşullar

- **Faz 1 tamamlanmış olmalı** (`lib/`, `routes/`, `config.ts` mevcut).
- `lib/net.ts` içinde `checkPort` ve `checkHttp` taşınmış durumda.

## 3. Kapsam

**Yapılacaklar**
- `lib/pool.ts`: bağımlılıksız eşzamanlılık havuzu.
- `config.ts`: havuz bütçeleri, hepsi env ile override edilebilir.
- `lib/ssrf.ts`: özel/link-local IP tespiti + güvenli çözümleme.
- `checkPort`'un çözümlenmiş IP'ye bağlanacak şekilde değiştirilmesi (DNS rebinding kapanır).
- `/health`'in havuz doluluğunu raporlaması.
- Express seviyesinde in-flight guard (aşırı yükte 503).
- `routes/analyze.ts`'teki sahte jitter'ın kaldırılması.
- `lib/pool.ts` ve `lib/ssrf.ts` için birim testleri.

**Bilinçli olarak yapılmayacaklar**
- Frontend'e dokunulmayacak (istemci kuyruğu Faz 8'de).
- Yeni kaynak eklenmeyecek (Faz 4).
- Kimlik doğrulama / kullanıcı bazlı rate limit eklenmeyecek — **bu turda kapsam dışı.**
  (Backend hâlâ herkese açık bir tarama servisi olarak kalır; bu bilinçli bir kabuldür.)

## 4. Dosya manifestosu

**Oluşturulacak:**
```
server/lib/pool.ts
server/lib/ssrf.ts
server/lib/pool.test.ts
server/lib/ssrf.test.ts
```

**Değiştirilecek:**
| Dosya | Değişiklik |
|---|---|
| `server/config.ts` | Havuz bütçeleri + env override |
| `server/lib/net.ts` | `checkPort` imzası: hostname → çözümlenmiş IP |
| `server/routes/analyze.ts` | Havuz kullanımı, SSRF kontrolü, jitter kaldırma |
| `server/routes/tech.ts` | SSRF ön kontrolü + `httpPool` |
| `server/routes/advanced.ts` | SSRF ön kontrolü + `httpPool` |
| `server/routes/health.ts` | Havuz doluluğu raporu |
| `server/index.ts` | In-flight guard middleware |
| `server/package.json` | `"test": "node --test --import tsx"` |

## 5. Teknik detay

### 5.1 `lib/pool.ts`

Bağımlılık eklemeyin; basit bir FIFO semafor yeterlidir.

```ts
export interface Pool {
  run<T>(fn: () => Promise<T>): Promise<T>;
  inFlight(): number;
  queued(): number;
  limit: number;
}

export function createPool(limit: number): Pool;

/** Tüm sonuçları settled döner — tek bir hata batch'i düşürmez. */
export function mapPool<T, R>(
  items: T[],
  limit: number | Pool,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]>;
```

`mapPool`'un settled dönmesi, mevcut koddaki `Promise.allSettled` hata semantiğiyle (`index.ts:131`)
uyumludur ve sonraki fazlarda kaynakların bağımsız hata vermesi için gereklidir.

### 5.2 `config.ts` — havuz bütçeleri

Render ücretsiz katmanı 0.1 CPU / 512 MB'dır. Bütçeler buna göre seçilmiştir ve **hepsi env ile
override edilebilir olmalıdır** ki prod'da kod değişikliği olmadan ayarlanabilsin.

```ts
const num = (v: string | undefined, d: number) => (v ? parseInt(v, 10) : d);

export const LIMITS = {
  socket:       num(process.env.POOL_SOCKET, 60),   // global, tüm ham TCP connect'ler
  portsPerHost: num(process.env.POOL_PORTS, 8),     // istek başına
  dns:          num(process.env.POOL_DNS, 40),      // global
  http:         num(process.env.POOL_HTTP, 25),     // global, giden HTTP/TLS
  source:       num(process.env.POOL_SOURCE, 4),    // tarama başına
  maxInFlight:  num(process.env.MAX_INFLIGHT, 40),  // express guard
};
```

| Havuz | Limit | Neyi engeller |
|---|---|---|
| `socketPool` | 60 | **4800 soket patlaması.** Modül seviyesi singleton olduğu için 200 eşzamanlı `/api/analyze` bile en fazla 60 canlı soket üretir |
| `portsPerHostPool` | 8 | `analyze` içindeki `Promise.all`; tek yavaş host kuyruğu aç bırakmaz |
| `dnsPool` | 40 | Faz 3 doğrulaması + Faz 5 brute-force |
| `httpPool` | 25 | `/api/tech`, `/api/advanced` |
| `sourcePool` | 4 | Faz 4'te ücretsiz API'lere nezaket |

> **`socketPool` bu fazın can alıcı parçasıdır.** Modül seviyesinde tek bir örnek olarak
> oluşturulmalı ve `lib/net.ts` içinden kullanılmalıdır; istek başına yaratılırsa hiçbir işe yaramaz.

### 5.3 `lib/ssrf.ts`

```ts
export function isPrivateIp(ip: string): boolean;
export async function resolvePublic(host: string): Promise<{
  ips: string[];
  blocked: boolean;
  reason?: 'private-ip' | 'no-record';
}>;
```

Engellenecek aralıklar (IPv4 ve IPv6):

| Aralık | Neden |
|---|---|
| `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` | RFC1918 özel ağ |
| `127.0.0.0/8` | Loopback |
| **`169.254.0.0/16`** | Link-local — **`169.254.169.254` bulut metadata servisidir** |
| `0.0.0.0/8` | "Bu ağ" |
| `100.64.0.0/10` | CGNAT |
| `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` | TEST-NET |
| `224.0.0.0/4` | Multicast |
| `::1`, `fc00::/7`, `fe80::/10` | IPv6 loopback / ULA / link-local |

### 5.4 DNS rebinding'in kapatılması — `checkPort` imza değişikliği

Bugün `checkPort(port, domain)` (`index.ts:206`) **hostname'e** bağlanıyor; yani DNS bir kez
`resolve4` ile çözülüyor, sonra soket ayrıca kendi çözümlemesini yapıyor. İki çözümleme arasında
DNS değişirse (DNS rebinding) kontrol atlatılır.

```ts
// ÖNCE
checkPort(port: number, host: string)           // host = hostname

// SONRA
checkPort(port: number, ip: string)             // ip = önceden çözümlenmiş, public doğrulanmış IP
checkHttp(protocol, host, port, ip)             // bağlantı ip'ye, Host/SNI header'ı host'tan
```

`checkHttp`'te hostname'in korunması şarttır: aksi hâlde sanal host (virtual hosting) yapan
sunucular yanlış yanıt verir ve TLS SNI eşleşmez.

### 5.5 Uygulama noktaları

| Dosya | Davranış |
|---|---|
| `routes/analyze.ts` | `resolve4` sonrası tüm IP'ler özelse → `{ ip, ports: [], isCloudflare: false, blocked: 'private-ip' }` döner, **hiç prob yapılmaz** |
| `routes/tech.ts` | İstekten önce çözümle, özelse `{ technologies: [], blocked: 'private-ip' }` |
| `routes/advanced.ts` | Aynı şekilde |

> `blocked` alanı **yeni ve opsiyoneldir**; eski frontend bunu yok sayar (yeni alanlar hep opsiyonel
> kuralı). Faz 8'de küçük bir "Özel IP (taranmadı)" rozeti olarak gösterilecek.

### 5.6 Sahte jitter'ın kaldırılması

`routes/analyze.ts` içindeki şu satır **silinecek**:

```ts
await new Promise(r => setTimeout(r, Math.random() * 300));  // index.ts:204
```

Sözde rate-limit amacıyla eklenmiş; gerçek bir koruma sağlamıyor ve port başına 300 ms'e kadar
boşuna gecikme ekliyor. Havuz geldiğinde tamamen gereksizdir.

### 5.7 In-flight guard

`index.ts`'e küçük bir middleware: eşzamanlı istek sayısı `LIMITS.maxInFlight`'ı aşarsa
`503` + `Retry-After: 2`. Frontend'in fan-out'u böylece OOM yerine yeniden denemeye dönüşür
(Faz 8'de `api.ts` bunu 2 sn backoff ile bir kez tekrar edecek).

### 5.8 `/health` genişletmesi

```json
{
  "status": "ok",
  "pools": { "socket": "3/60", "dns": "0/40", "http": "1/25" },
  "inFlight": 2
}
```

Bu, prod'da bütçe ayarlamak için tek görünürlük aracıdır; atlanmamalıdır.

## 6. Kabul kriterleri

- [ ] `npm test` (server) geçiyor: `pool.test.ts` sıra ve limit davranışını, `ssrf.test.ts`
      tüm CIDR aralıklarını doğruluyor.
- [ ] 200 eşzamanlı `/api/analyze` altında `socketPool` doluluğu **hiçbir zaman 60'ı aşmıyor**.
- [ ] Aynı yük altında süreç RSS'i düz kalıyor (sürekli artmıyor) ve süreç ölmüyor.
- [ ] `127.0.0.1`'e çözümlenen bir hostname ile `/api/analyze` çağrısı → `blocked: 'private-ip'`,
      `ports: []` ve **hiç TCP bağlantı denemesi yok** (paket/port dinleyici ile doğrulanmış).
- [ ] `169.254.169.254` için aynı davranış.
- [ ] `/api/tech` ve `/api/advanced` özel IP'lerde bağlantı kurmuyor.
- [ ] `/health` havuz doluluğunu raporluyor.
- [ ] `grep -n "Math.random() \* 300" server/routes/analyze.ts` → boş.
- [ ] Normal (public) bir domain için `/api/analyze` çıktısı Faz 1'deki ile **aynı port listesini**
      veriyor (havuz yalnız hızı etkiler, sonucu değil).

## 7. Doğrulama adımları

```bash
cd server && npm test          # pool + ssrf birim testleri

npm start &
sleep 3

# --- Havuz yük testi ---
curl -s localhost:3001/health   # başlangıç doluluğu
seq 1 200 | xargs -P 200 -I{} curl -s -o /dev/null \
  "http://localhost:3001/api/analyze?domain=www.example.com" &
# Yük sürerken başka terminalde:
watch -n1 'curl -s localhost:3001/health'
#   -> socket doluluğu 60'ı AŞMAMALI
# Bellek:
while true; do ps -o rss= -p $(pgrep -f "tsx index.ts") ; sleep 2; done
#   -> düz kalmalı
```

**SSRF doğrulaması** (kontrolünüzdeki bir DNS kaydı gerekir):

```bash
# A kaydı 127.0.0.1'e işaret eden bir test hostname'i kullanın.
# Lokalde 8080'de bir dinleyici açın ve HİÇ bağlantı almadığını doğrulayın:
python3 -m http.server 8080 &        # erişim logu tutar
curl -s "http://localhost:3001/api/analyze?domain=<test-hostname>" | python3 -m json.tool
#   -> "blocked": "private-ip", "ports": []
#   -> python http.server logunda HİÇBİR istek görünmemeli
```

**Regresyon:** Faz 1'deki `/tmp/before` çıktılarıyla public bir domain için `scan`, `crt`,
`tech`, `email-sec` karşılaştırması yine aynı olmalı.

## 8. Devir kontratı

```ts
// server/lib/pool.ts
export interface Pool { run<T>(fn: () => Promise<T>): Promise<T>; inFlight(): number; queued(): number; limit: number }
export function createPool(limit: number): Pool;
export function mapPool<T, R>(items: T[], limit: number | Pool,
  fn: (item: T, i: number) => Promise<R>): Promise<PromiseSettledResult<R>[]>;

// server/lib/ssrf.ts
export function isPrivateIp(ip: string): boolean;
export function resolvePublic(host: string): Promise<{ ips: string[]; blocked: boolean; reason?: 'private-ip' | 'no-record' }>;

// server/lib/net.ts  (DEĞİŞTİ)
export function checkPort(port: number, ip: string): Promise<boolean>;
export function checkHttp(protocol: string, host: string, port: number, ip: string):
  Promise<{ status: number | string; isCloudflare: boolean; protocolUsed: string }>;

// server/config.ts
export const LIMITS: { socket; portsPerHost; dns; http; source; maxInFlight };
```

**Paylaşılan havuz örnekleri** (Faz 3-7 bunları import eder, yenisini yaratmaz):
```ts
// server/lib/pool.ts (veya config.ts) içinde modül seviyesi singleton
export const socketPool: Pool;
export const dnsPool: Pool;
export const httpPool: Pool;
```

**Yeni yanıt alanı:** `blocked?: 'private-ip'` — opsiyonel, `analyze`/`tech`/`advanced` yanıtlarında.

## 9. Riskler ve geri alma

| Risk | Belirti | Çözüm |
|---|---|---|
| Havuz istek başına yaratıldı | Yük altında `socket` doluluğu 60'ı aşar | Havuzlar **modül seviyesi singleton** olmalı; import edilerek paylaşılmalı |
| `checkHttp`'te hostname kaybedildi | Sanal host'lu siteler yanlış durum kodu döner, TLS SNI hatası | Bağlantı IP'ye, `Host` header ve SNI hostname'e |
| CIDR kontrolünde off-by-one | **SSRF sessizce geri açılır** | `ssrf.test.ts` her aralığın ilk/son adresini ve sınır komşularını test etmeli |
| Bütçeler fazla sıkı | Tarama çok yavaşlar | Env override ile prod'da ayarla; `/health` doluluğuna bak |
| Bütçeler fazla gevşek | Dyno OOM | Aynı şekilde env ile düşür |
| Deadlock (havuz içinde havuz bekleme) | Tarama hiç bitmez | Bir havuzun `run()` callback'i içinde **aynı havuzu** tekrar beklemeyin |

**Geri alma:** `git revert`. Şema/veri değişikliği yok; `blocked` alanı opsiyonel olduğu için
frontend'de iz bırakmaz.
