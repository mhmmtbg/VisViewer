# VisViewer

Visio (`.vsdx` / `.vsdm`) dosyalarını **açan, görüntüleyen ve düzenlemenize izin veren** kurulum gerektirmeyen uygulama.

- Tek dosya: `dist/VisViewer.html` — yalnızca Chrome/Edge yeterli; internet, Python, yönetici hakkı yok.
- Windows için: `dist/VisViewer.exe` — küçük bir başlatıcı. Yerel sunucu **başlatmaz**; gömülü uygulamayı diske yazıp Chrome/Edge'de pencere olarak açar.
- Dosyalar bilgisayarınızdan çıkmaz; her şey tarayıcıda çalışır, ağ isteği yoktur.

## Kullanım

1. `VisViewer.exe` veya `VisViewer.html` dosyasını çift tıklayın.
2. **Aç** düğmesi, sürükle-bırak veya `VisViewer.exe cizim.vsdx` (ya da dosyayı exe'nin üstüne bırakma) ile Visio dosyasını açın.
3. Şekle tıklayarak seçin; sürükleyin, tutamaçlarla boyutlandırın/döndürün, çift tıklayarak metni değiştirin, sağ panelden renk/çizgi/yazı/şekil verisini düzenleyin.
4. **Kaydet** (Ctrl+S): Chrome'un dosya erişimi varsa aynı dosyaya yazar; yoksa `*_duzenlendi.vsdx` olarak indirir. Orijinal dosya, **Farklı kaydet** seçilmedikçe yalnızca izin verdiğiniz yerde güncellenir.

Kısayollar için uygulamada `?` düğmesi.

## Özellikler

**Görüntüleme:** çok sayfalı dosyalar (arka plan sayfaları dahil), master/stil mirası, grup şekiller, doğru çizgiler, yaylar (ArcTo/EllipticalArcTo), elipsler, Bézier ve NURBS eğrileri, yuvarlatılmış köşeler, ok uçları, dönük/aynalı şekiller, metin (yazı tipi, boyut, kalın/italik/altı çizili, hizalama, otomatik satır sarma), gömülü PNG/JPEG/GIF/BMP resimler, katmanlar, mini harita, yakınlaştırma/kaydırma.

**Düzenleme:** seçme (Shift ile çoklu, Ctrl+tıklama ile grup içi), taşıma, boyutlandırma, döndürme, metin düzenleme, dolgu/çizgi/ok/yazı özellikleri, şekil verisi (Shape Data) tablosu, yeni şekil (dikdörtgen, yuvarlak köşeli, elips, eşkenar dörtgen, metin) ve bağlayıcı ekleme, bağlayıcıların şekillerle birlikte hareketi, kopyala/kes/yapıştır/çoğalt, silme, öne/arkaya alma, hizalama ve eşit dağıtma, ızgaraya yapışma, sınırsız geri al/yinele.

**Diğer:** tüm sayfalarda şekil/metin/şekil verisi arama (Ctrl+F), PNG ve SVG dışa aktarma, açık/koyu tema, mm/cm/inç birimleri, son açılan dosyalar.

## Düzenleme güvenliği

Kaydederken **orijinal XML korunur**: yalnızca değiştirdiğiniz şekillerin ilgili hücreleri (konum, boyut, metin, renk…) yazılır; master'lar, tema, stiller ve tanımadığımız her şey olduğu gibi kalır. Değişmeyen paket parçaları bayt bayt aynı kopyalanır.

## Sınırlar (dürüst liste)

- **Eski `.vsd` (ikili) dosyalar yalnızca görüntülenir** (Visio 4/5, 2000, 2003+). Düzenleme ve kaydetme kapalıdır; PNG/SVG dışa aktarılabilir. Çizim yeniden oluşturulur, bu yüzden EMF/WMF resimler (yer tutucu çizilir), desenli dolgular ve bazı alan biçimleri (birimli sayılar) birebir görünmeyebilir. Ayrıştırıcı bağımsız yazılmıştır (`src/vsd.js`, libvisio biçim bilgisine dayanır) ve libvisio'nun herkese açık test dosyalarıyla denenmiştir.
- Karmaşık stencil geometrileri, tema efektleri, gölgeler, desenli dolgular ve bazı eğriler (spline) **yaklaşık** gösterilir; ayrıntılar sağ paneldeki "Görüntüleme notları"nda listelenir.
- Gömülü EMF/WMF/OLE nesneleri gösterilemez (yer tutucu çizilir) ama dosyada korunur.
- Bir şekle bağlı bağlayıcı yeniden çizildiğinde (şekil taşınınca) bağlayıcının geometrisi **sabit değerlerle** yeniden yazılır; Visio'da şekli oynatınca Visio kendi yönlendirmesiyle yeniden hesaplar. Bağlayıcı uçlarını elle başka şekle taşıma henüz yok.
- Çok büyük sayfalarda (binlerce şekil) sürükleme, yazılım çizimli ortamlarda yavaşlayabilir; ekran kartlı bir makinede akıcıdır.
- Geliştirme sırasında gerçek Visio dosyası olmadığı için testler, Visio yapısını taklit eden **sentetik** dosyalarla yapıldı (`samples/`, `tools/`). Gerçek dosyalarda karşılaştığınız bozuk görünümleri bildirirseniz düzeltilebilir.
- `VisViewer.exe` imzasızdır; kurumsal güvenlik yazılımları uyarı verebilir. `VisViewer.html` aynı uygulamadır ve exe'siz de çalışır. Exe'nin Windows tarafı (Chrome/Edge'i bulup açma) bu ortamda çalıştırılamadı; yalnızca derlendi ve dosya yazma/açma mantığı Linux sürümüyle sınandı.

## Geliştirme

```
python3 build.py            # dist/VisViewer.html üretir (yalnızca standart kütüphane)
python3 build.py --exe      # ek olarak dist/VisViewer.exe (Go ≥ 1.21 ile Windows için çapraz derleme)

python3 tools/make_fixtures.py samples/masters.vsdx   # sentetik test dosyası
python3 tools/test_edit.py samples/masters.vsdx       # uçtan uca testler (Playwright + Chromium)
```

Yapı:

```
src/zip.js        ZIP okuma/yazma (DecompressionStream/CompressionStream)
src/model.js      VSDX paketi, sayfa/master/stil çözümü, hücre mirası, formül değerlendirici
src/render.js     SVG çizim motoru (geometri, stil, metin, ok uçları, resimler)
src/edit.js       XML'i yerinde düzenleyen işlemler, bağlayıcılar, geri al/yinele
src/ui_core.js    görünüm, seçim, sürükleme, klavye
src/ui_panels.js  paneller, arama, dosya işlemleri, başlatma
exe/              Go başlatıcı (gömülü HTML'i Chrome/Edge'de açar)
```
