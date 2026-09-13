# Faz 0 — Dizin düzleştirme + repo hijyeni

> Ön okuma: `plan/anaplan.md`. Bu faz **kod mantığına dokunmaz**, yalnızca dosyaları taşır ve
> birkaç küçük hijyen düzeltmesi yapar.

## 1. Amaç

Repo bugün tek bir projeden oluşuyor ama tüm uygulama `dns-platform/` adlı bir alt klasörün
içinde duruyor. Bu klasör adı `npm create vite dns-platform` komutunun artığı; proje DNS'ten
çok daha fazlasını yapıyor (port tarama, HTTP header analizi, TLS, teknoloji tespiti) ve bir
"platform" değil. Alt klasörün var olması için teknik bir sebep de kalmadı.

Bu fazda `dns-platform/` içeriği repo köküne taşınır. Sonuç: `subdomainfinder/{src, server, ...}`.

**Bu faz neden ilk sırada:** Faz 1 backend'i ~30 yeni dosyaya bölecek. Önce içerik değiştirip
sonra taşınırsa git'in rename takibi bozulur ve diff'ler okunamaz hâle gelir. Taşıma, içeriğin
hiç değişmediği tek bir commit olmalıdır.

## 2. Ön koşullar

- Çalışma ağacı temiz (`git status` boş).
- **Render.com paneline erişim.** Bu fazın en kritik adımı repoda değil, Render panelindedir.
- GitHub Pages deploy'unun çalışır durumda olduğu teyit edilmiş olmalı (son workflow yeşil).

## 3. Kapsam

**Yapılacaklar**
- `dns-platform/*` → repo köküne taşıma (git history korunarak).
- `.github/workflows/deploy.yml` içindeki 5 yol referansının güncellenmesi.
- Render panelindeki **Root Directory** ayarının güncellenmesi.
- `package.json` `name` alanı: `dns-platform` → `subdomainfinder`.
- `index.html` `<title>`: `dns-platform` → anlamlı bir başlık (tarayıcı sekmesinde görünüyor).
- `.env`'in git takibinden çıkarılıp `.gitignore`'a alınması.
- `CLAUDE.md`'deki `/api/analyze?subdomain=` → `?domain=` düzeltmesi ve yol referanslarının güncellenmesi.

**Bilinçli olarak yapılmayacaklar**
- Hiçbir kod mantığı değişmeyecek. Tek satır iş mantığı dokunulmayacak.
- `src/` veya `server/` içindeki dosyalar yeniden adlandırılmayacak.
- Bağımlılık güncellemesi yapılmayacak.
- `vite.config.ts`'teki `base: '/subdomainfinder/'` **değişmeyecek** (GitHub Pages URL'i buna bağlı).

## 4. Dosya manifestosu

**Taşınacak** (içerik değişmeden):
```
dns-platform/src/            -> src/
dns-platform/server/         -> server/
dns-platform/public/         -> public/
dns-platform/index.html      -> index.html
dns-platform/package.json    -> package.json
dns-platform/package-lock.json -> package-lock.json
dns-platform/vite.config.ts  -> vite.config.ts
dns-platform/tsconfig*.json  -> tsconfig*.json
dns-platform/eslint.config.js -> eslint.config.js
dns-platform/.gitignore      -> (kökteki .gitignore ile birleştirilecek)
dns-platform/README.md       -> (kökteki README.md ile karşılaştırılıp tekilleştirilecek)
dns-platform/.env            -> .env  (git takibinden çıkarılacak)
```

**Değiştirilecek:**
| Dosya | Değişiklik |
|---|---|
| `.github/workflows/deploy.yml` | 28, 30, 33, 36, 43. satırlar |
| `package.json` | `"name": "dns-platform"` → `"subdomainfinder"` |
| `index.html` | `<title>dns-platform</title>` → `<title>BUSIBER OSINT Platform</title>` |
| `.gitignore` | `.env` ve `dist` satırlarının kökte olduğundan emin ol |
| `CLAUDE.md` | Yol referansları + `?subdomain=` → `?domain=` düzeltmesi |

