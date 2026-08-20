---
name: bot-crawl-pipeline
description: Günlük maç discovery, tarih aralığı kazıma, Puppeteer worker havuzu yönetimi, hız sınırlaması ve bellek optimizasyonu
---

# BOTV3 — Crawl Pipeline & Concurrency Skill

## 1. MİMARİ BİLEŞENLERİ
Botun toplu kazıma hattı 3 temel modülden oluşur:

1. **`core/daily_discovery.js`**:
   - Forebet ana tahmin listelerinden (`/football/predictions-by-date/YYYY-MM-DD`, `/football/predictions-under-over-2-5/` vb.) o günün tüm maç URL'lerini toplar.
   - Sayfa numaralandırmasını (`page=1, 2, ...`) takip eder.
2. **`core/crawl_pool.js`**:
   - Eşzamanlı sekme/worker havuzunu (`concurrency: 2 - 4`) yönetir.
   - Cloudflare ban koruması için maçlar arasına dinamik bekleme süresi ekler (`jitter: 1500ms - 3500ms`).
   - Başarısız olan maçları retry kuyruğuna alır (Max 3 deneme).
3. **`date_range_crawler.js`**:
   - Belirtilen başlangıç ve bitiş tarihleri arasındaki tüm günleri sırayla tarar ve `output/` veya `archive/` altına kaydeder.

---

## 2. KOMUTLAR VE BAT KISAYOLLARI

### CLI Komutları:
```bash
# Bugünün maçlarını keşfet ve kazı:
node daily_crawler.js

# Belirli bir tarih aralığını kazı:
node date_range_crawler.js --start="2026-08-01" --end="2026-08-19" --concurrency=3

# Tek maç kazıma:
node scrape_match.js --url="https://www.forebet.com/en/football/matches/..."
```

### Windows Batch Dosyaları:
- `1_KONTROL_PANELI_BASLAT.bat` → Express dashboard sunucusunu başlatır (`localhost:3000`).
- `2_BUGUNKU_MACLARI_CEK_VE_KAYDET.bat` → Bugünün tüm maçlarını çeker.
- `3_YARINKI_MACLARI_CEK_VE_KAYDET.bat` → Yarının maçlarını çeker.
- `4_SON_30_GUNU_ARSIVLE_GECE_MODU.bat` → Geçmiş 30 günün arşivini toplar.

---

## 3. CLOUDFLARE VE PERFORMANS KONTROLLERİ
1. **Çerez Önbelleği (`data/cf_cookies_cache.json`):** Başarılı bir Cloudflare geçişinden sonra çerezler diske yazılır ve sonraki isteklerde yeniden kullanılır.
2. **Sekme Kapatma Kuralı:** Her maç tamamlandığında Puppeteer sayfası `await page.close()` ile kesinlikle yok edilir.
3. **Zombi Süreç Koruması:** Crawler tamamlandığında veya hata aldığında açık Chromium süreçleri kapatılır.
4. **Zaten İndirilmiş Maçları Atlama:** `output/<slug>/match_data.json` mevcutsa ve maç tamamlanmışsa tekrar indirilmez (opsiyonel `--force` parametresi ile ezilebilir).

---

## 4. GÜNLÜK OTOMASYON & CRON HAZIRLIĞI
Bot ayrı bir sunucuya veya arka plan görevine alındığında;
- Günde 2 kez (Örn: 09:00 ve 15:00) çalıştırılarak güncel oranlar ve yeni eklenen maçlar toplanır.
- Gece (23:30) çalıştırılarak bitmiş maçların sonuçları ve skorları arşivlenir.
