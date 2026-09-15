# Faz 5 İlave — Beş API'den Tam ve Kontrollü İstihbarat Kullanımı

> Tarih: 15–16 Eylül 2026
> İncelenen başlangıç sürümü: `acd7036` (`main`)
> Durum: Faz 5 ilaveleri planlandı; Render uyumlu teknoloji tespiti bölümü uygulandı.
> Ön okuma: `plan/anaplan.md`, `plan/plan_faz4.md`, `plan/plan_faz5.md`.

## Ek karar — Render ücretsiz katmanında teknoloji keşfi (16 Eylül 2026)

Bu ilave, teknoloji tespiti için daha önce değerlendirilen `httpx`, WhatWeb ve WebReveal
seçeneklerinin yerine uygulanacak kesin yaklaşımı tanımlar.

### Karar

- Dağıtım mevcut **Render native Node.js** servisi olarak kalır; Docker, Go/Ruby ikilisi,
  `httpx`, WhatWeb ve Chromium/Playwright eklenmez.
- `opentechalyzer@0.4.2` tam sürüm numarasıyla sabitlenir. Yalnız HTTP header, cookie,
  HTML/meta, script/link, sayfa başlığı ve sunucu imzalarını kullanan statik modu çalışır.
- Mevcut yerel imza motoru paket hatası veya uyumsuzluğu durumunda yedek olarak korunur.
- Harici Wappalyzer/GPL parmak izi veri seti, tarayıcı render'ı, crawl ve source-map analizi
  kesinlikle etkinleştirilmez.
- Shodan yalnız IP tabanlı pasif servis/ürün/sürüm/port doğrulama kaynağıdır. CDN ve ortak IP
  üzerindeki Shodan verisi hedef hostname'in CMS veya framework bilgisi olarak sunulmaz.

### Kaynak sınırları

- Analiz yalnız “Tam kapsamlı analiz” akışında, erişilebilir web hizmetleri için yürütülür.
- İstek zaman aşımı 8 saniye, response gövdesi en fazla 1 MB, yönlendirme en fazla 3 ve aynı
  anda teknoloji analizi en fazla 3 olacaktır.
- Sonuçlar 12 saat bellek önbelleğinde tutulur. Render yeniden başlatıldığında önbelleğin
  silinmesi kabul edilir; ücretli kalıcı depolama eklenmez.
- Bir alt alan adındaki hata tüm taramayı kesmez. Shodan anahtarı/kotası yoksa statik teknoloji
  analizi tek başına devam eder.

### Hedef görünüm ve sözleşme

Her teknoloji sonucu `name`, `category`, isteğe bağlı `version`, `confidence`, `sources`,
`evidence`, `observedAt` ve `passive` alanlarını taşır. Güvenlik özeti tablosuna “Teknoloji
Yığını” sütunu eklenir; sunucu, CMS/e-ticaret, backend, frontend ve analitik rozetleri
gösterilir. Cloudflare bu sütunda yinelenmez; WAF/CDN bağlamında kalır. Shodan bulguları
“Pasif Shodan gözlemi” ve gözlem tarihi ile açıkça ayrılır.

## 1. Yönetici özeti ve karar

Mevcut uygulama aşağıdaki beş anahtarlı servisi bağlıyor:

1. AlienVault OTX
2. SecurityTrails
3. VirusTotal
4. ProjectDiscovery Chaos
5. Shodan

Ancak bu servisler bugün ağırlıklı olarak **subdomain adı üreten keşif kaynakları** gibi
kullanılıyor. Sağlayıcı cevaplarındaki DNS kayıtları, gözlem zamanları, IP ilişkileri, tehdit
itibarı, servis/ürün bilgileri ve altyapı metadatasının önemli kısmı normalize edilmeden atılıyor.

Sonuç olarak kullanıcının şüphesi doğrudur: **Beş API'den gelen bütün yararlı bilgiler şu anda
kullanılmıyor.**

Bu ilavenin kararı şudur:

- Mevcut subdomain keşfi korunacak.
- Zaten yapılan API çağrılarından dönen yararlı alanlar kaybedilmeyecek.
- Shodan üzerinden her benzersiz, güncel ve genel IP için pasif servis bilgisi alınacak.
- VirusTotal ve OTX tehdit bağlamı; SecurityTrails DNS geçmişi plan/yetki izin verdiği ölçüde
  eklenecek.
- Chaos keşif kaynağı olarak kalacak; sağlamadığı veriyi varmış gibi modellemeyeceğiz.
- Pasif gözlem ile uygulamanın yaptığı canlı doğrulama kesin biçimde ayrılacak.
- Her ham alanı saklamak yerine, **ürün için anlamlı, güvenli ve gösterilebilir bütün alanlar**
  kullanılacak. Ham banner gövdeleri, ham HTML ve WHOIS kişisel iletişim bilgileri saklanmayacak.

## 2. Mevcut kodda doğrulanmış durum

### 2.1 Yapısal dar boğaz

