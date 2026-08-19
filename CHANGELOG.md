# 📜 BOTV3 — Sürüm Değişiklik Günlüğü (CHANGELOG.md)

Tüm önemli değişiklikler, yeni modüller ve hata düzeltmeleri bu dosyada [Semantic Versioning](https://semver.org/) kurallarına göre tutulur.

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