**Repo dışı:** Render panelinde **Root Directory** ayarı.

## 5. Teknik detay

### 5.1 Taşıma

`git mv` kullanın; git rename'i otomatik algılar ve history korunur.

```bash
git mv dns-platform/src src
git mv dns-platform/server server
git mv dns-platform/public public
git mv dns-platform/index.html dns-platform/package.json dns-platform/package-lock.json .
git mv dns-platform/vite.config.ts dns-platform/eslint.config.js .
git mv dns-platform/tsconfig.json dns-platform/tsconfig.app.json dns-platform/tsconfig.node.json .
```

`.env` git'te **izleniyor** (bu bir hatadır, Faz 4'te API anahtarları eklenmeden önce düzeltilmeli):

```bash
git rm --cached dns-platform/.env
mv dns-platform/.env .env
# .gitignore'da .env satırının bulunduğunu doğrulayın
```

`node_modules` taşınmaz; taşıma sonrası kökte `npm install` ve `server/`'da `npm install` çalıştırın.

### 5.2 `deploy.yml` güncellemesi

Mevcut 5 referans:

| Satır | Şu an | Olacak |
|---|---|---|
| 28 | `cache-dependency-path: dns-platform/package-lock.json` | `cache-dependency-path: package-lock.json` |
| 30 | `working-directory: ./dns-platform` | *(satırı sil — kök zaten çalışma dizini)* |
| 33 | `working-directory: ./dns-platform` | *(satırı sil)* |
| 36 | `working-directory: ./dns-platform` | *(satırı sil)* |
| 43 | `path: './dns-platform/dist'` | `path: './dist'` |

> `working-directory` satırları tamamen silinebilir çünkü varsayılan çalışma dizini repo köküdür.

### 5.3 ⚠ Render Root Directory — bu fazın en kritik adımı

Backend, GitHub Pages workflow'u tarafından deploy **edilmez**; Render.com'da ayrı bir servistir.
Render panelinde servisin **Root Directory** ayarı büyük olasılıkla `dns-platform/server` değerindedir.
Bu ayar repoda görünmez ve otomatik güncellenmez.

**Taşımayı push etmeden önce veya hemen sonrasında** Render panelinden:
- Root Directory: `dns-platform/server` → `server`
- Build/Start komutlarının hâlâ doğru olduğunu doğrulayın (`npm install` / `npm start`).

Bu adım atlanırsa **backend deploy'u sessizce kırılır**: eski sürüm çalışmaya devam eder, yeni
deploy'lar başarısız olur ve bu durum frontend'de yalnızca "tarama başarısız" olarak görünür.

### 5.4 README tekilleştirme

Kökte ve `dns-platform/` içinde iki README var ve ikisi de aynı uygulamayı anlatıyor. Kökteki
korunmalı, `dns-platform/README.md` incelenip içinde kökte olmayan bilgi varsa taşınmalı,
sonra silinmelidir.

### 5.5 `CLAUDE.md` düzeltmeleri

- Tüm `dns-platform/` yol referansları güncellenecek.
- **Hata düzeltmesi:** Endpoint tablosunda `/api/analyze?subdomain=` yazıyor; doğrusu `?domain=`
  (kod `req.query.domain` okuyor, `index.ts:185`; `App.tsx:247` `?domain=` gönderiyor).
- "Local dev gotcha" bölümündeki `dns-platform/.env` referansı `.env` olacak.

## 6. Kabul kriterleri