`server/sources/types.ts:3-6` içindeki kaynak sözleşmesi yalnızca şunu taşıyabiliyor:

```ts
interface SourceHit {
  subdomain: string;
  ip?: string;
}
```

`runSources()` kaynak sonuçlarını subdomain anahtarıyla birleştiriyor ve yalnız `sources[]` ile
tek bir IP'yi koruyor (`server/sources/index.ts:48-86`). Bu nedenle sağlayıcı cevabında daha
fazla veri okunsa bile mevcut sözleşmeden geçirilemiyor.

`/api/scan` de sonuçları `SubdomainData` şekline dönüştürüyor; cevapta sağlayıcı gözlemi veya
tehdit istihbaratı için ayrı bir alan yok (`server/routes/scan.ts:37-68`).

### 2.2 Sağlayıcı bazında mevcut kullanım

| Sağlayıcı | Şu an çağrılan uç | Şu an kullanılan | Kaybedilen / kullanılmayan |
|---|---|---|---|
| Shodan | `GET /dns/domain/{domain}` | Yalnız `subdomains[]` | `data[]` DNS tipi/değeri, `last_seen`, domain etiketleri, `more`; IP host servisleri hiç çağrılmıyor |
| VirusTotal | `GET /api/v3/domains/{domain}/subdomains?limit=40` | Yalnız her nesnenin `id` alanı | Domain nesnesinin analiz istatistikleri, itibar, kategoriler, etiketler, DNS ve sertifika alanları; `links.next` sayfalaması |
| OTX | `GET /api/v1/indicators/domain/{domain}/passive_dns` | Yalnız `hostname` | Pasif DNS adresi, kayıt tipi ve zaman alanları; genel/pulse tehdit bağlamı hiç çağrılmıyor |
| SecurityTrails | `GET /v1/domain/{domain}/subdomains` | Yalnız `subdomains[]` | Mevcut uç esasen liste üretir; DNS/WHOIS geçmişi gibi ayrı uçlar çağrılmıyor |
| Chaos | `GET /dns/{domain}/subdomains` | `subdomains[]` | Bu entegrasyon için temel amaç zaten keşiftir; kayda değer zengin metadata beklenmemeli |

Ek doğrulamalar:

- VirusTotal isteği yalnız ilk 40 sonucu alıyor ve cursor/`next` sayfasını izlemiyor.
- Shodan DNS cevabındaki `more` işareti işlenmiyor.
- Kaynak hataları birbirinden izole; bu doğru davranış korunmalı.
- Kaynak durumu şu anda `no-key`, `timeout`, `error`, `disabled`, `rate-limited` ile sınırlı;
  yetkisiz plan ve kısmi sonuç ayrımı görünmüyor.
- Frontend yalnız kaynak adı/sayısı, subdomain, IP, canlı port ve teknoloji gösteriyor.

## 3. “Tüm bilgileri kullanmak” ne anlama gelecek?

### Kullanılacak

- Varlık keşfine veya ilişkilendirmeye yarayan hostname, IP, DNS kayıtları ve tarihler.
- Tehdit kararına yarayan sağlayıcı analiz sayıları, itibar, etiket ve pulse özetleri.
- Servis envanterine yarayan port, transport, ürün, sürüm, CPE ve gözlem tarihi.
- Altyapı ayrımına yarayan ASN, organizasyon, ISP, hostname ve ülke.
- Kaynağın güvenilir yorumlanması için `source`, `observedAt`, `fetchedAt`, ilişki türü ve
  kısmi/truncated bilgisi.

### Saklanmayacak veya doğrudan gösterilmeyecek

- Shodan'ın ham banner `data` alanı ve tam HTTP gövdesi.
- Sağlayıcıların ham JSON cevabı.
- WHOIS içindeki kişi adı, açık adres, telefon ve kişisel e-posta gibi PII alanları.
- OTX veya başka kaynaktan gelen işlenmemiş HTML.
- API anahtarları, istek URL'sindeki anahtar değeri veya yetkilendirme header'ı.

Bu ayrım hem localStorage şişmesini hem XSS/PII riskini hem de gereksiz veri taşımayı önler.

## 4. Hedef kullanıcı anlamı

Ürün üç veri sınıfını ayrı göstermelidir:

| Sınıf | Anlamı | Örnek |
|---|---|---|
| Keşif | Bu varlığı hangi kaynak buldu? | `api.example.com`, kaynak: VT + Chaos |
| Pasif istihbarat | Bir sağlayıcı geçmişte ne gözlemledi? | Shodan: `9200/tcp`, son gözlem tarihi |
| Canlı doğrulama | Uygulama şu anda neye bağlanabildi? | `443/tcp`, HTTP 200, canlı doğrulandı |

Bir port hem Shodan'da hem canlı taramada bulunursa tek kanıt silinerek birleştirilmemelidir.
Arayüz “Canlı doğrulandı + Shodan'da gözlendi” diyebilmelidir.

