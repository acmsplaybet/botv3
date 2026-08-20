---
name: bot-testing-verification
description: Bot test prosedürleri, tek maç denetimi, tarih aralığı kontrolü, JSON şema doğrulaması ve APEX import test protokolü
---

# BOTV3 — Testing & Verification Skill

## 1. TEST SEVİYELERİ
Her yeni kod değişikliği veya parser eklemesinden sonra aşağıdaki testler uygulanır:

### Seviye 1: Tek Maç Canlı Denetim Testi
```bash
node scrape_match.js --url="https://www.forebet.com/en/football/matches/besiktas-eyupspor-2494866"
```
**Kontrol Listesi:**
- [ ] `output/<slug>/match_data.json` dosyası oluştu mu?
- [ ] `hero` objesinde ev/dep takım, tarih, lig, form bilgileri tam mı?
- [ ] `markets` içinde 1X2, U/O, BTTS, HT, Corners, Cards bölümleri dolu mu?
- [ ] `h2h` ve `lastMatches` tablolarında maç dizileri çekildi mi?
- [ ] `overallStats` verileri ve `goalsByTimePeriod` histogramı ayrıştırıldı mı?
- [ ] `output/<slug>/viewer.html` dosyası tarayıcıda hatasız açılıyor mu?

---

### Seviye 2: Tarih Aralığı & Havuz Testi
```bash
# 3 maçlık mini parti testi:
node date_range_crawler.js --start="2026-08-19" --end="2026-08-19" --limit=3
```
**Kontrol Listesi:**
- [ ] Worker havuzu çökmeden 3 maçı sırayla kazıdı mı?
- [ ] Cloudflare veya sayfa yüklenme timeout hatası alındı mı?
- [ ] Bellek kullanımı stabil kaldı mı?

---

### Seviye 3: APEX API Entegrasyon Testi
```bash
# APEX API'ye test verisi iletimi:
node -e "require('./core/db_ingester').testSingleMatch('output/besiktas-eyupspor-2494866/match_data.json')"
```
**Kontrol Listesi:**
- [ ] HTTP 200 `{"success": true}` döndü mü?
- [ ] APEX DB `matches` tablosuna satır eklendi mi?
- [ ] `raw_bot_json` sütununa tam JSON kaydedildi mi?
