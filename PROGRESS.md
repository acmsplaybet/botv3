# 📊 BOTV3 — Canlı İlerleme ve Durum Panosu (PROGRESS.md)
> Bu dosya projenin tek canlı durum kaynağıdır. Her görev bitiminde güncellenir.

---

## 🎯 GÜNCEL DURUM ÖZETİ
- **Proje Adı:** BPA V3 Forebet Master Scraper & APEX Data Ingestion Engine
- **Versiyon:** 3.2.0-PRO
- **Genel Durum:** Faz 1 (Temel 9 Modül & 1:1 Viewer), Faz 2 (Extended Odds across 9 Markets), Faz 3 (1:1 Tactical Pitch, Events, Substitutions, Substitutes & Stats) ve Teşhis Araç Paketi (`tools/` - 9 Araç) %100 TAMAMLANDI.
- **Aktif Faz:** Faz 4 (APEX Canlı Senkronizasyon & Cron Otomasyonu) ve Sonlandırma.
- **Son Çalışma:** 
  1. **1:1 Taktik Futbol Sahası (Tactical Pitch):** Saha çizgileri, Ev/Deplasman Formasyon barları (`4-2-3-1`), Teknik direktörler, forma numaraları, oyuncu isimleri, gol (⚽), asist (`[A]`), sarı/kırmızı kart ve oyundan çıkış (`> dk`) rozetleri Forebet ile 1:1 inşa edildi.
  2. **Substitutions (Oyuna Giriş/Çıkış):** `▲ Yeşil Ok (Giren Oyuncu) / ▼ Kırmızı Ok (Çıkan Oyuncu) [Dakika]` eşleşmeleri ayrı bir tablo olarak çekildi ve renderlandı.
  3. **Substitutes (Yedek Kulübesi):** Her iki takımın yedek oyuncu listeleri eksiksiz listelendi.
  4. **Canlı Maç Güvenliği:** Canlı maçlarda anlık dakika (`91'+5 (Live)`) çekildi, maç bitmeden tahminlerin sonuçlandırılması engellenerek `pending` olarak korunması sağlandı.
  5. **Stats Sekmesi CSS:** Stats çubukları ve değerleri Forebet renklerine uygun olarak onarıldı.

---

## 📋 FAZ HARİTASI VE ADIMLAR

### 🟢 FAZ 1: TEMEL KAZIMA, 1:1 VIEWER & TEST ARAÇLARI (TAMAMLANDI)
- [x] **Adım 1.1: Puppeteer Stealth & Evasion Motoru** → `core/browser_engine.js`, WebGL spoofing, User-Agent rotasyonu, `data/cf_cookies_cache.json` çerez önbelleği.
- [x] **Adım 1.2: Match Hero Parser** → `parsers/parse_hero.js` (Ev/Dep takımlar, logolar, lig, ülke, raunt, tarih/saat, hava durumu, skor, canlı durum, form dizileri).
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

### 🟢 FAZ 2: AÇILAN ORANLAR (EXTENDED ODDS & TRENDS) (TAMAMLANDI)
- [x] **Adım 2.1: Oran Butonu DOM & .haodd Analizi** → 1X2, Under/Over, HT, BTTS pazar satırlarındaki `.haodd` öğelerinden tüm açılan barem oranları yakalandı.
- [x] **Adım 2.2: Çoklu Oran & Hareket Yönleri Parserı** → `parsers/parse_markets.js` (1X2 `1, X, 2`, U/O `under, over`, HT `1, X, 2`, BTTS `yes, no` ve `up`, `down`, `none` trend okları).
- [x] **Adım 2.3: JSON Şeması Genişletmesi** → `match_data.json` içinde her tahmin pazarı altına `extendedOdds` ve `trends` eklendi.
- [x] **Adım 2.4: 1:1 HTML Viewer Floating Odds Popup** → Oran kutucuklarına tıklandığında/üzerine gelindiğinde açılan Forebet 1:1 siyah oran kutucuğu arayüzü kuruldu.

---

### 🟢 FAZ 3: BİTMİŞ MAÇ MERKEZİ: OLAYLAR, KADROLAR & İSTATİSTİKLER (TAMAMLANDI)
- [x] **Adım 3.1: Skor Tıklama / Match Center Tetikleme** → `parsers/parse_match_center.js` (Skor tıklandığında açılan `.ft-events` ve 3 sekme AJAX ile okundu).
- [x] **Adım 3.2: Olaylar (Events) Zaman Çizelgesi** → Dakika bazlı goller (golü atan, asist, penaltı, kendi kalesine, anlık skor), sarı/kırmızı kartlar, oyuncu değişiklikleri, VAR kararları, penaltı kaçırma ve penaltı atışları (`penalties: [ { player, scored, score } ]`), kronolojik `HT` ve `FT` skor panelleri.
- [x] **Adım 3.3: 1:1 Taktik Futbol Sahası & Kadrolar (Line-ups)** → Stadyum, Kapasite, Hakem, Formasyon barları, Taktik saha üzerinde dizili ilk 11 oyuncu rozetleri (forma, numara, isim, gol, asist, kart, çıkış dakikası), Değişiklikler (Substitutions In/Out) ve Yedek kulübesi (Substitutes).
- [x] **Adım 3.4: Maç İçi Gerçek İstatistikler (Stats)** → Toplam şut, İsabetli şut, Ceza sahası içi/dışı şutlar, Topla oynama %, İsabetli paslar, Tehlikeli ataklar, Kornerler, Ofsaytlar, Fauller, Kartlar (İki renkli progress bar tasarımıyla).
- [x] **Adım 3.5: 1:1 HTML Viewer Match Center Modal** → Skora tıklandığında açılan 3 sekmeli (`Events`, `Line-ups`, `Stats`) canlı maç merkezi overlay ekranı yapıldı.

---

### 🟡 FAZ 4: APEX CANLI API SENKRONİZASYONU & CRON OTOMASYONU
- [x] **Adım 4.1: APEX Ingestion Endpoint Entegrasyonu** → `core/db_ingester.js` ve `tools/test_apex_sync.js` üzerinden `http://localhost/apex-api/api/import.php` endpointine `X-Apex-Secret: apex_secret_key_2026` ile sıfır kayıplı doğrudan aktarım sağlandı (HTTP 200 - 30ms).
- [ ] **Adım 4.2: Uzak Sunucu & Canlı Ortam Yapılandırması** → `.env` üzerinden `APEX_API_URL` ve `X-Apex-Secret` yönetimi.
- [ ] **Adım 4.3: Otomatik Günlük Zamanlayıcı (Cron/Task Scheduler)** → Sabah (09:00), Öğle (15:00) ve Gece (23:30) periyodik çekim otomasyonu.
- [ ] **Adım 4.4: Çevrimdışı Tamponlama (Offline Buffer Queue)** → Ağ kesintilerinde verileri biriktirip bağlantı gelince aktarma.

---

## 📝 SON NOTLAR & RAPORLAR
- `2026-08-20`: 1:1 Taktik Futbol Sahası (Tactical Pitch), Formasyon barları, Oyuna giriş/çıkış değişiklikleri (`Substitutions`) ve Yedek kulübesi (`Substitutes`) modülleri Forebet ile birebir aynı görselde tamamlandı. Canlı maçlarda tahminlerin `pending` kalması sağlandı. `Stats` sekmesi CSS çubukları düzeltildi.
- `2026-08-20`: Faz 2 (Açılan Oranlar) ve Faz 3 (Bitmiş Maç Merkezi - Events, Line-ups, Stats) başarıyla tamamlandı. Master Test Suite %100 PASS verdi.
