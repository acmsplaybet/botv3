===============================================================================
       APEX-BOT PRO — MODÜLER MASAÜSTÜ KAZIMA & ENTEGRASYON MOTORU
                       (v3.3.0-GOLDEN-MASTER RELEASE)
===============================================================================

🏆 MİMARİ AVANTAJI: SIFIR YENİDEN DERLEME (HOT-MODULAR ARCHITECTURE)
-------------------------------------------------------------------------------
APEX-BOT.exe ultra-hafif bir masaüstü kabuğudur (~8 KB).
Tüm ayrıştırma algoritmaları, Forebet seçicileri ve APEX API iletişim katmanı
doğrudan klasördeki açık modüllerden dinamik olarak okunur:

📁 botv3/
   ├── 🚀 program/APEX-BOT.exe         -> Masaüstü Uygulaması Başlatıcısı
   ├── 🎨 program/index.html           -> Masaüstü GUI Arayüzü (Düzenlenebilir)
   ├── 📊 parsers/                     -> Forebet Veri Ayrıştırıcıları (Hero, 9 Market, H2H, FDR vs.)
   ├── 🧠 core/                        -> Stealth Tarayıcı, APEX Sync & Keşif Motoru
   ├── 🌐 config.json                  -> Canlı APEX API URL & Gizli Anahtar Ayarları
   └── 📁 output/                      -> Kazınan Maç JSON & 1:1 HTML Viewer Dosyaları

-------------------------------------------------------------------------------
🛠️ BİR MODÜL DEĞİŞTİĞİNDE NE YAPACAKSINIZ?
-------------------------------------------------------------------------------
1. Forebet bir DOM seçicisini değiştirdiğinde veya yeni bir istatistik eklendiğinde:
   -> Sadece ilgili "parsers/" dosyasını (örn: parsers/parse_hero.js) klasöre atın!
   -> EXE'yi yeniden derlemenize veya yeniden kurmanıza KESİNLİKLE GEREK YOKTUR!
   -> APEX-BOT.exe bir sonraki tıklamanızda yeni dosyayı anında okur ve çalıştırır.

2. Karşı Bilgisayara Kurulum:
   -> Tüm "botv3" klasörünü karşı bilgisayara kopyalayın.
   -> "program/APEX-BOT.exe" dosyasına çift tıklayın!
   -> Node_modules zaten karşı bilgisayarda olduğu için saniyeler içinde açılır.

-------------------------------------------------------------------------------
🎛️ SAĞLIK KONTROLLERİ VE ACİL DURDURMA BUTONLARI:
-------------------------------------------------------------------------------
- 🛑 "Çalışan İşlemi Durdur": O an çalışan maçı güvenle keser.
- ⚠️ "Tümünü Kapat / Sıfırla": Arka plandaki tüm Puppeteer/Node süreçlerini temizler.
- 🔬 "9-Araç Sağlık Testi": Tek tıkla Hero, 9 Market, H2H, Distance testlerini onaylar.
- ⚖️ "Yan Yana Kıyasla": Orijinal Forebet sayfası ile 1:1 HTML Viewer'ı yan yana açar.
===============================================================================
