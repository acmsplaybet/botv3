# 📊 BOTV3 — Canlı İlerleme ve Durum Panosu (PROGRESS.md)
> Bu dosya projenin tek canlı durum kaynağıdır. Her görev bitiminde güncellenir.

---

## 🎯 GÜNCEL DURUM ÖZETİ
- **Proje Adı:** BPA V3 Forebet Master Scraper & APEX Data Ingestion Engine
- **Versiyon:** 3.0.0-PRO
- **Genel Durum:** Faz 1 (Temel 9 Modül & 1:1 Viewer) ve Teşhis Araç Paketi (`tools/` - 9 Araç) %100 TAMAMLANDI.
- **Aktif Faz:** Faz 2 (Extended Odds), Faz 3 (Finished Match Events) ve Faz 4 (APEX Canlı Senkronizasyon & Cron) hazırlığı.
- **Son Çalışma:** APEX standartlarında Agent yetenekleri (11 Skills), Teşhis ve Test Araçları (`tools/`), Cursor kuralları, Dokümantasyon haritası ve Teknik Ek Dokümanlar (`BOT_FOREBET_ADDENDUM.md`) kuruldu.

---

## 📋 FAZ HARİTASI VE ADIMLAR

### 🟢 FAZ 1: TEMEL KAZIMA, 1:1 VIEWER & TEST ARAÇLARI (TAMAMLANDI)
- [x] **Adım 1.1: Puppeteer Stealth & Evasion Motoru** → `core/browser_engine.js`, WebGL spoofing, User-Agent rotasyonu, `data/cf_cookies_cache.json` çerez önbelleği.
- [x] **Adım 1.2: Match Hero Parser** → `parsers/parse_hero.js` (Ev/Dep takımlar, logolar, lig, ülke, raunt, tarih/saat, hava durumu, skor, form dizileri).
- [x] **Adım 1.3: 9 Tahmin Marketi Parser** → `parsers/parse_markets.js` (1X2, Under/Over 2.5, HT, HT/FT, BTTS, Handicap, Scorers, Corners, Cards).
- [x] **Adım 1.4: H2H, Intro & Kuş Uçuşu Mesafe** → `parsers/parse_h2h_intro.js` + `parsers/parse_distance.js` (Geçmiş maçlar, özet oranlar, mesafe km).
- [x] **Adım 1.5: Puan Durumu (Standings)** → `parsers/parse_standings.js` (Lig sıralaması, aktif takımların sarı vurgulanması).
- [x] **Adım 1.6: 2x2 Son Maçlar & Formlar** → `parsers/parse_last_matches.js` (Ev genel, Dep genel, Ev iç saha, Dep dış saha tabloları).
- [x] **Adım 1.7: Overall Statistics (`get_ovd`)** → `parsers/parse_overall_stats.js` (Goller, dakikalara göre gol histogramı, şutlar, paslar, ataklar, disiplin).
- [x] **Adım 1.8: Fikstür & Sakatlıklar** → `parsers/parse_next_matches.js` + `parsers/parse_injuries.js`.
- [x] **Adım 1.9: 1:1 Forebet Masaüstü HTML Viewer** → `viewer/template_viewer.html` + `viewer/generate_viewer.js` + `output/<slug>/viewer.html`.
- [x] **Adım 1.10: Toplu Kazıma & Pipeline** → `daily_crawler.js`, `date_range_crawler.js`, `core/crawl_pool.js`, BAT dosyaları.
- [x] **Adım 1.11: Tekil Maç Denetim CLI** → `scrape_match.js` (`--url="..."`).
- [x] **Adım 1.12: Kapsamlı Teşhis ve Test Araçları (tools/)** → `tools/run_all_tests.js`, `tools/test_cf_health.js`, `tools/test_single_match.js`, `tools/verify_data_quality.js`, `tools/test_apex_sync.js`, `tools/inspect_bot_json.js`, `tools/test_daily_discovery.js`, `tools/benchmark_scraper.js`, `tools/clean_temp_files.js`.
- [x] **Adım 1.13: Genel Sistem Optimizasyonu & Hata Ayıklama** → Zero-mock ihlalleri temizlendi (`parse_next_matches.js`), DOM query reflow darboğazları giderildi (`parse_distance.js`, `parse_h2h_intro.js`), sayfa istek engellemesi eklendi (`scrape_match.js`), bellek sızıntıları ve geçici profil temizliği sağlandı (`daily_discovery.js`, `browser_engine.js`).

