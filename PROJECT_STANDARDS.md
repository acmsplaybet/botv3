# BOTV3 — Project Standards & Engineering Guidelines

## 1. Node.js & Kodlama Standartları
- **Node.js Sürümü:** Node.js v18+ (ESM / CommonJS uyumlu).
- **Asenkron Yapı:** Tüm G/Ç ve Puppeteer işlemleri `async/await` ile yazılır; callback cehenneminden kaçınılır.
- **Hata Yönetimi:** Tüm harici çağrılar, DOM değerlendirmeleri ve API istekleri `try/catch` blokları ile korunur. Hata durumunda bot çökmez (`zero-crash`), hatayı loglar ve işleme devam eder.
- **DocBlock / Yorum:** Her parser fonksiyonunun üstünde ne yaptığı, hangi DOM seçicilerini kullandığı ve döndürdüğü şema belirtilir.

---

## 2. Puppeteer Stealth & Anti-Detection Kuralları
- **Stealth Evasion:** WebGL donanım spoofing, Canvas gürültüsü, rastgele user-agent rotasyonu zorunludur.
- **Rastgele Gecikme (Jitter):** İstekler arasında insan davranışını simüle eden rastgele gecikmeler (`1500ms - 3500ms`) uygulanır.
- **Çerez Saklama:** Başarılı Cloudflare bypass çerezleri `data/cf_cookies_cache.json` dosyasında önbelleğe alınır.
- **Kaynak Optimizasyonu:** Gereksiz medya/font istekleri engellenerek CPU ve bellek tasarrufu sağlanır.
- **Sayfa Kapatma:** Her maç işlemi bittiğinde `await page.close()` çağrısı ZORUNLUDUR.

---

## 3. Sıfır Sahte Veri (Zero-Mock) Prensibi
- Bot asla sahte veya uydurma veri üretmez.
- Sayfada mevcut olmayan veya çekilemeyen alanlar için `null`, `""` veya `"-"` değeri döner.
- Form dizileri için `[]` boş dizi döndürülür.

---

## 4. Dosya ve Klasör Düzeni
- `core/` → Tarayıcı motoru, worker havuzu, discovery ve APEX sync modülleri.
- `parsers/` → Bölüm bölüm bağımsız DOM ayrıştırma fonksiyonları (`parse_*.js`).
- `viewer/` → 1:1 HTML Viewer şablonu ve oluşturucu kodları.
- `output/` → Maç bazlı JSON (`match_data.json`) ve HTML (`viewer.html`) çıktıları.
- `archive/` → Tarih bazlı sıkıştırılmış maç havuzu.
- `data/` → Çerezler ve geçici durum dosyaları.
- `docs/` → Teknik mimari, DOM haritası ve şema dokümanları.
- `.agents/` → Agent kuralları (`rules/`) ve yetenekleri (`skills/`).

---

## 5. API İletim ve Güvenlik Standartları
- APEX API ile iletişimde `X-Apex-Secret` yetkilendirmesi zorunludur.
- Hassas API anahtarları `.env` dosyasında tutulur, git deposuna veya açık loglara basılmaz.
- İletim hatalarında veriler `sync_queue.json` dosyasında saklanır ve otomatik yeniden denenir.
