---
name: bot-performance-tuning
description: Puppeteer performans optimizasyonu, bellek sızıntısı engelleme, eşzamanlı sekme yönetimi ve Chromium bayrakları
---

# BOTV3 — Performance Tuning & Memory Optimization Skill

## 1. BELLEK YÖNETİMİ & SIZINTI ENGELLEME

1. **Sayfa Yaşam Döngüsü:**
   - Her maç kazıma işlemi bittiğinde `await page.close()` çağrısı ZORUNLUDUR.
2. **Tarayıcı Yenileme (Browser Recycling):**
   - Uzun süreli veya çok maçlı partilerde (`date_range_crawler.js`), her 25-30 maçta bir Chromium örneği kapatılıp (`browser.close()`) yeniden başlatılmalıdır.
3. **Gereksiz Medya Engelleme (Request Interception):**
   - Sadece saf veri çekilirken resimler (`.png`, `.jpg`, `.svg`), yazı tipleri (`.woff2`) ve reklam scriptleri `page.setRequestInterception(true)` ile engellenerek CPU ve bant genişliği %60 oranında optimize edilir.

---

## 2. CHROMIUM BAŞLATMA BAYRAKLARI (`core/browser_engine.js`)
En yüksek hız ve kararlılık için kullanılan standart bayraklar:

```javascript
const PUPPETEER_FLAGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--disable-gpu',
  '--window-size=1920,1080',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding'
];
```

---

## 3. İDEAL EŞZAMANLILIK (CONCURRENCY)
- **Önerilen Eşzamanlı Sekme:** 2 - 3 worker.
- **Rastgele Gecikme (Jitter):** Maçlar arasında 1.5s - 3.5s bekleme, Cloudflare oran sınırlamasını (rate-limit) tamamen engeller.
- **Benchmark:** `node tools/benchmark_scraper.js` komutu ile sistem performansı düzenli ölçülmelidir.
