# OSINT Arayüz Tasarım Süreci

## Amaç

Mevcut BUSIBER OSINT uygulamasının işlevlerini koruyarak arayüzü Figma Make üzerinde hazırlanan **OSINT Dashboard** tasarım diline yaklaştırmak amaçlandı.

Tasarım referansı:

<https://www.figma.com/make/PgqV5o03EYV6jgA6hfzx8y/OSINT-Dashboard?t=4T01a6M4TfRANyP3-1>

Korunan temel ürün akışı:

1. Kullanıcı üstteki komut alanına bir domain girer.
2. Eklenen domain sol taraftaki hedef listesinde görünür.
3. Kullanıcı hedef domaini seçer.
4. Pasif keşif ve güvenlik analizleri çalışır.
5. Analiz sonuçları sağ taraftaki geniş çalışma alanında gösterilir.
6. Domainler ve önbelleğe alınan sonuçlar kullanıcıya özel olarak `localStorage` içinde saklanmaya devam eder.

## 1. Figma referansının incelenmesi

Figma Make tasarımının iki temel durumu incelendi:

- Hedef seçilmemiş boş ekran
- Arama yapılmış ve varlıkların gösterildiği sonuç ekranı

Figma bağlantısındaki dosya bağlı hesapta yalnızca görüntüleme yetkisine sahip olduğu için MCP üzerinden düzenlenebilir tasarım bağlamı alınamadı. Bunun yerine herkese açık Figma Make önizlemesi gerçek tarayıcıda açıldı; HTML yapısı, hesaplanmış stiller, fontlar ve animasyonlar canlı prototip üzerinden doğrulandı.

Referansta gözlemlenen temel yapı:

- Üstte sabit komut ve arama çubuğu
- Solda hedef/varlık listesi
- Sağda geniş analiz yüzeyi
- Altta ince sistem durum çubuğu
- Boş durumda merkezde radar benzeri hedef bekleme göstergesi
- Sonuç durumunda teknik veri kartları ve aktif sistem sinyalleri

## 2. Görsel sistem

Figma referansından aşağıdaki renk rolleri çıkarıldı ve CSS değişkenlerine uyarlandı:

| Rol | Renk |
|---|---|
| Ana arka plan | `#080b10` |
| Panel arka planı | `#0d1117` |
| Yükseltilmiş yüzey | `#161b22` |
| Sınır ve grid çizgileri | `#21262d` |
| İkincil metin | `#7d8590` |
| Ana vurgu | `#00e5d4` |
| Başarı | `#2ecc71` |
| Uyarı | `#e3a008` |
| Hata | `#ff5b5b` |

Renkler dekoratif bir tema olarak değil, operasyon durumlarını anlatmak için kullanıldı:

- Neon turkuaz: aktif kontrol, seçili hedef ve sistem sinyali
- Yeşil: başarılı veya canlı sonuç
- Sarı: bekleyen ya da uyarı durumu
- Kırmızı: hata veya erişilemeyen varlık
- Gri: pasif, ikincil veya henüz işlenmemiş bilgi

## 3. Tipografi

Figma prototipinde iki ayrı tipografi rolü tespit edildi:

- **Inter:** ana başlıklar ve okunabilir arayüz metinleri
- **JetBrains Mono:** domainler, IP adresleri, sayaçlar, rozetler, durum mesajları ve teknik veriler

Fontlar Google Fonts üzerinden projeye eklendi. Sistem fontları yedek olarak tanımlandı.

Bu ayrım sayesinde başlıklar rahat okunurken teknik veriler terminal ve güvenlik konsolu hissini korudu.

## 4. Yerleşim kararı

Dashboard aşağıdaki görev alanlarına ayrıldı:

```text
┌──────────────────────────────────────────────────────────────┐
│ OSINTCORE │ Domain ekleme komutu              │ Sistem/Profil │
├───────────┬──────────────────────────────────────────────────┤
│           │                                                  │
│ Hedef     │              Analiz sonuçları                    │
│ domainler │                                                  │
│           │                                                  │
├───────────┴──────────────────────────────────────────────────┤
│ IDLE / ACTIVE              Hedef sayısı             Sürüm    │
└──────────────────────────────────────────────────────────────┘
```

Son kullanıcı geri bildirimiyle sol panel sadeleştirildi:

- Sol panelde yalnızca hedef domainler bırakıldı.
- Kullanıcı e-postası ve çıkış alanı sol panelden kaldırıldı.
- Çıkış işlevi, üst sağdaki kullanıcı avatarına taşındı.
- Sağ taraf yalnızca seçili domainin analiz sonucu için kullanıldı.

## 5. Domain ekleme ve analiz akışı

Mevcut React state yönetimi ve API mantığı değiştirilmedi. Yalnızca bu işlevlerin arayüzdeki konumu ve görsel sunumu güncellendi.

Domain akışı:

