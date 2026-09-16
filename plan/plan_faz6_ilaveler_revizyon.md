# Faz 6 İlave Revizyonu — Render HTTP Evidence ve urlscan

> Cloudflare Worker bazı hedeflerde geç yanıt verdiği için alternatifler
> değerlendirildi. Bu revizyonda Worker ve Browserless kaldırılır; Render ana
> canlı HTTP/HTTPS probe, urlscan kontrollü fallback ve pasif enrichment
> kaynağıdır.

## Amaç ve değişmeyen sınırlar

Mevcut 45 portluk TCP taraması değişmez. `shared/scanPorts.ts` tek kaynak olmaya
devam eder. TCP açık olmayan portta application-layer istek yapılmaz; web adayı
olmayan açık portlara da HTTP isteği gönderilmez. `/api/analyze` ve
`/api/advanced` korunur; yeni bir scan endpointi oluşturulmaz.

Shodan yalnız `shodan-passive` OSINT kaynağıdır: subdomain keşfi ile pasif
servis/teknoloji gözlemi sağlayabilir, fakat canlı HTTP, TLS, header veya WAF
kanıtı yerine geçmez.

## Evidence akışı

1. TCP açık web-adayı portta Render, öncelikli HTTP/HTTPS protokolünü; gerekirse
   alternatif protokolü dener. Her gerçek HTTP yanıtı (401, 403, 404 ve 500
   dahil) web servis kanıtıdır.
2. Render timeout, bağlantı veya TLS/protokol hatası üretirse birincil HTTPS
   (`443`) için urlscan `URLSCAN_API_KEY` ile private görünürlükte kontrollü
   fallback olarak değerlendirilir. Başarılı Render yanıtında çağrılmaz; panel
   portlarında otomatik harici scan başlatılmaz.
3. `/api/advanced`, mevcut bellek kanıtını yeniden kullanır. Her advanced
   analizde `URLSCAN_API_KEY` ile urlscan pasif technology enrichment çalışır;
   canlı bulguların üzerine yazmaz.

Ortak `HttpEvidence` kaynağı `render-live` veya `urlscan` olur.
Status, temizlenmiş yönlendirme/final hedef, güvenlik header analizi, WAF,
cookie flag'leri, fingerprint, okunmuş byte, truncation ve zaman bilgisini
taşır. HTML, cookie değeri/adı, authorization verisi ve URL query parametreleri
API cevabına girmez.

## Güvenlik ve yönlendirme

- HTML fingerprint için en fazla 128 KB okunur.
- En fazla üç HTTP/HTTPS yönlendirmesi izlenir; her hedef DNS ve SSRF kontrolünden
  yeniden geçer.
- IP literal, localhost/özel/rezerve adresler, metadata hedefleri ve içinde
  `proxy` geçen hostlar reddedilir.
- Dış domaine yönlendirme ilk hedefin güvenlik veya teknoloji puanına karışmaz;
  `externalRedirect` olarak ayrı gösterilir ve scope'a eklenmez.
- Eksik security header bir yapılandırma bulgusudur, doğrulanmış zafiyet değildir.
- TLS hakkında canlı kanıtla elde edilmeyen issuer, cipher, gün sayısı veya grade
  üretilmez.

## Worker kaldırma

`worker/`, Worker evidence adapter'ı, `/api/http-evidence`, KV, rate limiter ve
`wrangler.jsonc` Worker routing/binding tanımları kaldırılır. Browserless adapter'
ı da kaldırılır; arayüzde fallback kaynağı urlscan olarak görünür.

## Kabul testleri

- 45 TCP port ve TCP concurrency davranışı korunur.
- Açık web portlarında 200, redirect, 401, 403, 404 ve 500; timeout, bağlantı ve
  TLS hataları doğru sınıflanır.
- Render başarılıyken urlscan çağrılmaz; başarısızsa private urlscan sonucu
  `urlscan` olarak görünür.
- Cookie/HTML/secret sanitization, 128 KB sınırı, WAF/header/fingerprint ve
  redirect-SSRF testleri geçer.
- urlscan ayrı pasif evidence olarak gelir; Shodan canlı güvenlik alanlarını
  doldurmaz.
- Backend testleri, frontend ve production build, Render dağıtım testi geçer.
