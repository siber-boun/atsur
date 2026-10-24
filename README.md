# BUSIBER OSINT & Subdomain Finder

Bu proje, hedef bir şirketin alan adı üzerinden pasif subdomain taraması yapan ve bulunan subdomain'lerde çalışan web servislerini analiz eden bir Açık Kaynak İstihbarat (OSINT) platformudur.

🚀 **Canlı Uygulama:** [BUSIBER OSINT](https://osint.busiber.workers.dev/)

## Özellikler

1. **Subdomain Keşfi:** `crt.sh` sertifika şeffaflık logları ve HackerTarget üzerinden hedef domain için kaydedilmiş tüm subdomainleri bulur.
2. **Web Servisi & Port Analizi:** Bulunan her subdomain için yaygın olarak kullanılan 24 farklı HTTP/HTTPS/Panel portunu (`80`, `443`, `8443`, `8080`, `3000`, vb.) tarar.
3. **HTTP Durum Kodu Tespiti:** Açık portlara HEAD isteği atarak anlık durum kodunu (`200 OK`, `403 Forbidden`, `301 Redirect`) tespit eder.
4. **Cloudflare Tespiti:** WAF/Cloudflare arkasında olan web servislerini otomatik olarak tespit eder ve arayüzde özel bir rozet ile belirtir.
5. **Teknoloji Parmak İzi:** CMS, frontend, backend ve CDN imzalarını yanıt başlıklarından ve HTML gövdesinden tespit eder.
6. **TLS / Güvenlik Başlığı / WAF Analizi:** Sertifika geçerliliği, HTTP güvenlik başlığı skoru ve WAF tespiti yapar.
7. **E-Posta Güvenliği:** SPF / DMARC / DKIM kayıtlarını kontrol edip phishing riskine göre notlar.
8. **Akıllı Yönlendirme:** Bulunan açık portlara tıklandığında, sunucunun kullandığı protokole (HTTP veya HTTPS) göre doğru URL'yi oluşturarak yeni sekmede açar.
9. **Kullanıcı Bazlı Veri Saklama:** Tarayıcı hafızasında (`localStorage`) birden fazla kullanıcı profili oluşturulabilir. Yapılan tüm taramalar kullanıcıya özel olarak saklanır.

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
cd server && npm install && npm start   # Backend -> http://localhost:3001
```

> **Not:** Yayında tarayıcı aynı adresteki `/api` yoluna bağlanır; Worker istekleri sabit Render API'sine aktarır. Böylece tarayıcıda adresler arası CORS bağlantısı gerekmez. Geliştirmede `VITE_API_URL` boşken Vite istekleri `localhost:3001`'e proxy'ler; bu değişkenle farklı bir yerel API adresi seçilebilir.

## Giriş ve oturum kurulumu

Backend artık `OSINT_LOGIN_EMAIL` ve `OSINT_LOGIN_PASSWORD_HASH` olmadan başlamaz. Parola özeti üretimi, cookie oturumu ve birlikte dağıtım adımları için [AUTH_SETUP.md](server/AUTH_SETUP.md) belgesini izleyin. Yerelde Vite `/api` proxy'sini kullanmak için `VITE_API_URL` boş olmalıdır.
