---
name: bot-apex-sync
description: Kazınan maç verilerinin APEX API (REST / POST import) sistemine sıfır kayıpla aktarılması, yetkilendirme ve uzaktan senkronizasyon protokolü
---

# BOTV3 — APEX API Synchronization Skill

## 1. MİMARİ VE VERİ AKIŞI

```
[ botv3 / Forebet Bot ]
        │
        ▼ (JSON Pipeline)
[ core/db_ingester.js ]
        │
        ▼ (HTTP POST with X-Apex-Secret)
[ APEX API: /api/import.php veya /api/sync_ingest.php ]
        │
        ▼ (MySQL 19 Tablo UPSERT + raw_bot_json)
[ APEX Admin Panel & VIP Mobile API ]
```

---

## 2. API İLETİŞİM STANDARTLARI

- **Hedef Endpoint:** 
  - Yerel Test: `http://localhost/apex-api/api/import.php`
  - Canlı Sunucu: `https://api.yourdomain.com/api/import.php` (ortam değişkeni `APEX_API_URL` ile yapılandırılır)
- **Yetkilendirme Başlığı:** `X-Apex-Secret: <SECRET_KEY>` veya `Authorization: Bearer <SECRET_KEY>`
- **İstek Metodu:** `POST`
- **İçerik Türü:** `Content-Type: application/json`

---

## 3. PAYLOAD FORMATI VE ŞEMA EŞLEME

`db_ingester.js` maç verisini APEX API'nin beklediği zengin formata dönüştürür:

```json
{
  "secret": "BPA_g7wXmi9oa32slLeb",
  "match_id": "2494866",
  "match_url": "https://www.forebet.com/en/football/matches/besiktas-eyupspor-2494866",
  "league": {
    "name": "Turkey Süper Lig",
    "country": "Turkey",
    "flag_url": "https://www.forebet.com/images/fc/tr.png",
    "short_tag": "TR1"
  },
  "teams": {
    "home": { "name": "Beşiktaş", "short": "BJK", "logo": "https://..." },
    "away": { "name": "Eyüpspor", "short": "EYU", "logo": "https://..." }
  },
  "meta": {
    "date": "16/08/2026",
    "time": "21:30",
    "stadium": "Beşiktaş Park, Istanbul",
    "weather": "27°C",
    "round": "Round 1"
  },
  "status": "Upcoming",
  "score": { "final": "-", "ht": "-" },
  "form": {
    "home": ["W", "W", "W", "W", "D", "L"],
    "away": ["D", "W", "D", "W", "W", "L"]
  },
  "predictions_9_tabs": {
    "1x2": { "pick": "1", "odd": "1.30", "prob_1": "61%", "prob_X": "24%", "prob_2": "15%", "correctScore": "3-1", "avgGoals": "3.13" },
    "under_over_25": { "pick": "Over 2.5", "odd": "1.65", "prob_option1": "40%", "prob_option2": "60%" },
    "both_to_score": { "pick": "Yes", "odd": "1.70", "prob_option1": "58%", "prob_option2": "42%" }
  },
  "overall_stats": { ... },
  "h2h": { ... },
  "last_matches": { ... },
  "distance": { "homeCity": "Istanbul Beşiktaş", "awayCity": "Istanbul Eyüp", "distanceKm": "8 km" },
  "raw_bot_json": { ... }
}
```

---

## 4. GÜVENLİK VE UZAK BİLGİSAYAR KURULUMU
Bot başka bir sunucuya/bilgisayara kurulduğunda:
1. `.env` dosyasına `APEX_API_URL` ve `APEX_API_SECRET` anahtarları eklenir.
2. Bot günlük çalıştıkça maçları diske kaydeder ve ardışık olarak APEX API'ye fırlatır.
3. Bağlantı kesintisi yaşanırsa, aktarılamayan maçlar bir `sync_queue.json` dosyasında tamponlanır ve bağlantı sağlandığında otomatik aktarılır.
