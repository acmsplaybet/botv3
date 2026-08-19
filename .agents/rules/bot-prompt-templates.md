# BOTV3 — Agent Prompt Şablonları & Komut Kütüphanesi

Bu şablonlar, yöneticinin veya kullanıcının `botv3` üzerinde çalışırken kullanabileceği hazır görev ve komut kalıplarıdır.

---

## 1. 🔍 TEK MAÇ KAZIMA VE DOĞRULAMA (AUDIT TEST)
```markdown
### 📢 Geliştirici Agent İçin Görev: Tek Maç Kazıma ve Denetim

**Hedef Maç URL:** [Forebet Maç Linki]
**Referans Skill:** `.agents/skills/bot-forebet-scraper/SKILL.md`

**Yapılacak İşlemler:**
1. `node scrape_match.js --url="[URL]"` komutunu çalıştır.
2. `output/<slug>/match_data.json` içeriğini doğrula (Hero, 9 Market, H2H, Son 6 Maç, Standings, Overall Stats).
3. `output/<slug>/viewer.html` dosyasının eksiksiz oluşturulduğunu teyit et.
4. Çıktı raporunu ve varsa eksik alanları özetle.
```

---

## 2. 📅 GÜNLÜK TOPLU MAÇ KAZIMA (DAILY PIPELINE)
```markdown
### 📢 Geliştirici Agent İçin Görev: Günün Maçlarını Toplu Kazıma

**Tarih:** [YYYY-MM-DD / Bugün]
**Referans Skill:** `.agents/skills/bot-crawl-pipeline/SKILL.md`

**Yapılacak İşlemler:**
1. `node daily_crawler.js` veya `2_BUGUNKU_MACLARI_CEK_VE_KAYDET.bat` sürecini başlat.
2. Keşfedilen maç sayısını ve crawler worker havuzunun durumunu takip et.
3. Hatalı/Cloudflare engeline takılan maç varsa yeniden deneme (retry) kuyruğunu incele.
4. Tamamlanan maçların `output/` ve `archive/` dizinlerine yazıldığını doğrula.
```

---

## 3. 📊 DETAYLI ORANLAR MODÜLÜ ENTEGRASYONU (EXTENDED ODDS)
```markdown
### 📢 Geliştirici Agent İçin Görev: Açılan Oranlar (Extended Odds) Kazıma

**Referans Dokümanlar:**
- `docs/BOT_FOREBET_ADDENDUM.md` (Bölüm 4: Extended Odds Blueprint)
- `.agents/skills/bot-forebet-extended-odds/SKILL.md`

**Yapılacak İşlemler:**
1. `parsers/parse_extended_odds.js` modülünü tasarla/ekle.
2. Forebet maç sayfasındaki oran butonlarına tıklandığında açılan alternatif büro oranlarını ve handikap baremlerini parse et.
3. `markets.extendedOdds` objesine entegre et.
4. Örnek bir maçta test et ve geriye dönük uyumluluğu doğrula.
```

---

## 4. ⚽ BİTMİŞ MAÇ İSTATİSTİKLERİ & OLAYLARI (FINISHED MATCH STATS)
```markdown
### 📢 Geliştirici Agent İçin Görev: Bitmiş Maç Gol Dakikaları ve Kartlar

**Referans Dokümanlar:**
- `docs/BOT_FOREBET_ADDENDUM.md` (Bölüm 5: Finished Match Events Blueprint)
- `.agents/skills/bot-forebet-finished-match-stats/SKILL.md`

**Yapılacak İşlemler:**
1. `parsers/parse_match_events.js` modülünü oluştur.
2. Bitmiş maçın skoruna tıklandığında açılan gol dakikaları, kartlar (sarı/kırmızı + oyuncu + dk) ve oyuncu değişikliklerini parse et.
3. `match_data.json` içine `events: { goals: [...], cards: [...], subs: [...] }` olarak kaydet.
4. APEX Live Match Center ile uyumunu doğrula.
```

---

## 5. 🚀 APEX API VERİ SENKRONİZASYONU (TRANSMISSION TEST)
```markdown
### 📢 Geliştirici Agent İçin Görev: APEX API Canlı İletim Testi

**Hedef API:** `http://localhost/apex-api/api/import.php`
**Referans Skill:** `.agents/skills/bot-apex-sync/SKILL.md`

**Yapılacak İşlemler:**
1. `core/db_ingester.js` üzerinden kazınan 1 örnek maçı APEX API import endpointine POST et.
2. `X-Apex-Secret` yetkilendirmesinin ve HTTP 200 `{"success": true}` yanıtının alındığını doğrula.
3. APEX veritabanındaki `matches`, `raw_bot_json` ve ilgili tablolara verinin eksiksiz düştüğünü kontrol et.
```
