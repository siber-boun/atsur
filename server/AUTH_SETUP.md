# Sunucu taraflı tek hesap girişi

Render üzerinde şu iki ortam değişkeni zorunludur. Eksik/geçersiz ayarda API başlamaz:

- `OSINT_LOGIN_EMAIL`: yetkili hesabın e-posta adresi.
- `OSINT_LOGIN_PASSWORD_HASH`: aşağıdaki betiğin ürettiği değer.

Repo kökünde `node server/scripts/hash-password.mjs` çalıştırın. Yeni, en az 12 karakterli parolayı gizli terminal istemine girin. Betik scrypt (N=131072, r=8, p=1, 16 bayt rastgele salt) özeti üretir. Çıktıyı Render ortam değişkenine koyun; repoya veya frontend değişkenlerine eklemeyin. Önceki düşük maliyetli scrypt özetleri yeniden üretilmelidir. Eski frontend SHA-256 özeti artık kullanılmaz. Parolayı sohbet veya komut satırı argümanına yazmayın.

Frontend ve Worker aynı sürümde dağıtılmalıdır. Worker Cookie, Origin ve CSRF başlıklarını sabit Render adresine aktarır; Set-Cookie yanıtı tarayıcıya iletilir. Backend doğrudan erişimde de oturum ister. `/health`, POST `/api/auth/login` ve OPTIONS dışında tüm yollar korunur.

Oturum rastgele 32 bayt token ile sunucu belleğinde tutulur. Tarayıcıya yalnız `__Host-osint_session` isimli HttpOnly, Secure, SameSite=Strict, Path=/ cookie verilir. Mutlak ömür 2 saattir; girişte eski oturum iptal edilir, çıkışta silinir. Yeniden başlatma tüm oturumları düşürür. Çok instance için ortak session store gerekir. `OSINT_SESSION_SECRET` artık gerekmez.

Değiştiren isteklerde X-OSINT-Request: 1 ve giriş dışındaki işlemlerde oturuma bağlı X-CSRF-Token gerekir. Origin izin listesi ve cross-site Fetch Metadata kontrol edilir. Üretimde CORS_ALLOWED_ORIGINS yalnız güvenilen arayüz adreslerini içermelidir. CORS tek başına kimlik doğrulama değildir.

Yerel geliştirmede Vite `/api` proxy'sini kullanın; Secure cookie için tarayıcının localhost desteği veya yerel HTTPS gerekir. Ayrı cross-site VITE_API_URL bu Strict cookie tasarımının kullanım şekli değildir.

Bu değişiklik giriş denemesi sınırı ve kullanıcı kotası eklemez (kullanıcının seçtiği kapsam: 1, 2, 3, 5). Genel mevcut eşzamanlılık sınırı korunur. İnternete açık kullanımda sonraki güvenlik işi kötüye kullanım sınırlarıdır.
