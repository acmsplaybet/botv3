---
name: bot-tools-suite
description: BOTV3 CLI araçları, test scriptleri (tools/), teşhis komutları ve doğrulama araçları kılavuzu
---

# BOTV3 — Tools & Diagnostic Suite Skill

## 1. ARAÇLAR HARİTASI (`tools/`)

| Araç Dosyası | Komut | Görev ve Açıklama |
| :--- | :--- | :--- |
| `tools/run_all_tests.js` | `node tools/run_all_tests.js` | **Master Test Paketi:** CF Bypass, Veri Kalitesi ve APEX Sync testlerini sırayla çalıştırır. |
| `tools/test_cf_health.js` | `node tools/test_cf_health.js` | Cloudflare Bypass, Stealth Engine ve çerez önbelleği sağlık kontrolü yapar. |
| `tools/test_single_match.js` | `node tools/test_single_match.js [URL]` | Tekil maç kazıma denetimi yapar; 9 market, H2H, Son 6 ve Stats tablosunu döker. |
| `tools/verify_data_quality.js` | `node tools/verify_data_quality.js` | `output/` altındaki maçları denetler, zero-mock ve şema bütünlüğü skoru hesaplar. |
| `tools/test_apex_sync.js` | `node tools/test_apex_sync.js` | Kazınan maçı APEX API (`/api/import.php`) endpointine iletip test eder. |
| `tools/inspect_bot_json.js` | `node tools/inspect_bot_json.js [PATH]` | Herhangi bir `match_data.json` dosyasını terminalde detaylı görsel tablo olarak inceler. |
| `tools/test_daily_discovery.js` | `node tools/test_daily_discovery.js [YYYY-MM-DD]` | Günün maç listesini hızlıca keşfeder, lig ve maç sayısını listeler. |
| `tools/benchmark_scraper.js` | `node tools/benchmark_scraper.js` | Kazıma hızını (saniye/maç) ve bellek (RAM) tüketimini ölçer. |
| `tools/clean_temp_files.js` | `node tools/clean_temp_files.js` | Geçici Puppeteer profillerini ve gereksiz ekran görüntülerini temizler. |

---

## 2. KULLANIM STANDARTLARI
1. **Her Kod Değişikliğinden Sonra:** İlgili `tools/test_*.js` scripti çalıştırılmalı ve konsol çıktısı doğrulanmalıdır.
2. **APEX Entegrasyonunda:** `node tools/test_apex_sync.js` ile API yanıtı (HTTP 200) teyit edilmelidir.
3. **Bellek / Disk Yönetiminde:** Belirli aralıklarla `node tools/clean_temp_files.js` çalıştırılarak disk sağlığı korunmalıdır.