Shodan'da bulunan fakat 45 portluk canlı listede olmayan bir port ilk sürümde **pasif gözlem**
olarak gösterilir; otomatik biçimde aktif tarama listesine eklenmez. İleride kullanıcı tarafından
başlatılan “Bu portu doğrula” eylemi ayrı bir geliştirme olabilir.

## 5. Sağlayıcı bazında hedef kullanım

### 5.1 Shodan

#### A. Mevcut domain çağrısından korunacak veriler

`GET /dns/domain/{domain}` cevabından:

- `subdomains[]`
- `data[].subdomain`
- `data[].type`
- `data[].value`
- `data[].last_seen`
- `tags[]`
- `more`

Sayfalama sınırlı ve görünür olmalıdır. Varsayılan öneri en fazla 3 sayfa; sınıra gelinirse
`truncated: true` dönülür. Her sayfa/istek kredi etkisi yaratabileceğinden üst sınır env ile
ayarlanmalıdır.

#### B. IP host zenginleştirmesi

DNS doğrulaması tamamlandıktan sonra her benzersiz genel IP için:

```text
GET /shodan/host/{ip}?key=...&minify=false
```

Normalize edilecek alanlar:

- IP, ASN, organizasyon, ISP, işletim sistemi, ülke/şehir, hostnames, domains, tags.
- `last_update`.
- Her servis için port, transport, ürün, sürüm, CPE, timestamp, Shodan modülü.
- Varsa HTTP title/server ve sınırlı SSL sertifika özeti.
- Varsa CVE/vulnerability kimlikleri; fakat bunlar **pasif ve doğrulanmamış** olarak etiketlenir.

Ham banner metni taşınmaz. Sağlayıcı planı tam banner alanlarını vermiyorsa `minify=true` ile
portlar ve genel host bilgisi kullanılmaya devam eder; özellik kısmi çalışır.

#### C. Cloudflare/CDN kuralı

Cloudflare, Fastly, Akamai gibi ortak edge IP'lerinde Shodan verisi hedef origin'e aitmiş gibi
sunulamaz.

Her IP ilişkisi şu sınıflardan biri olmalıdır:

```ts
type AssetAssociation = 'current-dns' | 'historical-dns' | 'shared-edge' | 'unknown';
```

- CNAME zinciri, ASN/org ve mevcut WAF/CDN sinyalleri birlikte değerlendirilir.
- `shared-edge` ise Shodan portları “Ortak/CDN altyapı gözlemi” olarak gösterilir.
- Shared edge üzerindeki Shodan CVE'leri hedef zafiyeti sayılmaz.
- Cloudflare adı servis teknolojileri listesine geri eklenmez; WAF sonucu “Tam kapsamlı analiz”
  bölümünde kalır. `shared-edge` rozeti WAF değil, ağ topolojisi bilgisidir.

### 5.2 VirusTotal

Mevcut subdomain ilişkisi Domain nesneleri döndürür. Ek HTTP isteği yapmadan, aynı cevaptan şu
alanlar normalize edilmelidir:

- `id` / hostname.
- `last_analysis_stats`: malicious, suspicious, harmless, undetected, timeout.
- `reputation` ve `total_votes`.
- `categories` ve `tags`.
- `last_analysis_date`, `last_update_date`.
- Varsa `last_dns_records` ve son HTTPS sertifika özeti.

Ana domain için ayrıca `GET /api/v3/domains/{domain}` kullanılabilir. Geçmiş/güncel IP ilişkisi
için `GET /api/v3/domains/{domain}/resolutions` plan/yetki izin verdiğinde çağrılır.

Subdomain sayfalaması `links.next`/cursor ile yapılmalı; varsayılan toplam üst sınır 200 kayıt
olmalı ve sınır kullanıcıya gösterilmelidir. VirusTotal'ın “direct subdomain” semantiği recursive
değildir; sonuç buna göre etiketlenmelidir.

VirusTotal sonuçları “zafiyet” değildir. Örneğin `malicious > 0`, “VT motor uyarısı” olarak
sunulur; ürünün kendi doğrulaması gibi gösterilmez.

### 5.3 AlienVault OTX

Mevcut passive DNS cevabından, gerçek cevap şeması capability testiyle doğrulandıktan sonra şu
alanlar normalize edilmelidir:

- Hostname.
- IP/adres.
- DNS kayıt türü.
- İlk ve son görülme zamanı.
- Varsa kaynak/sensör bilgisi.

Domain/hostname için OTX `general` bölümü planın izin verdiği ölçüde kullanılarak:

- Pulse sayısı.
- Pulse kimliği, adı, oluşturulma/güncellenme tarihi.
- Etiketler, adversary adı ve referans URL'leri.

alınabilir. Pulse listesi varsayılan 10 kayıtla sınırlandırılmalı; daha fazlası sayı olarak
gösterilmelidir. Açıklama HTML'i render edilmemeli, dış bağlantılar yalnız `https` allowlist
kontrolünden sonra tıklanabilir olmalıdır.

### 5.4 SecurityTrails

