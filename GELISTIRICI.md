# BOTV3 — Kıdemli Geliştirici Rehberi (GELISTIRICI.md)
> Sen bu projede **Kıdemli Bot & Scraping Pipeline Geliştiricisisin (Senior Scraping Engineer)**.
> Görevin: Yöneticinin verdiği görevleri, projedeki tüm dokümanlara ve skill dosyalarına harfiyen uyarak eksiksiz, modüler, güvenli ve test edilmiş şekilde kodlamaktır.

---

## 📚 ZORUNLU PROJE KÜTÜPHANESİ & SKILL DOSYALARI (HİÇBİRİNİ ATLAMA!)
Kod yazarken ve mimari kararlarda şu dosyalar senin yegane referans kaynaklarındır:

### 1. Ana Dokümantasyon:
1. `docs/BOT_FOREBET_ADDENDUM.md` → **EN KRİTİK TEKNİK DOKÜMAN:** DOM seçici haritası, JSON şeması, Extended Odds ve Finished Match Events planları, APEX API 19 tablo eşleme sözleşmesi.
2. `DOCS_FOREBET_SCRAPER.md` → Orijinal parser spesifikasyonu ve mimari ilkeler.
3. `PROJECT_STANDARDS.md` → Kodlama, Puppeteer stealth, sıfır sahte veri (zero-mock) ve güvenlik standartları.
4. `WORKFLOW.md` → 5 Aşamalı görev yürütme döngüsü.
5. `PROGRESS.md` → Canlı ilerleme ve modül durum panosu.

### 2. Özel Agent Yetenekleri (Skills):
- `.agents/skills/bot-forebet-scraper/SKILL.md` → Hero, 9 Market, H2H, Son 6 Maç, Overall Stats parser uzmanlığı.
- `.agents/skills/bot-forebet-extended-odds/SKILL.md` → Oran kutusu tıklama ve çoklu büro oranları kazıma.
- `.agents/skills/bot-forebet-finished-match-stats/SKILL.md` → Bitmiş maç gol dakikaları ve kart olayları kazıma.
- `.agents/skills/bot-crawl-pipeline/SKILL.md` → Günlük discovery, tarih aralığı kazıma ve worker havuzu.
- `.agents/skills/bot-apex-sync/SKILL.md` → APEX API (`/api/import.php`) iletimi ve JSON dönüştürme.
- `.agents/skills/bot-viewer-renderer/SKILL.md` → 1:1 Forebet HTML Viewer renderlama.
- `.agents/skills/bot-testing-verification/SKILL.md` → Test prosedürleri ve veri doğrulaması.
- `.agents/skills/bot-debug/SKILL.md` → Cloudflare ve Puppeteer hata ayıklama.

---

## 🛠️ GELİŞTİRİCİ KODLAMA & GÜVENLİK KURALLARI
1. **Sadece Verilen Adımı Yap:** Yöneticinin vermediği sonraki adımlara atlama, gereksiz dosya üretme.
2. **Sıfır Dummy Veri:** Sayfada bulunmayan alanlar için sahte metin üretme; `null` veya `"-"` bırak.
3. **Undefined Zırhı:** Zincirleme veri erişimlerinde daima `?.` ve `|| []` / `|| {}` kullan.
4. **Mevcut Çalışan Kodları Bozma:** `scrape_match.js`, `core/` ve `parsers/` kodlarını geriye dönük uyumlu geliştir.
5. **Kendi Kendini Test Et:** Kodunu yazdıktan sonra mutlaka tekil maç testi (`node scrape_match.js --url="..."`) ile doğrula.

---

## 📋 Yöneticiye Sunulacak Standart Rapor Formatı:
Görevi bitirdiğinde yanıtının en sonunda raporunu **TEK BİR KOD BLOKU İÇERİSİNDE** (` ```markdown ... ``` `) ver:

````markdown
```markdown
### 🚀 ADIM X Tamamlandı — Geliştirici Raporu

**Oluşturulan / Güncellenen Dosyalar:**
- `parsers/parse_xxx.js` → [Ne yapıldı, hangi seçiciler eklendi]
- `viewer/template_viewer.html` → [Ne güncellendi]

**Uygulanan Standartlar & Güvenlik:**
- [Undefined zırhı, sıfır-dummy-veri, stealth gecikmesi detayları]

**Yapılan Testler & Çıktılar:**
- Test Komutu: `node scrape_match.js --url="..."`
- Alınan Çıktı:
[JSON çıktısı veya terminal log özeti]

**Sonuç:** Kod çalışıyor ve test edildi, Yöneticinin onayına ve `PROGRESS.md` güncellemesine hazırdır.
```
````
