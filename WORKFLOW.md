# BOTV3 — Agent Çalışma Protokolü (WORKFLOW.md)
> Her oturum başında bu dosyayı oku. Kod yazmadan önce sırayı takip et.

---

## 🚀 OTURUM BAŞLAMA PROTOKOLÜ
Kullanıcı sana "selam", "merhaba", "ne durumdayız", "maçları çek" veya benzeri bir açılış mesajı gönderdiğinde:

### 1. Durum Oku (Dosya Değişikliği YOK)
- `PROGRESS.md` dosyasını oku → Aktif fazı, son test durumunu ve `NOTLAR:` satırını öğren.
- Kullanıcının mesajından hedef görevi belirle (Tek maç testi mi, yeni parser mı, APEX sync mi, toplu kazıma mı).

### 2. Bağlam Özeti Sun (Kısa, 5 satır max)
```
📊 Durum: Faz 1 (Temel 9 Modül & Viewer) Tamamlandı | Faz 2-4 Hazır
🤖 Bot Motoru: Puppeteer Stealth + Cloudflare Cookie Cache Aktif
📁 Çıktı: output/ ve viewer/ 1:1 Masaüstü Render Hazır
🔧 Son İş: [PROGRESS.md'deki son NOTLAR satırı]
```

### 3. Görev Seçeneği Sun
```
Bugün botv3 üzerinde ne yapıyoruz?
1. 🔍 Tek Maç Kazıma / Denetim — Belirli bir Forebet linkini test et
2. 📅 Toplu Kazıma / Pipeline — Bugünün veya belirli tarih aralığının maçlarını çek
3. 📊 Extended Odds (Açılan Oranlar) — Oran tıklama ve çoklu büro modülü geliştirme
4. ⚽ Finished Match Events — Bitmiş maç gol dakikaları ve kartlar modülü
5. 🚀 APEX API Entegrasyonu — Kazınan verileri APEX API'ye canlı iletme testi
(Ya da direkt ne yapmak istediğini yaz)
```

---

## 🔄 GÖREV YÜRÜTME DÖNGÜSÜ (5 AŞAMA)

### Adım 1 — Araştır (Kod YAZMA)
- İlgili skill dosyasını oku (`.agents/skills/`)
- Etkilenecek JS/HTML modüllerini incele
- Geriye dönük uyumluluk risklerini analiz et

### Adım 2 — Onayla
- Kısa plan sun (3-4 madde)
- Belirsizlik varsa tek soru sor, onay bekle

### Adım 3 — Uygula
- Skill kurallarına göre modüler kod yaz
- Undefined zırhı ve sıfır-dummy-veri standardına sadık kal
- Çalışan mevcut scriptleri bozma

### Adım 4 — Test Et
- Test komutunu çalıştır (`node scrape_match.js --url="..."` veya `test_*.js`)
- Konsol hatalarını ve JSON çıktısını doğrula
- `viewer.html` renderını kontrol et

### Adım 5 — PROGRESS.md Güncelle
- Tamamlanan maddeyi `[x]` yap
- `NOTLAR:` satırına kısa teknik özet ekle

---

## 🗂️ SKILL SEÇİM REHBERİ

| Ne Yapıyorum? | Hangi Skill? |
| :--- | :--- |
| Hero, 9 Market, H2H veya Stats kazıyorum | `bot-forebet-scraper` |
| Oran kutusuna tıklayıp detaylı oranları çekiyorum | `bot-forebet-extended-odds` |
| Bitmiş maçın gol dakikalarını ve kartlarını çekiyorum | `bot-forebet-finished-match-stats` |
| Toplu kazıma veya tarih aralığı çalıştırıyorum | `bot-crawl-pipeline` |
| APEX API (`/api/import.php`) ile veri senkronize ediyorum | `bot-apex-sync` |
| HTML Viewer görüntüsünü düzenliyorum | `bot-viewer-renderer` |
| Test veya denetim çalıştırıyorum | `bot-testing-verification` |
| Cloudflare veya bellek hatası alıyorum | `bot-debug` |

---

## 🚫 YASAK LİSTE (Asla Yapma)

```
❌ Sayfada olmayan veri için sahte/yapay veri üretmek (Dummy data)
❌ Mevcut çalışan parserları ve bat dosyalarını geriye dönük uyumsuz değiştirmek
❌ data.markets["1X2"].odd şeklinde undefined zırhı olmadan zincirleme erişim
❌ Sayfa kazıması bittiğinde page.close() yapmadan bırakmak (bellek sızıntısı)
❌ PROGRESS.md güncellemeden görevi tamamlandı saymak
❌ APEX API secret anahtarını şifresiz loglara veya güvensiz ortamlara basmak
```