Mevcut subdomain endpoint'i korunur. Plan/yetki testi başarılı olursa aşamalı olarak:

- A ve AAAA geçmişi.
- CNAME, MX ve NS geçmişi.
- İlk/son görülme dönemleri.
- Registrar ve domain oluşturulma/son kullanma gibi PII olmayan WHOIS özeti.

eklenir.

Özellikle A kaydı geçmişi Cloudflare arkasındaki eski/origin olabilecek IP'leri gösterebilir;
ancak bunlar “geçmiş DNS ilişkisi” olarak işaretlenir, güncel origin veya canlı hedef sayılmaz.
Bu IP'lere otomatik port taraması yapılmaz.

SecurityTrails v2 asset/port özellikleri hesaptaki ürün ve project erişimine bağlı olabilir.
Capability testiyle doğrulanmadan zorunlu akışa alınmamalıdır.

### 5.5 ProjectDiscovery Chaos

Chaos'un bu projedeki görevi subdomain keşfidir. Aşağıdakiler yeterlidir:

- Dönen bütün geçerli subdomainlerin normalize edilmesi.
- Kaynak başarı/kota/hata durumunun görünmesi.
- Varsa sağlayıcının desteklediği sayım bilgisi.

Chaos için yapay bir “tehdit skoru” veya servis bilgisi üretilmeyecektir.

## 6. Hedef veri modeli

Mevcut `SourceHit` genişletilerek her şeyi tek nesneye doldurulmamalıdır. Keşif sonucu ile kanıt
ayrılmalıdır.

```ts
type IntelligenceSource = 'shodan' | 'virustotal' | 'otx' | 'securitytrails' | 'chaos';

interface EvidenceBase {
  source: IntelligenceSource;
  subject: string;                   // hostname veya IP
  scope: 'domain' | 'hostname' | 'ip';
  association: 'current-dns' | 'historical-dns' | 'shared-edge' | 'unknown';
  observedAt?: string;               // sağlayıcının gözlem zamanı
  fetchedAt: string;                 // bizim API'den aldığımız zaman
}

interface PassiveServiceEvidence extends EvidenceBase {
  kind: 'passive-service';
  port: number;
  transport: 'tcp' | 'udp';
  product?: string;
  version?: string;
  cpe?: string[];
  vulnerabilities?: Array<{ id: string; verified: false }>;
}

interface ThreatEvidence extends EvidenceBase {
  kind: 'threat';
  malicious?: number;
  suspicious?: number;
  harmless?: number;
  reputation?: number;
  tags?: string[];
  pulseCount?: number;
}

interface DnsEvidence extends EvidenceBase {
  kind: 'dns';
  recordType: string;
  value: string;
  firstSeen?: string;
  lastSeen?: string;
}

interface SourceFetchResult {
  hits: SourceHit[];
  evidence: Array<PassiveServiceEvidence | ThreatEvidence | DnsEvidence>;
  page?: { truncated: boolean; nextCursor?: string; total?: number };
}
```

`SubdomainSource.fetch()` hedefte `Promise<SourceFetchResult>` döndürür. Anahtarsız diğer
kaynaklar `{ hits, evidence: [] }` biçimine geçirilir. Böylece varlık keşfi bozulmadan sağlayıcı
kanıtları taşınır.

API cevapları raw provider nesnesi döndürmemelidir; frontend yalnız bu normalize edilmiş
sözleşmeyi görmelidir.

## 7. Hedef API sözleşmesi

### 7.1 `/api/scan` geriye uyumlu genişleme

Mevcut alanlar korunur. Yeni alanlar opsiyonel eklenir:

```ts
interface ScanResponse {
  domain: string;
  wildcard: WildcardInfo;
  sources: SourceStatus[];
  results: SubdomainData[];
  truncatedValidation: boolean;
  intelligence?: {
    evidence: IntelligenceEvidence[];
    truncatedSources: string[];
  };
}
```

Bu bölüm yalnız mevcut keşif çağrılarının zaten döndürdüğü verileri taşır. Aynı domain endpoint'i
sırf kaybedilen alanları almak için ikinci kez çağrılmaz.

### 7.2 Yeni zenginleştirme endpoint'i

```http
POST /api/intelligence
Content-Type: application/json

{
  "domain": "example.com",
  "hosts": ["www.example.com", "api.example.com"]
}
```

Kurallar:

- En fazla 25 hostname/istek.
- Her hostname `domain` ile aynı veya onun gerçek alt alanı olmalı.
- IP listesi istemciden kabul edilmemeli; backend güvenli DNS çözümlemesini kendisi yapmalı.
- Özel, loopback, link-local ve metadata IP'leri mevcut SSRF katmanıyla engellenmeli.
- Wildcard eşleşen ve DNS'te ölü hostlar Shodan'a gönderilmemeli.
- Aynı IP bir batch içinde yalnız bir kez, eşzamanlı batch'lerde single-flight ile yalnız bir kez
  sorgulanmalı.
