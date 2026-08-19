---
name: bot-forebet-finished-match-stats
description: Sonuçlanmış / bitmiş maçların skorlarına tıklanarak gol dakikaları, kartlar (sarı/kırmızı + oyuncu + dakika) ve maç içi olaylarının kazınması
---

# BOTV3 — Forebet Finished Match Stats Skill

## 1. AMACI VE KAPSAMI
Geçmiş veya sonuçlanmış maçların skorlarına (`FT 2 - 1` vb.) tıklandığında Forebet'in açtığı maç olayları (match events/timeline) penceresinden maç içi detayları çeker.

Bu veriler, APEX panelindeki Live Match Center sekmesinde ve detaylı analiz motorlarında kullanılır.

---

## 2. ÇEKİLEN VERİ ALANLARI
1. **Goller Zaman Çizelgesi (Goals Timeline):**
   - Gol dakikası (örn: `14'`, `45+2'`, `89'`)
   - Golü atan oyuncu adı ve asist yapan oyuncu (varsa)
   - Takım tarafı (`home` veya `away`)
   - Özel türler: Penaltı (`(P)` / `pen`), Kendi Kalesine (`(OG)` / `own_goal`)
2. **Disiplin / Kartlar (Cards Breakdown):**
   - Kart türü: Sarı Kart (`yellow`), İkinci Sarıdan Kırmızı (`yellow_red`), Direkt Kırmızı (`red`)
   - Kart dakikası
   - Oyuncu adı ve takım tarafı
3. **Oyuncu Değişiklikleri (Substitutions):**
   - Çıkan oyuncu, giren oyuncu ve dakika
4. **Devre & Uzatma Skorları:**
   - İY skoru (`HT`), 90 dk skoru (`FT`), Uzatma skoru (`AET`), Penaltı atışları skoru (`PEN`).

---

## 3. DOM ETKİLEŞİM & AYRIŞTIRMA MANTIĞI

```javascript
async function parseMatchEvents(page) {
  const events = {
    hasEvents: false,
    goals: [],
    cards: [],
    substitutions: []
  };

  try {
    // 1. Bitmiş maç skor tetikleyicisini bul
    const scoreTrigger = await page.$('.st_scrblock, .st_ft, .match_events_trigger');
    if (scoreTrigger) {
      await scoreTrigger.click().catch(() => {});
      await page.waitForSelector('.match_events_modal, .events_timeline, .schema_events', { timeout: 2500 }).catch(() => null);

      const parsedEvents = await page.evaluate(() => {
        const goalList = [];
        const cardList = [];
        const subList = [];

        // Gol satırlarını tara
        document.querySelectorAll('.event_row.goal, .timeline_goal').forEach(el => {
          goalList.push({
            minute: el.querySelector('.minute')?.innerText?.trim() || '',
            player: el.querySelector('.player_name')?.innerText?.trim() || '',
            teamSide: el.classList.contains('home_side') ? 'home' : 'away',
            isPenalty: el.innerText.includes('(pen)') || el.innerText.includes('(P)'),
            isOwnGoal: el.innerText.includes('(OG)') || el.innerText.includes('(og)')
          });
        });

        // Kart satırlarını tara
        document.querySelectorAll('.event_row.card, .timeline_card').forEach(el => {
          const isRed = el.querySelector('.icon_red_card') !== null || el.classList.contains('red');
          cardList.push({
            minute: el.querySelector('.minute')?.innerText?.trim() || '',
            player: el.querySelector('.player_name')?.innerText?.trim() || '',
            teamSide: el.classList.contains('home_side') ? 'home' : 'away',
            type: isRed ? 'red' : 'yellow'
          });
        });

        return { goals: goalList, cards: cardList, subs: subList };
      });

      if (parsedEvents.goals.length > 0 || parsedEvents.cards.length > 0) {
        events.hasEvents = true;
        events.goals = parsedEvents.goals;
        events.cards = parsedEvents.cards;
        events.substitutions = parsedEvents.subs;
      }
    }
  } catch (err) {
    console.warn(`[MatchEvents] Maç olayları kazınamadı: ${err.message}`);
  }

  return events;
}
```

---

## 4. JSON ÇIKTI YAPISI
`match_data.json` içinde `events` anahtarı altına yerleşir:

```json
{
  "events": {
    "hasEvents": true,
    "goals": [
      { "minute": "23'", "player": "Ciro Immobile", "teamSide": "home", "isPenalty": false, "isOwnGoal": false },
      { "minute": "67'", "player": "Rafa Silva", "teamSide": "home", "isPenalty": false, "isOwnGoal": false },
      { "minute": "82'", "player": "Emre Akbaba", "teamSide": "away", "isPenalty": true, "isOwnGoal": false }
    ],
    "cards": [
      { "minute": "34'", "player": "Al-Musrati", "teamSide": "home", "type": "yellow" },
      { "minute": "78'", "player": "Robin Yalçın", "teamSide": "away", "type": "red" }
    ]
  }
}
```

---

## 5. APEX API ENTEGRASYONU
APEX veritabanında bu veriler `matches` tablosundaki `raw_bot_json` içinde tam haliyle korunur ve paneldeki `Live Match Center` modalında olaylar sekmesinde anında gösterilir.
