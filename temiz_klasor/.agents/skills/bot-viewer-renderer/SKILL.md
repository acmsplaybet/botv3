---
name: bot-viewer-renderer
description: Kazınan maç verisinden 1:1 Forebet masaüstü canlı maç merkezi (HTML Viewer) oluşturma ve görsel render standartları
---

# BOTV3 — HTML Viewer Renderer Skill

## 1. AMACI VE ÖZELLİKLERİ
`botv3` kazıdığı her maç için `output/<slug>/viewer.html` dosyası üretir. Bu dosya;
- 1:1 Forebet Desktop Live Match Center tasarımına sadıktır.
- Tamamen bağımsızdır (Self-contained, harici internet veya backend olmadan da çalışır).
- Veriyi doğrudan içine gömülü JSON (`window.MATCH_DATA = {...}`) üzerinden okur.

---

## 2. MODÜLLER VE DOSYALAR
1. **`viewer/template_viewer.html`**:
   - Modern koyu/açık tema desteği.
   - 9 Tahmin sekmesi geçişleri (1X2, U/O, HT, HT/FT, BTTS, Handicap, Scorers, Corners, Cards).
   - 2x2 Son maçlar tablosu ve dinamik lig filtreleme butonları.
   - Overall Stats dikey barları, pasta grafikleri ve gol zaman aralıkları histogramı.
   - Puan durumu (Standings) tablosu ve aktif maç takımlarının sarı vurgulanması.
2. **`viewer/generate_viewer.js`**:
   - `match_data.json` verisini okuyup şablon içine enjekte ederek `viewer.html` oluşturan motor.
3. **`regenerate_all_viewers.js`**:
   - Şablonda bir UI düzeltmesi yapıldığında, `output/` altındaki tüm eski maçların HTML dosyalarını tek komutla güncelleyen toplu script.

---

## 3. GÖRSEL VE HATA YÖNETİMİ ZIRHLARI
- **Logo Zırhı:** Tüm takım ve lig logoları `onerror="this.style.display='none'"` ile korunur.
- **Yazı Tipi & İkonlar:** Boxicons (`bx bx-*`) kullanılır.
- **Tab Yönetimi:** Vanilla JS ile sekmeler arası pürüzsüz geçiş sağlanır.