- [ ] `git status` temiz; `git log --follow src/App.tsx` taşımadan önceki geçmişi gösteriyor.
- [ ] Repo kökünde `dns-platform/` klasörü **yok**.
- [ ] `npm install && npm run build` kökte hatasız tamamlanıyor.
- [ ] `cd server && npm install && npm start` çalışıyor, `/health` 200 dönüyor.
- [ ] `grep -rn "dns-platform" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" --include="*.yml" . | grep -v node_modules | grep -v package-lock` **boş çıktı** veriyor.
- [ ] `git ls-files | grep "\.env"` **boş çıktı** veriyor (`.env` artık izlenmiyor).
- [ ] Tarayıcı sekmesinde başlık artık `dns-platform` değil.
- [ ] **GitHub Pages workflow'u yeşil** ve https://siber-boun.github.io/subdomainfinder/ açılıyor.
- [ ] **Render'da manuel deploy tetiklendi, başarılı oldu ve `/health` 200 döndü.**
- [ ] Canlı uygulamada bir domain taraması uçtan uca çalışıyor (frontend → Render backend).

## 7. Doğrulama adımları

```bash
# 1. Taşıma sonrası yapı
ls -la                       # src/, server/, package.json kökte görünmeli
test ! -d dns-platform && echo "OK: dns-platform yok"

# 2. Artık referans kalmamalı
grep -rn "dns-platform" --include="*.ts" --include="*.tsx" --include="*.json" \
  --include="*.md" --include="*.yml" --include="*.html" . 2>/dev/null \
  | grep -v node_modules | grep -v package-lock

# 3. .env artık izlenmiyor
git ls-files | grep "\.env"   # boş olmalı

# 4. Build
npm install && npm run build

# 5. Backend
cd server && npm install && npm start &
sleep 5 && curl -s -o /dev/null -w "health: %{http_code}\n" http://localhost:3001/health

# 6. Lokal uçtan uca (.env'deki VITE_API_URL'i yorum satırı yapın!)
npm run dev   # http://localhost:5173/subdomainfinder/ açılmalı, tarama çalışmalı
```

**Deploy doğrulaması (push sonrası):**
1. GitHub Actions → workflow yeşil mi?
2. https://siber-boun.github.io/subdomainfinder/ açılıyor mu?
3. Render paneli → son deploy başarılı mı? Root Directory `server` mı?
4. `curl https://subdomainfinder-da2l.onrender.com/health` → 200 (ilk istek ~40 sn sürebilir).
5. Canlı arayüzden bir domain taraması yap → sonuç dönüyor mu?

## 8. Devir kontratı

Faz 1 ve sonrası bu yolları sabit kabul eder:

```
src/App.tsx            (eski: dns-platform/src/App.tsx)
src/index.css          (eski: dns-platform/src/index.css)
server/index.ts        (eski: dns-platform/server/index.ts)
server/package.json    (eski: dns-platform/server/package.json)
package.json           (eski: dns-platform/package.json)
vite.config.ts         (eski: dns-platform/vite.config.ts)
```

> **Sonraki tüm faz dosyaları bu yolları kullanır.** Faz 0 tamamlanmadan diğer fazlardaki
> dosya yolları geçerli değildir.

## 9. Riskler ve geri alma

| Risk | Belirti | Çözüm |
|---|---|---|
| Render Root Directory güncellenmedi | Backend deploy başarısız; canlı arayüzde "tarama başarısız" | Render panelinden Root Directory'yi `server` yap, manuel deploy tetikle |
| `deploy.yml` eksik güncellendi | Actions kırmızı, "no such file or directory" | 5 referansın hepsini kontrol et (28/30/33/36/43) |
| `vite.config.ts`'teki `base` yanlışlıkla değiştirildi | Pages'te beyaz sayfa, 404 asset hataları | `base: '/subdomainfinder/'` olmalı, değiştirmeyin |
| `.env` yanlışlıkla silindi | Lokal dev prod backend yerine boş URL'e gider | `.env` içeriği tek satır: `VITE_API_URL=https://subdomainfinder-da2l.onrender.com` |

**Geri alma:** Bu faz tek commit olduğu için `git revert <commit>` yeterlidir. Render Root
Directory ayarı da elle geri alınmalıdır (repo revert'i paneli değiştirmez).
