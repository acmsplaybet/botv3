---
name: bot-data-quality-validator
description: Veri kalitesi denetimi, sıfır sahte veri (Zero-Mock) kuralları, oran formatlama ve JSON şema bütünlüğü kılavuzu
---

# BOTV3 — Data Quality & Zero-Mock Validator Skill

## 1. TEMEL KALİTE PRENSİPLERİ

1. **Sıfır Sahte Veri (Zero-Mock Integrity):**
   - Sayfada mevcut olmayan veya çekilemeyen alanlar için kesinlikle yapay uydurma veri (`"Lorem ipsum"`, `"Mock Team"`, `"1.00"`) üretilmez.
   - Eksik alanlar için standart: `null`, `""` veya `"-"`.
2. **İki Haneli Oran Standardı:**
   - Tüm bahis oranları (1X2, U/O, BTTS, HT vb.) sayısal olarak geçerli olmalı ve 2 ondalık basamak standartında tutulmalıdır (`1.85`, `2.40`).
3. **Form Dizisi Bütünlüğü:**
   - `homeForm` ve `awayForm` daima dizi (`Array`) olmalı, maksimum 6 eleman içermeli (`["W", "D", "L", "W", "W", "D"]`).
4. **Zorunlu Hero Alanları:**
   - `homeTeam`, `awayTeam`, `league`, `matchDate` alanları asla boş veya undefined olamaz.

---

## 2. KALİTE DENETİMİ ÇALIŞTIRMA
`tools/verify_data_quality.js` aracı `output/` altındaki tüm maçları tarayarak her maça 100 üzerinden bir Kalite Skoru verir:

```bash
node tools/verify_data_quality.js
```

### Skor Derecelendirmesi:
- 🟢 **%90 - %100:** Mükemmel (APEX API'ye aktarıma %100 hazır).
- 🟡 **%75 - %89:** Geçer (Küçük eksikler var; kupa maçı veya eksik istatistik).
- 🔴 **%0 - %74:** Başarısız (Eksik ana nesne veya sentetik veri tespit edildi).
