---
name: bot-forebet-extended-odds
description: Forebet maç sayfalarındaki oran kutularına tıklanarak açılan alternatif büro oranları, açılış-kapanış oran hareketleri ve handikap türevlerinin kazınması
---

# BOTV3 — Forebet Extended Odds Skill

## 1. AMACI VE KAPSAMI
Forebet maç sayfalarında ana oranların (`1X2`, `Under/Over`, `Handicap`) üzerine tıklandığında veya fare ile üzerine gelindiğinde detaylı oran modalı/popup'ı açılır. Bu modül, kullanıcı isteği doğrultusunda bu oran kutularını tetikleyerek genişletilmiş oran verilerini çeker.

---

## 2. ÇEKİLEN DETAYLI ORAN BİLEŞENLERİ
1. **Çoklu Bahis Bürosu Oranları (Bookmaker Comparison):**
   - Bet365, Unibet, 1xBet, Bwin, William Hill vb. büroların 1-X-2 ve Alt/Üst oranları.
2. **Oran Hareketleri (Odds Movements / Fluctuation):**
   - Açılış oranı (Opening odds) ve güncel oran (Current odds) arasındaki değişim yönü (artış/düşüş).
3. **Alternatif Handikap & Gol Çizgileri:**
   - Asya Handikap (+0.5, -0.5, +1.0, -1.0, +1.5 vb.)
   - Asya Toplam Gol (1.5, 2.0, 2.5, 3.0, 3.5 vb.)
   - Avrupa Handikapı (1:0, 0:1, 2:0)

---

## 3. DOM ETKİLEŞİM PROTOKOLÜ (PUPPETEER)
Oran modalı dinamik yüklendiğinden Puppeteer ile şu akış izlenir:

```javascript
async function parseExtendedOdds(page) {
  const extendedOdds = {
    bookmakers: [],
    movements: {},
    alternativeLines: []
  };

  try {
    // 1. Oran popup tetikleyici elementi bul
    const oddsTrigger = await page.$('.st_odd_box, .schema_odds, [data-odds-modal]');
    if (oddsTrigger) {
      // 2. Tıkla ve popup'ın görünmesini bekle
      await oddsTrigger.click();
      await page.waitForSelector('.odds_modal_content, .schema_odds_table', { timeout: 3000 }).catch(() => null);
      
      // 3. Tablo verilerini topla
      const oddsData = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.schema_odds_table tr'));
        return rows.map(r => ({
          bookmaker: r.querySelector('.bk_name')?.innerText?.trim() || '',
          odd1: r.querySelector('.odd_1')?.innerText?.trim() || '',
          oddX: r.querySelector('.odd_x')?.innerText?.trim() || '',
          odd2: r.querySelector('.odd_2')?.innerText?.trim() || ''
        })).filter(x => x.bookmaker);
      });

      extendedOdds.bookmakers = oddsData;
      
      // 4. Modalı kapat
      const closeBtn = await page.$('.modal_close, .btn-close');
      if (closeBtn) await closeBtn.click();
    }
  } catch (err) {
    console.warn(`[ExtendedOdds] Oran modalı açılamadı veya mevcut değil: ${err.message}`);
  }

  return extendedOdds;
}
```

---

## 4. JSON ŞEMASI VE SAKLAMA
Çıkarılan veriler `match_data.json` içinde `markets.extendedOdds` altına eklenir:

```json
{
  "markets": {
    "1X2": { ... },
    "extendedOdds": {
      "bookmakers": [
        { "bookmaker": "Bet365", "odd1": "2.10", "oddX": "3.40", "odd2": "3.20", "payout": "95.2%" },
        { "bookmaker": "Unibet", "odd1": "2.15", "oddX": "3.35", "odd2": "3.15", "payout": "94.8%" }
      ],
      "movements": {
        "home": { "opening": "2.30", "current": "2.10", "trend": "down" },
        "away": { "opening": "3.00", "current": "3.20", "trend": "up" }
      }
    }
  }
}
```

---

## 5. GERİYE DÖNÜK UYUMLULUK KURALI
Eğer bir maçta extended odds popup'ı yoksa veya açılmazsa bot hata vermez (`crash` olmaz), `extendedOdds: null` veya boş dizi ile ana akışına devam eder.
