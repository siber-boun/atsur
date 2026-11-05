# ATSUR — Pasif OSINT konsolu

*at sürenindir*

ATSUR, hedef bir şirketin alan adı üzerinden pasif subdomain taraması yapan, bulunan subdomain'lerde çalışan web servislerini analiz eden ve sonuçları bulgulara dönüştüren bir Açık Kaynak İstihbarat (OSINT) konsoludur.

🚀 **Canlı Uygulama:** [osint.busiber.workers.dev](https://osint.busiber.workers.dev/)

## Arayüz

Sol menüden ayrı sayfalara ulaşılır; aktif hedef üst bardaki seçiciden değiştirilir.

- **Dashboard:** varlık, canlı host, web servisi, teknoloji ve bulgu sayıları; tarama hattı; TLS ve güvenlik başlığı not dağılımı; en riskli hostlar; e-posta güvenliği; keşif kaynakları; kapsam özeti.
- **Varlıklar:** tüm subdomain'ler tek tabloda (durum, IP, portlar, HTTP, TLS, başlık, WAF, teknoloji, bulgu); arama, durum, port, teknoloji ve "bulgusu olanlar" filtreleri; satıra tıklayınca sağda detay paneli.
- **Bulgular:** tarama verisinden kurallarla türetilen bulgular (Yüksek / Orta / Düşük / Bilgi). Doğrulanmış zafiyet değildir.
- **Teknolojiler:** kategoriye göre tespit edilen bileşenler ve kullanıldıkları hostlar.
- **Kapsam:** aktif web servisi doğrulanan hedeflerden pentest kapsamı ve kapsam dışı kalanların gerekçesi.
- **AI Analiz:** tarama özetini seçilen yapay zekâ sağlayıcısıyla (Claude, ChatGPT, Gemini, OpenRouter, OpenCode) yorumlar; rapor ve soru-cevap. Kurulum: [AI_SETUP.md](server/AI_SETUP.md).
- **Hedefler:** hedef domain ekleme, silme ve durum.

## Özellikler

1. **Subdomain Keşfi:** crt.sh, Certspotter, RapidDNS, HackerTarget ve anahtarlı kaynaklar (SecurityTrails, VirusTotal, Shodan, …) üzerinden subdomain'leri bulur; DNS ile doğrular, wordlist/permütasyon ile genişletir.
2. **Web Servisi & Port Analizi:** Bulunan her subdomain için 45 web, panel ve servis portunu (`shared/scanPorts.ts`) tarar.
3. **HTTP Durum Kodu Tespiti:** Açık portlara HEAD isteği atarak anlık durum kodunu (`200 OK`, `403 Forbidden`, `301 Redirect`) tespit eder.
4. **Cloudflare Tespiti:** WAF/Cloudflare arkasında olan web servislerini otomatik olarak tespit eder ve arayüzde özel bir rozet ile belirtir.
5. **Teknoloji Parmak İzi:** CMS, frontend, backend ve CDN imzalarını yanıt başlıklarından ve HTML gövdesinden tespit eder.
6. **TLS / Güvenlik Başlığı / WAF Analizi:** Sertifika geçerliliği, HTTP güvenlik başlığı skoru ve WAF tespiti yapar.
7. **E-Posta Güvenliği:** SPF / DMARC / DKIM kayıtlarını kontrol edip phishing riskine göre notlar.
8. **Akıllı Yönlendirme:** Bulunan açık portlara tıklandığında, sunucunun kullandığı protokole (HTTP veya HTTPS) göre doğru URL'yi oluşturarak yeni sekmede açar.
9. **Kullanıcı Bazlı Veri Saklama:** Giriş sunucu tarafında yapılır; tarama sonuçları, kapsamlar ve AI raporları tarayıcıda (`localStorage`) kullanıcıya özel saklanır.

## Mimari

*   **Frontend:** React, TypeScript, Vite
*   **Backend / API:** Node.js, Express.js
*   **Hosting:**
    *   Ön yüz **Cloudflare Workers** üzerinde barındırılmaktadır.
    *   Arka yüz (Tarama motoru ve Proxy) **Render.com** üzerinde barındırılmaktadır.

*Not: Render sunucuları 15 dakika boyunca kullanılmadığında uyku moduna geçer. Bu nedenle ilk tarama işlemi sırasında sunucunun uyanması ~40 saniye sürebilir.*

## Geliştirme

```bash
npm install && npm run dev       # Frontend -> http://localhost:5173
npm test                         # Frontend birim testleri (src/lib)
cd server && npm install && npm start   # Backend -> http://localhost:3001
cd server && npm test            # Backend testleri
```

> **Not:** Yayında tarayıcı aynı adresteki `/api` yoluna bağlanır; Worker istekleri sabit Render API'sine aktarır. Böylece tarayıcıda adresler arası CORS bağlantısı gerekmez. Geliştirmede `VITE_API_URL` boşken Vite istekleri `localhost:3001`'e proxy'ler; bu değişkenle farklı bir yerel API adresi seçilebilir.

## Giriş ve oturum kurulumu

Backend artık `OSINT_LOGIN_EMAIL` ve `OSINT_LOGIN_PASSWORD_HASH` olmadan başlamaz. Parola özeti üretimi, cookie oturumu ve birlikte dağıtım adımları için [AUTH_SETUP.md](server/AUTH_SETUP.md) belgesini izleyin. Yerelde Vite `/api` proxy'sini kullanmak için `VITE_API_URL` boş olmalıdır.
