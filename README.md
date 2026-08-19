# 🚀 BPA V3 / BOTV3 — Forebet Master Scraper & APEX Data Ingestion Engine

**Sürüm:** `3.0.0-PRO`  
**Mimari:** Node.js (v18+) + Puppeteer Stealth + Cloudflare Evasion + APEX REST Synchronization  
**Çalışma Alanı:** `c:/xampp/htdocs/botv3/`  
**Eşleme Hedefi:** APEX API (`c:/xampp/htdocs/apex-api/` -> `http://localhost/apex-api/api/import.php`)

---

## 📌 Proje Genel Bakışı
`botv3`, Forebet üzerindeki tüm futbol maçlarını (bugünün maçları, yarının maçları, geçmiş arşivler ve canlı fikstürler) en ince ayrıntısına kadar kazıyan, sıfır sahte veri (zero-mock) standardıyla JSON formatına normalize eden ve 1:1 Forebet masaüstü canlı maç merkezi HTML görüntüleyicilerini (`viewer.html`) üreten otonom veri motorudur.

Kazınan veriler doğrudan **APEX API** sistemine iletilerek MySQL 19-tablo yapısına işlenir ve APEX Admin Paneli ile VIP Mobil Uygulamaları besler.

---

## 🏗️ Mimari ve Veri Akışı
```
[ Forebet.com Canlı Maç Sayfaları ]
                 │
                 ▼ (Puppeteer Stealth + Cloudflare Bypass)
[ botv3 / Scraper Engine ]
  ├── Parsers (Hero, 9 Market, H2H, Son 6 Maç, Standings, Overall Stats, Distance, Next Matches, Injuries)
  ├── Output: output/<match-slug>/match_data.json
  ├── Viewer: output/<match-slug>/viewer.html (1:1 Forebet Masaüstü Görünümü)
  └── Tools: tools/ (9 Bağımsız Teşhis ve Test Aracı)
                 │
                 ▼ (HTTP POST with X-Apex-Secret)
[ APEX API (c:/xampp/htdocs/apex-api/api/import.php) ]
                 │
                 ▼ (MySQL 19 Tablo UPSERT + raw_bot_json)
[ APEX Admin Panel & VIP Mobile Endpoints ]
```

---

## 🧪 Teşhis ve Test Araçları (`tools/`)

| Komut | Açıklama |
| :--- | :--- |
| `node tools/run_all_tests.js` | **Master Test Paketi:** CF Bypass, Veri Kalitesi ve APEX Sync testlerini sırayla çalıştırır. |
| `node tools/test_cf_health.js` | Cloudflare Bypass, Stealth Engine ve çerez önbelleği sağlık kontrolü yapar. |
| `node tools/test_single_match.js [URL]` | Tekil maç kazıma denetimi yapar; 9 market, H2H, Son 6 ve Stats tablosunu döker. |
| `node tools/verify_data_quality.js` | `output/` altındaki maçları denetler, zero-mock ve şema bütünlüğü skoru hesaplar. |
| `node tools/test_apex_sync.js` | Kazınan maçı APEX API (`/api/import.php`) endpointine iletip test eder. |
| `node tools/inspect_bot_json.js [PATH]` | Herhangi bir `match_data.json` dosyasını terminalde detaylı görsel tablo olarak inceler. |
| `node tools/test_daily_discovery.js [Tarih]` | Günün maç listesini hızlıca keşfeder, lig ve maç sayısını listeler. |
| `node tools/benchmark_scraper.js` | Kazıma hızını (saniye/maç) ve bellek (RAM) tüketimini ölçer. |
| `node tools/clean_temp_files.js` | Geçici Puppeteer profillerini ve gereksiz ekran görüntülerini temizler. |

---

## 🚀 Hızlı Başlangıç & Kullanım

### 1. Kontrol Paneli & Dashboard Sunucusu
```bash
# Web arayüzünü ve viewer sunucusunu başlatır (http://localhost:3000):
1_KONTROL_PANELI_BASLAT.bat
# veya
npm start
```

### 2. Bugünün Maçlarını Çekme
```bash
2_BUGUNKU_MACLARI_CEK_VE_KAYDET.bat
# veya
node daily_crawler.js
```

### 3. Yarının Maçlarını Çekme
```bash
3_YARINKI_MACLARI_CEK_VE_KAYDET.bat
```

### 4. Son 30 Günün Arşivini Gece Modunda Toplama
```bash
4_SON_30_GUNU_ARSIVLE_GECE_MODU.bat
```

---

## 📁 Dizin Yapısı
```
botv3/
├── .agents/                     # Agent yetenekleri (11 Skills) ve kalıcı kurallar
│   ├── rules/                   # Bot davranış ve prompt şablonları
│   └── skills/                  # 11 modüler yetenek (Scraper, Extended Odds, Events, Sync, Tools vb.)
├── tools/                       # 9 Bağımsız CLI teşhis ve test aracı
├── core/                        # Tarayıcı motoru, worker havuzu ve APEX sync modülü
├── parsers/                     # Bölüm bazlı 9 DOM ayrıştırıcı modül
├── viewer/                      # 1:1 Forebet HTML Viewer motoru
├── output/                      # Kazınan maç verileri (JSON + HTML)
├── archive/                     # Geçmiş tarih arşivi
├── data/                        # Cloudflare çerez önbelleği
├── docs/                        # Teknik şartnameler ve DOM haritaları
│   └── BOT_FOREBET_ADDENDUM.md  # Master teknik addendum & şema haritası
├── .cursorrules                 # Master Cursor kuralları
├── AGENTS.md                    # Master Agent rehberi
├── WORKFLOW.md                  # 5 Aşamalı çalışma protokolü
├── PROGRESS.md                  # Canlı ilerleme ve yol haritası
├── PROJECT_STANDARDS.md         # Mühendislik ve güvenlik kuralları
├── GELISTIRICI.md               # Geliştirici rehberi & rapor formatı
├── YONETICI.md                  # Yönetici rehberi & görev formatı
└── CHANGELOG.md                 # Sürüm değişiklik günlüğü
```

---

## 🎯 Yaklaşan Geliştirmeler (Yol Haritası)
1. **Extended Odds (Açılan Oranlar):** Oran butonlarına tıklandığında açılan Bet365, Unibet vb. çoklu büro oranları ve Asya baremleri kazıma modülü.
2. **Finished Match Stats (Bitmiş Maç Olayları):** Sonuçlanan maçların skoruna tıklanarak gol dakikaları, kartlar (sarı/kırmızı + oyuncu + dk) ve değişiklikler kazıma modülü.
3. **Canlı Sunucu Dağıtımı & Otomasyon:** Farklı bir makineye kurulan botun günlük periyodik cron ile çalışıp verileri canlı APEX API'ye aktarması.
