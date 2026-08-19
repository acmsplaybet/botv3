# BOTV3 — Kalıcı Agent Davranış Kuralları
> Bu dosyadaki kurallar her oturumda otomatik aktiftir. Değiştirilemez.

## OTURUM BAŞLANGICI
Her yeni konuşmada (kullanıcı "selam", "durum nedir", "maç çek" veya herhangi bir mesaj gönderdiğinde):
1. `PROGRESS.md` dosyasını oku → aktif adımı, tamamlanan parserları ve son NOTLAR satırını öğren.
2. `WORKFLOW.md` içerisindeki "Oturum Başlama Protokolü"nü uygula.
3. Kullanıcıya net durum özeti sun ve 5 seçenekli bot görev menüsü listele.
4. Kullanıcı seçim yapana veya net bir talimat verene kadar KOD YAZMA.

## KOD YAZARKEN
- **Sıfır Dummy Veri:** Kazınamayan alanlar için kesinlikle yapay uydurma veri üretme (`null` veya `-` bırak).
- **Undefined Zırhı:** `data?.hero?.homeTeam || ''`, `Array.isArray(arr) ? arr : []` gibi güvenli kontroller zorunludur.
- **İki Haneli Oran Hassasiyeti:** Çekilen tüm sayısal oranlar float veya string olarak 2 ondalık basamak standartında tutulur (`1.85`, `2.40`).
- **Log Temizliği:** Node.js crawler döngülerinde konsolu boğmadan, renkli/anlaşılır ilerleme logları bas (`[1/250] Crawled: Match X... OK`).
- **Bellek Yönetimi:** Puppeteer ile her maç kazımasından sonra sayfa (`page.close()`) mutlaka kapatılmalı, zombi Chromium süreçleri bırakılmamalıdır.
- **APEX Veri Uyumu:** Üretilen JSON şeması (`match_data.json`), APEX API (`apex-api/core/Importer.php`) tarafından sıfır veri kaybıyla karşılanacak formatta kalmalıdır.

## TOKEN VERİMLİLİĞİ
- Araştırma yaparken binlerce satırlık `output/` veya `node_modules/` klasörünü toplu okuma.
- Değişiklik öncesi mutlaka ilgili `.agents/skills/` dosyasını incele.
- Büyük açıklamalar yerine kısa, net ve işlevsel raporlar sun.
- Bağımsız işlemler için paralel araç çağrıları kullan.

## PROGRESS GÜNCELLEMESİ
Her tamamlanan modül veya düzeltme sonrası `PROGRESS.md` dosyasında:
- `[ ]` → `[x]` işaretle
- `NOTLAR:` satırına kısa teknik özet ekle
- Sürüm güncellemesi gerekiyorsa `CHANGELOG.md` dosyasına kaydet.