```text
Domain gir
    ↓
Geçerlilik kontrolü
    ↓
Sol hedef listesine ekle
    ↓
Hedefi seç
    ↓
Pasif keşif ve DNS doğrulama
    ↓
Sağ panelde sonuçları göster
```

Korunan işlevler:

- Domain regex doğrulaması
- Aynı domainin tekrar eklenmesinin engellenmesi
- Kullanıcıya özel domain listesi
- Subdomain sonuç önbelleği
- Domain silme
- Yeniden tarama
- Servis ve port analizi
- Teknoloji tespiti
- TLS, güvenlik başlığı ve WAF analizi
- Kapsam oluşturma

## 6. Boş durum tasarımı

Henüz hedef seçilmediğinde sağ analiz alanında radar görseli gösterildi.

Boş durum mesajı kullanıcıya iki şeyi açıkça anlatır:

1. Üstteki komut alanından domain eklenebileceği
2. Eklenen hedefin soldan seçilerek analizin başlatılacağı

Hızlı deneme için `example.com`, `iana.org` ve `github.com` örnekleri eklendi. Bu düğmeler yalnızca giriş alanını doldurur; kullanıcı onayı olmadan tarama başlatmaz.

## 7. Animasyonlar

Figma Make prototipindeki hareket süreleri canlı tarayıcıdan ölçüldü ve uygulamaya aktarıldı:

| Animasyon | Süre | Kullanım amacı |
|---|---:|---|
| Radar ping | 3 saniye | Sistemin hedef beklediğini anlatır |
| Fade-in | 300 ms | Yeni sonuç veya görünüm değişimini açıklar |
| Active pulse | 2 saniye | Sistem ve tarama durumunun aktif olduğunu gösterir |
| Target-in | 300 ms | Yeni domainin sol listeye eklendiğini görünür kılar |

Animasyonlar `prefers-reduced-motion` medya sorgusuna uygun olarak azaltılabilir veya kapatılabilir.

## 8. Responsive davranış

Masaüstünde sol panel ve sağ analiz alanı yan yana çalışır.

Mobil görünümde:

- Üst komut çubuğu tek satırda korunur.
- Logo yalnızca işaret olarak gösterilir.
- Sol hedef listesi üstte kompakt bir bölüme dönüşür.
- Analiz sonuçları listenin altında tek sütun halinde gösterilir.
- Durum çubuğu ekranın altında kalır.

390 px genişlikte yapılan kontrolde yatay taşma olmadığı doğrulandı:

```text
viewport: 390 px
document scrollWidth: 390 px
```

## 9. Tasarım süreci sunumu

Süreci ekran kaydına almak için uygulamaya ayrı bir sunum görünümü eklendi:

<http://127.0.0.1:5173/?view=design-process>

Sunum altı aşamadan oluşur:

1. Figma Make tasarımının incelenmesi
2. Görsel tokenların çıkarılması
3. Ekranın görev alanlarına ayrılması
4. Mevcut ürün akışının korunması
5. Animasyonların durumlara bağlanması
6. Üretim ve responsive doğrulama

Her aşama dört saniye boyunca gösterilir. Sunum durdurulabilir, manuel olarak bir aşama seçilebilir veya **Baştan oynat** düğmesiyle yeniden başlatılabilir.

Ekran kaydı önerisi:

1. Sunum URL'sini açın.
2. Tarayıcıyı tam ekran yapın.
3. Ekran kaydını başlatın.
4. Sağ üstteki **Baştan oynat** düğmesine basın.
5. Altı aşamanın otomatik tamamlanmasını bekleyin.

## 10. Değiştirilen dosyalar

### `src/App.tsx`

- Üst komut çubuğu eklendi.
- Domain formu komut çubuğuna taşındı.
- Sol hedef paneli sadeleştirildi.
- Radar boş durumu eklendi.
- Alt sistem durum çubuğu eklendi.
- Kullanıcı çıkışı üst avatara taşındı.
- Figma–React tasarım süreci sunumu eklendi.

### `src/index.css`

- Figma renk tokenları tanımlandı.
- Inter ve JetBrains Mono fontları eklendi.
- Masaüstü ve mobil dashboard yerleşimleri oluşturuldu.
- Sonuç kartları, rozetler ve teknik tablolar yeniden biçimlendirildi.
- Radar, fade, pulse ve listeye giriş animasyonları eklendi.
- Tasarım süreci sunumunun görsel sistemi ve animasyonları oluşturuldu.
- Hareket azaltma ve responsive kuralları eklendi.

## 11. Doğrulama

Uygulanan kontroller:

- TypeScript üretim derlemesi
- Vite üretim paketi
- CSS whitespace ve diff kontrolü
- Masaüstü boş durum renderı
- Domainin sol listede görünmesi
- Sahte API yanıtıyla sonuç ekranı
- 390 px mobil sonuç ekranı
- Font ailesi ve vurgu rengi kontrolü
- Animasyon sürelerinin programatik kontrolü
- Yatay taşma kontrolü