- Tek sağlayıcı hatası bütün cevabı düşürmemeli.

Örnek cevap:

```json
{
  "domain": "example.com",
  "fetchedAt": "2026-09-15T10:00:00.000Z",
  "assets": [
    {
      "hostname": "www.example.com",
      "ips": ["203.0.113.10"],
      "association": "current-dns",
      "passiveServices": [],
      "threatEvidence": [],
      "dnsEvidence": []
    }
  ],
  "sources": [],
  "limits": {
    "requestedHosts": 2,
    "processedHosts": 2,
    "uniqueIps": 1,
    "truncated": false
  }
}
```

Frontend canlı hostları 25'lik partilere ayırır ve en fazla iki intelligence isteğini aynı anda
çalıştırır. “Servisleri tara” için mevcut üç işçili akış bağımsız kalır.

## 8. Önbellek, kota ve dayanıklılık

### 8.1 Zorunlu önbellek

İlk uygulama bellek içi, boyut sınırlı TTL/LRU olabilir:

| Veri | Anahtar | Önerilen TTL |
|---|---|---:|
| Shodan host | `shodan:ip:{ip}` | 12 saat |
| Shodan domain DNS | `shodan:dns:{domain}:{page}` | 12 saat |
| VirusTotal domain/subdomain | `vt:domain:{hostname}` | 12 saat |
| OTX domain | `otx:domain:{domain}:{section}` | 12 saat |
| SecurityTrails history | `st:history:{hostname}:{type}:{page}` | 24 saat |
| Negatif/404 sonuç | sağlayıcı + konu | 1 saat |

Cache yalnız sonucu değil, devam eden Promise'i de kısa süreli tutmalıdır. Böylece aynı
Cloudflare IP'sine bağlı üç subdomain aynı anda gelirse üç Shodan çağrısı başlamaz.

Render yeniden başladığında bellek cache'i kaybolur; ilk sürüm için kabul edilebilir. Kullanım
artarsa Cloudflare KV, Redis veya kalıcı storage ayrı fazda eklenmelidir.

### 8.2 Sınırlar

`server/config.ts` ve `server/.env.example` için önerilen ayarlar:

```dotenv
POOL_INTELLIGENCE=2
INTEL_PROVIDER_TIMEOUT_MS=8000
INTEL_CACHE_TTL_MS=43200000
INTEL_CACHE_MAX_ENTRIES=2000
INTEL_MAX_HOSTS_PER_REQUEST=25
INTEL_MAX_UNIQUE_IPS_PER_SCAN=50
SHODAN_DNS_MAX_PAGES=3
VIRUSTOTAL_SUBDOMAIN_MAX_ITEMS=200
OTX_PULSE_MAX_ITEMS=10
SECURITYTRAILS_HISTORY_MAX_PAGES=2
```

50 benzersiz IP sınırına gelinirse kalanlar sessizce atılmaz. API ve UI `truncated` ile
“50/87 IP zenginleştirildi” göstermelidir.

### 8.3 Hata modeli

`SourceStatus.skipped` aşağıdaki durumlarla genişletilmelidir:

```ts
type SourceSkipReason =
  | 'no-key'
  | 'unauthorized'
  | 'plan-restricted'
  | 'rate-limited'
  | 'quota-exhausted'
  | 'timeout'
  | 'not-found'
  | 'partial'
  | 'disabled'
  | 'error';
```

401, 403, 404 ve 429 aynı “error” etiketi altında kaybolmamalıdır. Sağlayıcının güvenli kota
header'ları varsa normalize edilmiş kalan kota gösterilebilir; header içeriği loglanmamalıdır.

## 9. API anahtarlarını koruma

Mevcut giriş ekranı frontend tarafındadır; Render backend endpoint'leri internete açıktır. Bu,
zenginleştirme endpoint'i korumasız eklenirse üçüncü kişilerin beş API kotasını tüketebilmesi
anlamına gelir.

En az aşağıdaki önlemler zenginleştirmeden önce tamamlanmalıdır:

1. Render'da `trust proxy` doğru yapılandırılarak IP tabanlı rate limit.
2. `/api/scan` ve `/api/intelligence` için ayrı token-bucket limitleri.
3. `Origin` allowlist; yalnız üretim frontend origin'i ve lokal geliştirme origin'i.
4. API anahtarlarının yalnız server env'de kalması; frontend bundle'a hiçbir anahtar yazılmaması.
5. URL query içinde Shodan anahtarını loglamayacak istek/log sanitizasyonu.

Önerilen kalıcı çözüm, mevcut tek kullanıcı modelini gerçek backend oturumuna taşımaktır:

- Kullanıcı e-postası ve parola hash'i server env'de.
- `POST /api/auth/login`.
- Kısa ömürlü imzalı oturum ve `HttpOnly`, `Secure` cookie.
- CORS `credentials` ve kesin origin allowlist.

Bu güvenlik işi ayrı commit olabilir; ancak ücretli/kotalı enrichment endpoint'ini herkese açık
şekilde yayına almak kabul edilmemelidir.