---

### 🟡 FAZ 2: AÇILAN ORANLAR (EXTENDED ODDS) MODÜLÜ (PLANLANDI)
- [ ] **Adım 2.1: Oran Butonu DOM Tetikleme** → Oran kutularına tıklandığında açılan dinamik popupların Puppeteer ile yakalanması.
- [ ] **Adım 2.2: Çoklu Büro Oranları Parserı** → `parsers/parse_extended_odds.js` (Bet365, Unibet, 1xBet vb. büro oranları).
- [ ] **Adım 2.3: Asya/Avrupa Handikap & Gol Çizgileri Türevleri** → Alternatif baremlerin JSON şemasına eklenmesi.
- [ ] **Adım 2.4: Viewer & Test Doğrulaması** → `viewer.html` ve `match_data.json` içinde extended odds görselleştirmesi.

---

### 🟡 FAZ 3: BİTMİŞ MAÇ İSTATİSTİKLERİ & OLAYLARI (FINISHED MATCH STATS) (PLANLANDI)
- [ ] **Adım 3.1: Skor Tıklama / Match Events Tetikleme** → Sonuçlanmış maçların skoruna tıklanarak açılan olaylar penceresi.
- [ ] **Adım 3.2: Gol Dakikaları ve Oyuncular** → `parsers/parse_match_events.js` (Gol dakikası, golü atan, asist, penaltı/KK bayrakları).
- [ ] **Adım 3.3: Kartlar & Değişiklikler** → Sarı/kırmızı kartlar (dakika, oyuncu), oyuncu değişiklikleri zaman çizelgesi.
- [ ] **Adım 3.4: APEX Live Match Center Uyumu** → APEX panelindeki olaylar sekmesiyle birebir veri entegrasyonu.

---

### 🟡 FAZ 4: APEX CANLI API SENKRONİZASYONU & CRON OTOMASYONU
- [x] **Adım 4.1: APEX Ingestion Endpoint Entegrasyonu** → `core/db_ingester.js` ve `tools/test_apex_sync.js` üzerinden `http://localhost/apex-api/api/import.php` endpointine `X-Apex-Secret: apex_secret_key_2026` ile sıfır kayıplı doğrudan aktarım sağlandı (HTTP 200 - 30ms).
- [ ] **Adım 4.2: Uzak Sunucu & Canlı Ortam Yapılandırması** → `.env` üzerinden `APEX_API_URL` ve `X-Apex-Secret` yönetimi.
- [ ] **Adım 4.3: Otomatik Günlük Zamanlayıcı (Cron/Task Scheduler)** → Sabah (09:00), Öğle (15:00) ve Gece (23:30) periyodik çekim otomasyonu.
- [ ] **Adım 4.4: Çevrimdışı Tamponlama (Offline Buffer Queue)** → Ağ kesintilerinde verileri biriktirip bağlantı gelince aktarma.

---

## 📝 SON NOTLAR & RAPORLAR
- `2026-08-20`: Genel sistem denetimi ve hızlandırma paketi tamamlandı. Bot baştan aşağı tarandı; gereksiz DOM reflow'ları, bellek sızıntıları, gizli zero-mock ihlali giderildi. Tekil maç kazıma süresi 12 saniyeye indi. APEX API import senkronizasyonu doğrulanarak 19 tabloya anlık JSON iletimi sağlandı.
- `2026-08-19`: Proje `c:/xampp/htdocs/botv3` dizinine taşındı. `apex-api` projesindeki gibi tam teşekküllü Agent kuralları (`.cursorrules`, `.agents/rules/`), 11 Yetenek (`.agents/skills/`), 9 Bağımsız Teşhis ve Test Aracı (`tools/`), Rehberler (`AGENTS.md`, `WORKFLOW.md`, `PROJECT_STANDARDS.md`, `GELISTIRICI.md`, `YONETICI.md`) ve Teknik Ek Doküman (`docs/BOT_FOREBET_ADDENDUM.md`) sıfırdan oluşturuldu.
