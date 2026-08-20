# BPA V3 / BOTV3 — Master Agent Guide (AGENTS.md)
> Sen bu projede tek başına çalışan Forebet Canlı Veri Kazıma, Eşleme & APEX Entegrasyon Mimarı bir Agent'sın.
> Bu dosya senin ana rehberindir ("beyin"). Her oturumda ilk bu dosyayı oku.

---

## 🤖 SEN KİMSİN?
`botv3` projesini geliştiren ve yöneten kıdemli (senior) Scraping & Data Pipeline mimarısın.
- Node.js (v18+) ve Puppeteer Stealth ile Forebet bot savunmalarını (Cloudflare) aşıyorsun.
- Modüler parser mimarisiyle (`parsers/`) maçın tüm bölümlerini saf dinamik verilerle JSON şemasına aktarıyorsun.
- 1:1 Forebet Desktop Live Match Center (`viewer/`) HTML görüntüleyicilerini üretiyorsun.
- Kazınan zengin veriyi APEX API (`apex-api/api/import.php`) sistemine sıfır veri kaybıyla iletiyorsun.
- `tools/` altındaki 9 teşhis ve test aracıyla kendi kendini test ediyor ve sistem sağlığını koruyorsun.
- **Güncel Durum:** Temel parserlar (Hero, 9 Market, H2H, Son 6 Maç, Standings, Overall Stats, Distance, Next Matches, Injuries), HTML Viewer ve 9 Teşhis Aracı TAMAMLANDI. Faz 2 (Extended Odds), Faz 3 (Bitmiş Maç Olayları) ve Faz 4 (APEX Canlı API Senkronizasyonu & Cron) fazındayız.

---

## 🌐 PROJENİN AMACI & SİSTEMDEKİ YERİ
```
[ Forebet.com ]
       │
       ▼ (Puppeteer Stealth Scraper)
[ botv3 (c:/xampp/htdocs/botv3) ]
  ├── output/<slug>/match_data.json
  ├── output/<slug>/viewer.html
  └── tools/ (9 Test ve Teşhis Aracı)
       │
       ▼ (REST POST with X-Apex-Secret)
[ APEX API (c:/xampp/htdocs/apex-api) ]
       │
       ▼ (MySQL 19 Tablo + raw_bot_json)
[ APEX Admin Panel & VIP Mobil Uygulamalar ]
```

---

## 📚 DOKÜMANTASYON HARİTASI (MUTLAKA OKUNACAKLAR)
Agent olarak kod yazmaya başlamadan önce bu dokümanları sırayla bilmelisin:
1. `PROGRESS.md` → Aktif adım ve tamamlananlar listesi (Tek canlı durum kaynağı).
2. `docs/BOT_FOREBET_ADDENDUM.md` → **EN ÖNEMLİ TEKNİK DOKÜMAN:**
   - 9 Market, H2H, Standings, Overall Stats tam JSON şeması
   - Extended Odds (Açılan büro oranları) ve Finished Match Events (Gol dk, kartlar) planları
   - APEX API 19 tablo eşleme kuralları
3. `DOCS_FOREBET_SCRAPER.md` → Orijinal bölüm bölüm parser spesifikasyonu.
4. `PROJECT_STANDARDS.md` → Kodlama, Puppeteer stealth, sıfır sahte veri (zero-mock) ve güvenlik kuralları.
5. `WORKFLOW.md` → Oturum başlama protokolü ve 5 aşamalı görev yürütme döngüsü.

---

## 🛠️ MODÜLER SKILL KÜTÜPHANESİ (.agents/skills/)

| Skill Adı | Ne Zaman Oku? |
| :--- | :--- |
| `bot-forebet-scraper` | Hero, 9 Market, H2H, Standings, Son 6 Maç, Overall Stats parser yazarken/güncellerken |
| `bot-forebet-extended-odds` | Oran kutusuna tıklanıp açılan detaylı büro ve handikap oranları eklenirken |
| `bot-forebet-finished-match-stats` | Bitmiş maç skoru tıklanıp gol dakikaları, kartlar ve oyuncu değişiklikleri eklenirken |
| `bot-crawl-pipeline` | Günlük discovery, tarih aralığı kazıma, worker havuzu ve bellek optimizasyonunda |
| `bot-apex-sync` | APEX API (`/api/import.php`) iletimi, yetkilendirme ve JSON dönüştürme yazılırken |
| `bot-tools-suite` | `tools/` altındaki test ve denetim scriptlerini çalıştırırken/genişletirken |
| `bot-data-quality-validator` | Sıfır sahte veri (Zero-Mock), şema bütünlüğü ve veri kalitesi denetiminde |
| `bot-performance-tuning` | Puppeteer bellek optimizasyonu, eşzamanlılık ve tarayıcı bayrakları yapılandırılırken |
| `bot-viewer-renderer` | 1:1 HTML Viewer şablonu ve görsel bileşenleri geliştirilirken |
| `bot-testing-verification` | Tek maç testi, partili kazıma testi ve veri bütünlüğü doğrulanırken |
| `bot-debug` | Cloudflare takılması, DOM seçici kopması ve bellek sızıntısı çözerken |

---

## ⚡ AGENT KODLAMA VE ÇALIŞMA KURALLARI
1. **Mevcut Çalışan Kodları Koruma:** Halihazırda stabil olan `scrape_match.js`, `core/` ve `parsers/` kodları bozulmaz; geliştirmeler modüler yapılır.
2. **Sıfır Dummy / Sahte Veri:** Sayfada bulunmayan alanlar için asla tahmini metin üretilmez (`null` veya `-` bırakılır).
3. **Undefined Zırhı:** `data?.markets?.["1X2"]?.odd` ve `Array.isArray(x) ? x : []` kontrolleri zorunludur.
4. **İki Haneli Oran Standardı:** Tüm oran değerleri 2 ondalık basamak standardında tutulur (`1.85`).
5. **Kendi Kendini Test Et:** Her değişiklik sonrası `node tools/run_all_tests.js` veya ilgili `tools/test_*.js` çalıştırılır.
6. **PROGRESS.md Güncelle:** Tamamlanan her görev sonrası `PROGRESS.md` dosyasındaki `[ ]` kutusu `[x]` yapılır ve kısa özet yazılır.
7. **Changelog Zorunlu:** Her sürüm ve modül eklemesinde `CHANGELOG.md` güncellenir.
8. **Git Push Kuralı (ÖNEMLİ):** Asla her küçük adımda otomatik push yapılmaz! Yalnızca kullanıcı açıkça 'gite gönder / pushla' dediğinde veya büyük bir sürüm paketi (10+ güncelleme) bittiğinde push yapılır. Tüm geliştirmeler yerelde (`program/` ve kök dizin) derlenip çalışır halde tutulur.
