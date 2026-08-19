# 📜 BOTV3 — Sürüm Değişiklik Günlüğü (CHANGELOG.md)

Tüm önemli değişiklikler, yeni modüller ve hata düzeltmeleri bu dosyada [Semantic Versioning](https://semver.org/) kurallarına göre tutulur.

## [3.1.0-PRO] — 2026-08-20
### ✨ Yeni Modüller ve Özellikler (Faz 2 & Faz 3)
- **Açılan Detaylı Oranlar (Faz 2 - Extended Odds & Trends across 9 Markets):**
  - `parsers/parse_markets.js` güncellendi; her tahmin pazarı satırındaki `.haodd` DOM bloklarından tüm açılan barem oranları yakalandı.
  - **1X2 Pazarı:** `1`, `X`, `2` açılan tüm oranlar ve `up`, `down`, `none` trend yönleri.
  - **Under/Over Pazarı:** `under`, `over` oranları.
  - **HT (İlk Yarı) Pazarı:** `1`, `X`, `2` oranları.
  - **BTTS (KG Var/Yok) Pazarı:** `yes`, `no` oranları.
  - **HTML Viewer Oran Popupları:** Tahmin tablolarındaki oran kutucuklarına tıklandığında açılan 1:1 Forebet siyah oran kutusu (`#oddsFloatingTooltip`) eklendi.
- **Bitmiş Maç Merkezi: Olaylar, Kadrolar ve İstatistikler (Faz 3 - Match Center):**
  - `parsers/parse_match_center.js` modülü yazıldı ve 10. adım olarak `scrape_match.js` motoruna bağlandı.
  - **Events (Olaylar):** Dakika dakika goller (atan, asist, penaltı, kendi kalesine, anlık skor), sarı ve kırmızı kartlar, oyuncu değişiklikleri ve penaltı atışları (`penalties: [ { player, scored, score } ]`).
  - **Line-ups (Kadrolar):** Stadyum, Kapasite, Hakem, Ev & Deplasman Dizilişleri (`4-4-2`, `4-2-3-1`), İlk 11 (Forma no, oyuncu adı) ve Yedekler listesi.
  - **Stats (İstatistikler):** Toplam şut, İsabetli şut, Ceza sahası içi/dışı şutlar, Topla oynama %, İsabetli paslar, Tehlikeli ataklar, Kornerler, Ofsaytlar, Disiplin kartları.
  - **1:1 HTML Viewer Match Center Modal:** Skora tıklandığında açılan 3 sekmeli (`Events`, `Line-ups`, `Stats`) canlı maç merkezi overlay ekranı (`#matchCenterModal`) yapıldı.
- **APEX API Veri İletimi:** Zenginleştirilmiş `matchCenter` ve `extendedOdds` nesneleri `raw_bot_json` ile APEX Ingester'a aktarıldı.

---

## [3.0.1-OPT] — 2026-08-20
### ⚡ Hızlandırma & Optimizasyon (Performance Tuning)
- **Sayfa İstek Filtreleme (`scrape_match.js`):** Tekil maç kazıyıcıya `setupPageInterception(page)` bağlandı. Ağır reklam ağları (Google Ads, Criteo, Taboola vb.) ve gereksiz medya istekleri engellenerek sayfa yüklenme süresi %40 hızlandırıldı.
- **DOM Reflow Darboğazları Giderildi (`parsers/parse_distance.js`, `parsers/parse_h2h_intro.js`):** Tüm sayfayı kapsayan binlerce `div` sorgusu (`querySelectorAll('div, section')`) kaldırılarak modül düzeyinde hedefli DOM sorgulamasına geçildi.
- **Dinamik Popup Bekleme Mekanizması (`parsers/parse_hero.js`):** Sabit 1.8 saniyelik statik `setTimeout` yerine `waitForSelector` tabanlı akıllı bekleme uygulandı.
- **Overall Stats Hızlandırması (`parsers/parse_overall_stats.js`):** Script tarama zaman aşımı 5.0 saniyeden 1.5 saniyeye optimize edildi.
- **Geçici Profil ve Bellek Temizliği (`core/browser_engine.js`, `core/daily_discovery.js`):** `closeBrowser(browser)` ile her işlem sonrası `temp_profiles/` altındaki profil klasörleri otomatik silinir hale getirildi; `discoverDailyMatches` sonundaki Chromium bellek sızıntısı giderildi.

### 🛡️ Hata Düzeltmeleri (Bug Fixes)
- **Zero-Mock İhlali Temizlendi (`parsers/parse_next_matches.js`):** Fikstür bulunamayan maçlara hardcoded sahte Türk takımı fikstürü ekleyen kod kaldırıldı; sıfır sahte veri kuralına tam uyum sağlandı.
- **H2H Takım Değişkeni Kapsamı (`parsers/parse_h2h_intro.js`):** `expAwayClean` tanımsızlık hatası giderildi, H2H maçlarında takım skor vurgulama mantığı güçlendirildi.
- **APEX API Senkronizasyon Uyumsuzluğu (`core/db_ingester.js`, `tools/test_apex_sync.js`):** Secret key `apex_secret_key_2026` ve endpoint `http://localhost/apex-api/api/import.php` olarak güncellendi. `match_data.json` nesnesi APEX Importer 19-tablo motoruna sıfır kayıpla (HTTP 200 - 30ms) bağlandı.
- **URL Slug & Çıktı Eşleşmesi (`scrape_match.js`):** Maç klasör slug'ları Forebet ID formatına tam uyumlu hale getirildi.

---

## [3.0.0-PRO] — 2026-08-19
### ✨ Eklendi (Added)
- **APEX Standartlarında Agent & Dokümantasyon Ekosistemi:**
  - Master Agent Rehberi: `AGENTS.md`
  - Cursor Kuralları: `.cursorrules`
  - Kalıcı Davranış & Prompt Şablonları: `.agents/rules/bot-behavior.md`, `.agents/rules/bot-prompt-templates.md`
  - 11 Yeni Modüler Agent Yeteneği (Skills):
    - `bot-forebet-scraper` (Temel kazıma & 9 market)
    - `bot-forebet-extended-odds` (Açılan büro oranları & handikap türevleri)
    - `bot-forebet-finished-match-stats` (Bitmiş maç skor tıklama, gol dakikaları, kartlar)
    - `bot-crawl-pipeline` (Günlük discovery & worker havuzu)
    - `bot-apex-sync` (APEX API REST iletim & JSON şema)
    - `bot-tools-suite` (CLI Teşhis ve Test araç seti kılavuzu)
    - `bot-data-quality-validator` (Veri kalitesi ve Zero-Mock doğrulama)
    - `bot-performance-tuning` (Puppeteer bellek & hız optimizasyonu)
    - `bot-viewer-renderer` (1:1 Forebet HTML Viewer)
    - `bot-testing-verification` (Test prosedürleri)
    - `bot-debug` (Cloudflare & Puppeteer sorun giderme)
  - 9 Bağımsız Teşhis ve Test Aracı (`tools/`):
    - `tools/run_all_tests.js` (Master test paketi)
    - `tools/test_cf_health.js` (Cloudflare & Stealth sağlık testi)
    - `tools/test_single_match.js` (Tek maç kazıma ve şema denetimi)
    - `tools/verify_data_quality.js` (Veri kalitesi ve Zero-Mock skorlama)
    - `tools/test_apex_sync.js` (APEX API REST iletim testi)
    - `tools/inspect_bot_json.js` (Maç JSON derinlemesine görsel inceleme)
    - `tools/test_daily_discovery.js` (Günlük maç keşif testi)
    - `tools/benchmark_scraper.js` (Hız ve RAM tüketimi benchmarkı)
    - `tools/clean_temp_files.js` (Geçici dosya ve profil temizleyici)
  - Proje Standartları: `PROJECT_STANDARDS.md`
  - Görev ve Çalışma Protokolü: `WORKFLOW.md`
  - Canlı Durum Panosu: `PROGRESS.md`
  - Geliştirici ve Yönetici Rehberleri: `GELISTIRICI.md`, `YONETICI.md`
  - Master Teknik Ek Doküman: `docs/BOT_FOREBET_ADDENDUM.md`
  - Yeni Kapsamlı `README.md`

### 🔧 Mevcut Altyapı (Faz 1)
- Puppeteer Stealth & Cloudflare Cookie Cache (`core/browser_engine.js`)
- 9 Ayrık DOM Parser Modülü (`parsers/` - Hero, Markets, H2H, Standings, Last Matches, Overall Stats, Distance, Next Matches, Injuries)
- 1:1 Forebet Masaüstü HTML Viewer Render Motoru (`viewer/template_viewer.html`, `viewer/generate_viewer.js`)
- Günlük Discovery & Tarih Aralığı Kazıma Motoru (`daily_crawler.js`, `date_range_crawler.js`, `core/crawl_pool.js`)
- Windows Tek Tıkla Başlatıcı BAT Scriptleri (`1_*.bat`, `2_*.bat`, `3_*.bat`, `4_*.bat`)