## 10. UI/UX yerleşimi

Mevcut Figma tabanlı koyu konsol tasarımı, renkler ve tipografi korunacaktır.

### 10.1 Subdomain satırı

Her varlıkta iki net alan:

```text
Canlı servisler
  443/tcp · HTTPS · 200 · Canlı doğrulandı

Pasif istihbarat
  9200/tcp · Elasticsearch · Shodan · 3 gün önce gözlendi
```

- Aynı port iki kaynakta varsa tek satırda iki durum rozeti olabilir.
- Shodan-only port gri/mor pasif rozet; canlı port yeşil rozet.
- `shared-edge` durumunda turuncu “Ortak/CDN altyapısı” açıklaması.
- Ürün/sürüm ve CPE tooltip'e gömülmek yerine açılır detay içinde okunabilir gösterilmeli.
- CVE etiketi “Shodan bildirimi — doğrulanmadı” metnini taşır.

### 10.2 Domain istihbarat paneli

“Keşif ağı” ile “Tam kapsamlı analiz” arasına **Pasif istihbarat** bölümü eklenir:

- Tehdit sinyalleri: VT malicious/suspicious ve OTX pulse sayısı.
- Altyapı: benzersiz IP, ASN/organizasyon ve shared-edge sayısı.
- DNS geçmişi: SecurityTrails/OTX/Shodan gözlemleri.
- Veri tazeliği: sağlayıcı bazında son gözlem ve alınma zamanı.

Sağlayıcılar tek bir opak güvenlik puanına eritilmemelidir. Her sağlayıcının sonucu ve tarihi
ayrı görünür; çelişkiler saklanmaz.

### 10.3 Mevcut kurallarla uyum

- Cloudflare servis listesinde ikinci kez gösterilmez; yalnız WAF paneli ve gerekiyorsa ağ
  topolojisi rozeti bulunur.
- HTTP Header Güvenliği ve puanı “Tam kapsamlı analiz” içinde kalır.
- Üstteki “Servisleri tara”, “Tam kapsamlı analiz” ve “Kapsam oluştur” butonlarının yeri korunur.
- Uzun zenginleştirme boyunca buton donmuş görünmez; ilerleme, iptal ve kısmi hata görünürdür.
- Eski localStorage şeması okunmaya devam eder. Yeni cache girdilerine `schemaVersion` ve
  `fetchedAt` eklenir.

## 11. Dosya manifestosu

### Yeni dosyalar

```text
server/intelligence/types.ts
server/intelligence/cache.ts
server/intelligence/classify.ts
server/intelligence/providers/shodan.ts
server/intelligence/providers/virustotal.ts
server/intelligence/providers/otx.ts
server/intelligence/providers/securitytrails.ts
server/routes/intelligence.ts
server/intelligence/*.test.ts
server/intelligence/__fixtures__/*.json
server/scripts/check-intelligence-capabilities.ts
```

### Değişecek dosyalar

| Dosya | Değişiklik |
|---|---|
| `server/sources/types.ts` | `SourceFetchResult`, evidence ve sayfalama sözleşmesi |
| `server/sources/index.ts` | Hit ile evidence'i ayrı birleştirme; kısmi durum desteği |
| `server/sources/shodan.ts` | DNS `data[]`, `last_seen`, `more` ve sayfalama |
| `server/sources/virustotal.ts` | Domain attributes ve cursor sayfalaması |
| `server/sources/otx.ts` | Passive DNS adres/tarih/kayıt tipi |
| `server/sources/securitytrails.ts` | Mevcut keşfi koruma; capability sonucu etkin zenginleştirme |
| `server/sources/chaos.ts` | Yeni `{hits, evidence}` sözleşmesine uyum |
| Diğer `server/sources/*.ts` | `{ hits, evidence: [] }` dönüş şekli |
| `server/routes/scan.ts` | Opsiyonel `intelligence` alanı |
| `server/index.ts` | Intelligence route ve rate-limit middleware kaydı |
| `server/config.ts` | Pool, TTL, pagination ve bütçe limitleri |
| `server/.env.example` | Yeni ayarlar; anahtar değeri yok |
| `server/types.ts` | `ScanResponse` ve intelligence tipleri |
| `src/App.tsx` | Intelligence state, batch runner ve yeni paneller |
| `src/index.css` | Mevcut tasarım tokenlarıyla pasif/canlı/edge durumları |
| `arayuz_tasarim_sureci.md` | Uygulama tamamlandıktan sonra yeni UX kararlarının kaydı |

## 12. Uygulama sırası ve önerilen commitler

### Adım 0 — Capability ve kota doğrulaması

- Beş anahtarın değerini yazdırmadan çalışabilirliğini denetleyen script oluştur.
- Her sağlayıcı için 200/401/403/404/429 davranışını ve dönen alan adlarını kaydet.
- SecurityTrails history/v2 ve Shodan full-host yetkisini feature flag ile belirle.
- Test çıktısında hedefe ait ham veri veya anahtar bulunmasın.