Son üretim derlemesi başarıyla tamamlandı:

```text
npm run build
✓ TypeScript build
✓ Vite production build
```

Repo genelindeki lint komutu, tasarım çalışmasından önce mevcut olan TypeScript/ESLint sorunları nedeniyle başarısız olmaya devam etmektedir. Arayüz üretim derlemesi başarılıdır.

## 12. Servis ve güvenlik sonuçlarının yeniden gruplandırılması

Kullanım sırasında servis keşfi ile güvenlik değerlendirmesinin aynı varlık kartında iç içe geçtiği görüldü. Özellikle Cloudflare bilgisi hem basit servis taramasında hem de WAF sonucunda gösteriliyor; HTTP Header Güvenliği ise hem varlık kartlarında hem gelişmiş analiz tablosunda tekrar ediyordu. Uzun hedef listelerinde **Tam kapsamlı analiz** ve **Kapsam oluştur** eylemleri sayfanın altında kaldığı için bulunmaları da zorlaşıyordu.

Bu gözlemler sonucunda bilgi mimarisi aşağıdaki şekilde güncellendi:

```text
Aktif hedef
├── Servisleri tara
├── Tam kapsamlı analiz
├── Kapsam oluştur
└── Yenile

Servis keşfi
└── IP · Port · HTTP durumu · Teknoloji

Tam kapsamlı analiz
└── HTTP Header · SSL · WAF · E-posta güvenliği
```

### Üst eylem grubu

- **Servisleri tara**, **Tam kapsamlı analiz** ve **Kapsam oluştur** butonları aktif hedef başlığına taşındı.
- Yenile işlemi ayrı bir ikon düğmesi olarak en sağda bırakıldı.
- Devam eden taramalar sırasında çakışabilecek eylemler pasif hale getirildi.
- **Kapsam oluştur**, servis taraması tamamlanana kadar pasif kalır ve kullanıcıya önce servisleri taraması gerektiğini açıklar.
- Mobil görünümde eylemler tek sütuna dönüşerek dokunma alanlarını korur.

### Servis keşfi

Servis kartları yalnızca ağ ve uygulama yüzeyini gösterir:

- IP adresi
- Açık web portları
- HTTP yanıt kodları
- Tespit edilen teknolojiler

Cloudflare rozeti, SSL bilgisi, HTTP Header skoru ve WAF bilgisi servis kartlarından kaldırıldı. Böylece servis keşfi “hangi sistemler erişilebilir?” sorusuna odaklandı.

### Cloudflare ve WAF gösterimi

Basit `isCloudflare` sinyali bir CDN veya ters proxy kullanımını gösterebilir; tek başına WAF'ın etkin olduğunu garanti etmez. Bu nedenle Cloudflare artık yalnızca gelişmiş analizin `waf` sonucunda tespit edilirse **WAF** sütununda gösterilir. Teknoloji listesindeki Cloudflare etiketi de tekrar oluşmaması için servis görünümünden filtrelendi.

### Tam kapsamlı analiz yüzeyi

Güvenlik bulguları ayrı ve daha belirgin bir yüzeyde toplandı. Üst özet şeridinde:

- Analiz edilen subdomain sayısı
- Ortalama HTTP Header güvenlik skoru
- Geçerli SSL sayısı
- WAF bulunan hedef sayısı

gösterilir.

Subdomain tablosunda HTTP Header sonucu artık yalnızca harf notuyla değil, `puan/100`, görsel skor çizgisi ve harf notu birlikte kullanılarak sunulur. Eksik header etiketleri, SSL durumu ve WAF sonucu aynı tabloda korunur. Cloudflare adı yalnızca WAF sonucu olarak tek yerde görünür.

Bu güncellemede Figma tabanlı görsel dil değiştirilmedi. Ana arka plan, panel renkleri, neon turkuaz vurgu, Inter ve JetBrains Mono rolleri, ince sınırlar ve operasyon konsolu karakteri aynen korundu.

## Sonuç

Figma Make referansındaki koyu OSINT konsolu dili, mevcut uygulamanın gerçek veri ve analiz işlevleriyle birleştirildi. Tasarım yalnızca görsel olarak kopyalanmadı; ürünün domain ekleme, hedef seçme ve analiz sonuçlarını inceleme görevlerine göre yeniden yapılandırıldı.

Son durumda:

- Domain girişi üstte hızlı erişilebilir durumdadır.
- Sol panel yalnızca hedef domainlere ayrılmıştır.
- Sağ panel analiz sonuçlarına odaklanır.
- Durumlar renk, tipografi ve hareketle ayırt edilir.
- Arayüz masaüstü ve mobil ekranlarda kullanılabilir.
- Tasarım süreci ayrıca kayıt alınabilir bir sunum ekranına dönüştürülmüştür.
