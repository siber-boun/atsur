# Faz 6 İlave Revizyonu — Render ve Browserless doğrulaması

> Cloudflare Worker bazı hedeflerde geç yanıt verdiği için Browserless ve
> urlscan.io alternatifleri değerlendirildi. urlscan.io API hata/zaman aşımı
> ürettiği için bu akıştan çıkarıldı. Render ana probe olarak kalır; Browserless
> yalnız kullanıcının tarayıcısı hedefe eriştiğini doğruladığında devreye girer.

## Değişmeyen sınırlar

Mevcut 45 portluk TCP taraması ve `shared/scanPorts.ts` değişmez. TCP açık
olmayan portta application-layer istek yapılmaz; web adayı olmayan açık portlara
HTTP isteği gönderilmez. `/api/analyze` ve `/api/advanced` korunur; yeni scan
endpointi oluşturulmaz. Shodan yalnız `shodan-passive` OSINT kaynağıdır ve canlı
HTTP, TLS, header veya WAF kanıtı yerine geçmez.

## Evidence akışı

1. TCP açık web-adayı portta Render öncelikli HTTP/HTTPS protokolünü, gerekirse
   alternatifini dener. 401, 403, 404 ve 500 dahil tüm HTTP yanıtları web servis
   kanıtıdır.
2. Render HTTP kanıtı üretemezse arayüz, kullanıcı tarayıcısından HTTPS erişimini
   `no-cors` GET ile kontrol eder. Bu yalnız erişilebilirlik sinyalidir; HTML veya
   cookie verisi okunmaz.
3. Tarayıcı doğrulaması başarılıysa arayüz derhal
   `/api/advanced?browserVerified=1` çağrısı yapar. Render kanıtı hâlâ yoksa
   backend Browserless adapter'ını bir kez çalıştırır. Normal advanced çağrılar
   Browserless başlatmaz.
4. Browserless sonucu `browserless-live` kaynağıyla ortak `HttpEvidence` modeline
   yazılır. Başarısızlıkta güvenli hata kodu (`BROWSERLESS_UNCONFIGURED` vb.)
   gösterilebilir; tarayıcı doğrulaması korunur.

`BROWSERLESS_URL` ve `BROWSERLESS_API_KEY` Render ortamında tanımlı olmalıdır.
`URLSCAN_API_KEY` bu fazın HTTP/fingerprint/enrichment akışında kullanılmaz.

## Güvenlik ve veri sınırları

- En fazla üç yönlendirme izlenir; her hedef DNS ve SSRF kontrolünden geçer.
- IP literal, localhost/özel/rezerve adresler, metadata hedefleri ve `proxy`
  içeren hostlar reddedilir.
- HTML fingerprint en fazla 128 KB ile sınırlıdır. HTML, cookie değer/adı,
  authorization verisi ve URL query parametreleri API cevabına girmez.
- Genel HTTP yanıt başlıkları arayüzde gösterilir; `Set-Cookie`, `Cookie`,
  `Authorization`, `Proxy-Authorization` ve `WWW-Authenticate` filtrelenir.
- Dış yönlendirme, ilk hedefin bulgularına karıştırılmaz ve scope'a eklenmez.

## Kabul kriterleri

- 45 TCP port ve mevcut concurrency davranışı korunur.
- Render başarılıysa Browserless çağrılmaz.
- Browserless yalnız tarayıcı doğrulamasının ardından, Render kanıtı yoksa çağrılır.
- urlscan.io canlı fallback, enrichment ve kaynak çağrısı yapılmaz; Shodan pasif
  evidence olarak korunur.