Önerilen commit: `test: api yetenek ve kota kontrolünü ekle`

### Adım 1 — Veri sözleşmesi ve parser fixture'ları

- `SourceFetchResult` ve evidence tiplerini ekle.
- Sağlayıcılardan alınmış, hassas alanları temizlenmiş fixture'lar ekle.
- Parser birim testlerini önce yaz.
- Bütün mevcut kaynakları yeni sözleşmeye geçir; `/api/scan` eski alanları korusun.

Önerilen commit: `refactor: kaynak sonucunu kanıt modeliyle genişlet`

### Adım 2 — Mevcut cevaplarda kaybolan veriyi koru

- Shodan DNS records ve sayfalama.
- VT subdomain attributes ve cursor.
- OTX passive DNS ayrıntıları.
- Kısmi/truncated kaynak durumları.

Önerilen commit: `feat: keşif api cevaplarındaki istihbaratı koru`

### Adım 3 — Cache, single-flight, havuz ve koruma

- TTL/LRU cache.
- Aynı anahtar için devam eden isteği birleştirme.
- `POOL_INTELLIGENCE=2`.
- Rate limit, origin allowlist ve log sanitizasyonu.
- SSRF ve in-domain kontrolleri.

Önerilen commit: `feat: istihbarat kotası ve önbellek koruması ekle`

### Adım 4 — Shodan IP enrichment

- Güvenli çözülmüş benzersiz IP'leri çıkar.
- Host endpoint'ini çağır, normalize et, ham banner'ı at.
- Shared-edge sınıflandırması.
- Pasif port ile canlı portu kanıt kaybetmeden eşleştir.

Önerilen commit: `feat: shodan pasif servis zenginleştirmesi ekle`

### Adım 5 — VT, OTX ve SecurityTrails enrichment

- VT apex domain ve resolutions.
- OTX general/pulse özeti.
- Yetki varsa SecurityTrails DNS geçmişi.
- Sağlayıcı bağımsız hata/kota durumları.

Önerilen commit: `feat: tehdit ve dns geçmişi zenginleştirmesi ekle`

### Adım 6 — Frontend

- Domain intelligence state ve 25'lik batch runner.
- Canlı/Pasif ayrımı.
- Domain istihbarat paneli.
- İptal, ilerleme, kısmi hata, cache tazeliği.
- localStorage boyut ve schema migration kontrolü.

Önerilen commit: `feat: pasif istihbarat sonuçlarını arayüzde göster`

### Adım 7 — Üretim doğrulaması ve dokümantasyon

- Test/build/lint.
- Render deploy ve health/pool izlemesi.
- Yetkili test domainleriyle kontrollü smoke test.
- `neoportfoy.com.tr` gibi çok varlıklı hedefte donma/iptal testi.
- `arayuz_tasarim_sureci.md`, README ve `CLAUDE.md` güncellemesi.

Önerilen commit: `docs: api zenginleştirme ve üretim akışını kaydet`

## 13. Test planı

### Birim testleri

- Her sağlayıcı parser'ı eksik/null alanlarda hata vermemeli.
- VT cursor ve Shodan `more` üst sınıra uymalı.
- OTX tarih/IP normalizasyonu.
- PII ve raw banner alanlarının çıktıdan atılması.
- 401/403/404/429 doğru `SourceStatus` üretmeli.
- Cache TTL, LRU tahliye ve negatif cache.
- Aynı IP'ye eşzamanlı 10 istek yalnız bir provider çağrısı üretmeli.
- Cloudflare/Fastly CNAME + ASN fixture'ı `shared-edge` dönmeli.
- Özel IP ve domain dışı hostname reddedilmeli.

### Entegrasyon testleri

- Bir sağlayıcı timeout olurken diğer sonuçlar 200 cevapta kalmalı.
- `/api/scan` eski consumer için aynı zorunlu alanları döndürmeli.
- `/api/intelligence` 25 üzeri hostu 400 ile reddetmeli.
- Aynı IP'ye çözülen farklı hostlar tek Shodan çağrısı üretmeli.
- Shodan-only port “pasif”, aktif taramada bulunan port “canlı” olmalı.
- Shared-edge Shodan CVE'si hedef zafiyeti sayılmamalı.

### UI testleri

- Servis taraması ve intelligence taraması ayrı durumlarla ilerlemeli.
- İptal sonrası bütün loading bayrakları kapanmalı.
- Tek sağlayıcı 429 aldığında ekran ve diğer butonlar çalışmaya devam etmeli.
- Uzun ürün/sürüm/etiket dizileri mobilde yatay taşma oluşturmamalı.
- Eski cache verisi intelligence alanı olmadan açılabilmeli.
- Cloudflare yalnız WAF/topoloji bağlamında görünmeli, servis teknolojisi olarak tekrarlanmamalı.

### Canlı smoke test

