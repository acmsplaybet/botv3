---
name: bot-debug
description: Bot hata ayıklama, Cloudflare challenge/Turnstile çözümleri, DOM seçici değişiklikleri ve Puppeteer bellek sızıntısı giderme rehberi
---

# BOTV3 — Debugging & Troubleshooting Skill

## 1. YAYGIN HATA SENARYOLARI VE ÇÖZÜMLERİ

### Senaryo 1: Cloudflare Challenge / 403 Forbidden
**Belirtiler:** Sayfa başlığı "Just a moment..." olarak kalır veya 403 döner.
**Çözüm Adımları:**
1. `data/cf_cookies_cache.json` dosyasını silip taze bir cookie almak için `node test_cf_bypass.js` çalıştır.
2. `core/browser_engine.js` içindeki user-agent ve viewport ayarlarını kontrol et.
3. headless modunu `false` yaparak tarayıcıyı görsel olarak aç ve manuel CAPTCHA gerekip gerekmediğini izle.

---

### Senaryo 2: Eksik Alan / DOM Seçici Değişimi
**Belirtiler:** `match_data.json` içinde bazı alanlar `null` veya boş geliyor.
**Çözüm Adımları:**
1. Maçın Forebet URL'sini doğrudan tarayıcıda aç ve F12 DevTools ile DOM yapısını incele.
2. Forebet'in CSS sınıf adını değiştirip değiştirmediğini kontrol et (Örn: `.st_hteam` -> `.schema_h2h .st_hteam`).
3. İlgili `parsers/parse_*.js` dosyasındaki seçici listesine yeni seçiciyi fallback olarak ekle.
4. Asla sahte veri yazma; seçiciyi düzelt.

---

### Senaryo 3: Node.js / Chromium Bellek Şişmesi (Memory Leak)
**Belirtiler:** Bot 50-100 maç kazıdıktan sonra RAM tüketimi tavan yapar ve işlem durur.
**Çözüm Adımları:**
1. Her maç kazıma işleminden sonra `await page.close()` çağrısının yapıldığından emin ol.
2. `core/crawl_pool.js` içinde her 20 maçta bir Chromium tarayıcısını yeniden başlatma (Browser recycle) mantığını devreye al.
3. Gereksiz resim ve font indirmelerini engelleyen `page.setRequestInterception` kurallarını doğrula.