- CI gerçek sağlayıcıları çağırmamalı; fixture kullanmalı.
- Gerçek API testi yalnız manuel script ve yetkili domainlerle yapılmalı.
- Anahtarlar ve ham cevaplar terminal/CI artifact/log içine yazılmamalı.

## 14. Kabul kriterleri

Bu ilave aşağıdakilerin tamamı sağlandığında bitmiş sayılır:

- [ ] Beş kaynağın keşif katkısı mevcut davranışı bozmadan sürüyor.
- [ ] Shodan DNS cevabındaki kayıt/tarih bilgisi kaybolmuyor.
- [ ] Her benzersiz güncel genel IP cache miss durumunda en fazla bir kez Shodan'a soruluyor.
- [ ] Shodan portları, ürün/sürüm/ASN/org ve son gözlem zamanı normalize ediliyor.
- [ ] Shodan pasif portu canlı doğrulanmış port gibi gösterilmiyor.
- [ ] CDN/shared-edge IP'leri açıkça işaretleniyor ve hedef origin sanılmıyor.
- [ ] VT analiz sayıları, itibar, kategori, etiket ve tarihler gösterilebiliyor.
- [ ] OTX passive DNS ilişki/tarihleri ve sınırlı pulse özeti gösterilebiliyor.
- [ ] SecurityTrails history erişimi yoksa sistem `plan-restricted` ile çalışmaya devam ediyor.
- [ ] Chaos keşif kaynağı olarak eksiksiz çalışıyor.
- [ ] Pagination ve tarama bütçesi sınırları kullanıcıya görünür.
- [ ] Raw banner, raw HTML, API anahtarı ve WHOIS PII API cevabına girmiyor.
- [ ] Provider hatası bütün domain taramasını düşürmüyor.
- [ ] `neoportfoy.com.tr` benzeri büyük sonuç setinde UI donmuyor; iptal çalışıyor.
- [ ] Backend testleri, frontend build ve kontrollü üretim smoke testi başarılı.

## 15. Riskler ve geri dönüş

| Risk | Önlem |
|---|---|
| API kotasının hızlı tükenmesi | Cache, single-flight, sayfa/IP bütçesi, rate limit |
| Büyük JSON/localStorage şişmesi | Normalize özet; raw banner/WHOIS yok; TTL ve schema version |
| CDN IP'sinin origin sanılması | `shared-edge` sınıfı; geçmiş IP'ye otomatik tarama yok |
| Sağlayıcı plan farkı | Capability script, feature flag, `plan-restricted` durumu |
| Render timeout/donma | 25'lik batch, 2 eşzamanlı provider işi, ayrı iptal sinyali |
| Bir API'nin tüm taramayı bozması | `allSettled` semantiği ve kaynak bazlı hata |
| Yanlış pozitif CVE/tehdit | Kaynak/tarih görünürlüğü; “pasif/doğrulanmadı” etiketi |

Geri dönüş için özellikler `INTELLIGENCE_ENABLED=false` ve sağlayıcı bazlı flag'lerle kapatılabilir.
Mevcut `/api/scan`, 45 portlu `/api/analyze` ve frontend servis sonuçları bu flag kapalıyken aynen
çalışmaya devam etmelidir.

## 16. Resmî teknik referanslar

- [Shodan REST API — host information, search ve domain DNS](https://developer.shodan.io/api)
- [VirusTotal Domain object alanları](https://docs.virustotal.com/reference/domains-object)
- [VirusTotal subdomain ilişkisi ve cursor](https://docs.virustotal.com/reference/domain-object-subdomains)
- [VirusTotal domain resolution geçmişi](https://docs.virustotal.com/reference/domain-object-resolutions)
- [SecurityTrails API genel bakış](https://docs.securitytrails.com/docs/overview)
- [SecurityTrails DNS history](https://docs.securitytrails.com/reference/dns-history-by-record-type-old-1)
- [SecurityTrails subdomain listesi](https://docs.securitytrails.com/reference/list-subdomains-old-1)
- [ProjectDiscovery Chaos kullanım belgesi](https://docs.projectdiscovery.io/opensource/chaos/usage)
- [AlienVault OTX resmî Python SDK](https://github.com/AlienVault-OTX/OTX-Python-SDK)

## 17. Nihai öneri

Önce Shodan'ı tek başına UI'ya ekleyip sonra diğerlerini rastgele genişletmek yerine şu sıra
uygulanmalıdır:

1. Veri sözleşmesi + fixture testleri.
2. Mevcut cevaplarda zaten gelen veriyi koruma.
3. Kota/cache/güvenlik katmanı.
4. Shodan benzersiz IP zenginleştirmesi ve canlı/pasif ayrımı.
5. VT + OTX tehdit bağlamı.
6. Yetki varsa SecurityTrails geçmişi.
7. UI ve üretim yük testi.

Bu sıra hem mevcut arayüzü ve 45 port taramasını korur hem de “beş API bağlı ama verinin çoğu
kullanılmıyor” sorununu ölçülebilir ve geri alınabilir adımlarla çözer.
