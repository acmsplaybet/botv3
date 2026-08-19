# 🚀 BPA V3 / BOTV3 — Master Technical Addendum (BOT_FOREBET_ADDENDUM.md)
> Bu doküman `botv3` projesinin veri şeması, Forebet DOM seçicileri, açılan oranlar (Extended Odds), bitmiş maç olayları (Goal/Card Events) ve APEX API veri entegrasyonu için tek nihai başvuru kaynağıdır.

---

## 📌 1. DOM SEÇİCİLERİ VE ALAN ÇIKARIM HARİTASI

### 1.1 Match Hero & Takım Meta
- **Ev Sahibi Takım:** `.st_hteam, .schema_h2h .st_hteam`
- **Deplasman Takım:** `.st_ateam, .schema_h2h .st_ateam`
- **Ev / Deplasman Logoları:** `.st_hteam img, .os_home_team_img img` (Canvas Base64 / URL fallback)
- **Lig Adı & Ülke:** `.st_lgs, .breadcrumbs a[href*='/football/']`
- **Tarih & Saat:** `.st_date, .date, .st_arrdt`
- **Stadyum & Şehir:** `.st_venue, .venue`
- **Hava Durumu:** `.st_weather, .weatherWrap`
- **Skor / Durum:** `.st_res, .st_scrblock, .st_ft`
- **Form Dizileri (Son 6):** `.st_hteam_form span, .st_ateam_form span` -> `["W", "W", "D", "L", "W", "W"]`

---

### 1.2 9 Tahmin Marketi
1. **1X2 (Maç Sonu):** `#m1x2_t_butt` / `#tab_1x2` -> `prob1`, `probX`, `prob2`, `pick`, `correctScore`, `avgGoals`, `odd`
2. **Under/Over 2.5:** `#uo_t_butt` / `#tab_uo` -> `probUnder`, `probOver`, `pick`, `odd`, `avgGoals`
3. **Half Time (İY):** `#ht_t_butt` / `#tab_ht` -> `prob1`, `probX`, `prob2`, `pick`, `htScore`, `odd`
4. **HT / FT (İY/MS):** `#htft_t_butt` / `#tab_htft` -> `combinations`, `pick`, `odd`
5. **BTTS (KG Var/Yok):** `#bts_t_butt` / `#tab_bts` -> `probYes`, `probNo`, `pick`, `odd`
6. **Handicap:** `#ah_t_butt` / `#tab_handicap` -> `lines`, `pick`, `odd`
7. **Scorers (Golcüler):** `#scors_t_butt` / `#tab_scorers` -> `players: [{ name, team, prob }]`
8. **Corners (Korner):** `#cor_t_butt` / `#tab_corners` -> `line`, `overProb`, `underProb`, `pick`, `odd`
9. **Cards (Kartlar):** `#card_t_butt` / `#tab_cards` -> `line`, `overProb`, `underProb`, `pick`, `odd`

---

### 1.3 H2H & Kuş Uçuşu Mesafe
- **H2H Karşılaşmaları:** `.h2h_table tr, table.schema_h2h tr` -> Tarih, Ev, Skor, İY Skor, Deplasman, Lig, Sonuç Rozeti (`W/D/L`).
- **H2H Özet Çubuğu:** `.st_perc_stat, .st_row_perc` -> Takım 1 galibiyet %, Beraberlik %, Takım 2 galibiyet %.
- **Kuş Uçuşu Mesafe:** `.st_dstc, .st_distance` -> `homeCity`, `awayCity`, `distanceKm`.

---

### 1.4 Lig Puan Durumu (Standings)
- **Tablo:** `table.teamtablesp, table.standings`
- **Sütunlar:** `rank`, `teamName`, `pts`, `played`, `w`, `d`, `l`, `gf`, `ga`, `gd`.
- **Takım Vurgulama:** Aktif maçın takımları sarı renkle işaretlenir (`highlight: true`).

---

### 1.5 2x2 Son Maçlar Tabloları
1. Ev Sahibi Son Maçlar (Tüm Kulvarlar) + Lig filtreleri
2. Deplasman Son Maçlar (Tüm Kulvarlar) + Lig filtreleri
3. Ev Sahibi Sadece Evindeki Son Maçlar
4. Deplasman Sadece Deplasmandaki Son Maçlar

---

### 1.6 Overall Statistics (`get_ovd` Motoru)
- Oynanan Maçlar, Atılan/Yenilen Gol Ortalamaları, Gol Atma/Yeme Yüzdeleri
- Alt/Üst (1.5, 2.5, 3.5) ve KG Var Yüzdeleri
- **Dakikalara Göre Gol Histogramı (`goalsByTimePeriod`):** 0-15', 16-30', 31-45', 46-60', 61-75', 76-90'
- Şutlar (Toplam, İsabetli, İsabetsiz, Ceza Sahası İçi/Dışı)
- Paslar ve Topla Oynama Yüzdesi
- Ortalama İlk Olay Dakikaları (İlk Gol, İlk Korner, İlk Kart)
- Ataklar ve Tehlikeli Ataklar
- Disiplin (Sarı Kartlar, Kırmızı Kartlar, Fauller, Tackles)

---

## 📊 2. YENİ MODÜLLER: EXTENDED ODDS & FINISHED MATCH STATS

### 2.1 Extended Odds (Açılan Çoklu Oranlar) Şeması
Oran kutularına tıklandığında açılan detaylı büro oranları:

```json
{
  "extendedOdds": {
    "bookmakers": [
      { "bookmaker": "Bet365", "odd1": "1.33", "oddX": "5.00", "odd2": "9.50", "payout": "96.1%" },
      { "bookmaker": "Unibet", "odd1": "1.30", "oddX": "5.25", "odd2": "10.00", "payout": "95.8%" }
    ],
    "asianLines": [
      { "line": "-1.5", "homeOdd": "1.95", "awayOdd": "1.85" },
      { "line": "-2.0", "homeOdd": "2.60", "awayOdd": "1.45" }
    ],
    "movements": {
      "home": { "opening": "1.45", "current": "1.30", "trend": "down" },
      "away": { "opening": "7.50", "current": "9.50", "trend": "up" }
    }
  }
}
```

---

### 2.2 Finished Match Events (Bitmiş Maç Olayları) Şeması
Sonuçlanan maçların skoruna tıklandığında açılan maç olayları:

```json
{
  "events": {
    "hasEvents": true,
    "goals": [
      { "minute": "12'", "player": "Rafa Silva", "teamSide": "home", "isPenalty": false, "isOwnGoal": false },
      { "minute": "45+1'", "player": "Ciro Immobile", "teamSide": "home", "isPenalty": true, "isOwnGoal": false },
      { "minute": "73'", "player": "Ahmed Kutucu", "teamSide": "away", "isPenalty": false, "isOwnGoal": false }
    ],
    "cards": [
      { "minute": "28'", "player": "Al-Musrati", "teamSide": "home", "type": "yellow" },
      { "minute": "88'", "player": "Caner Erkin", "teamSide": "away", "type": "red" }
    ],
    "substitutions": [
      { "minute": "62'", "in": "Semih Kılıçsoy", "out": "Ciro Immobile", "teamSide": "home" }
    ]
  }
}
```

---

## 🚀 3. APEX API ENTEGRASYON SÖZLEŞMESİ (CONTRACT)

| APEX DB Kolonu | Bot JSON Kaynağı | Format / Dönüşüm |
| :--- | :--- | :--- |
| `raw_bot_json` | Tüm `match_data.json` | JSON string (Sıfır veri kaybı) |
| `home_team` | `hero.homeTeam` | String |
| `away_team` | `hero.awayTeam` | String |
| `home_logo` | `hero.homeLogo` | URL |
| `away_logo` | `hero.awayLogo` | URL |
| `form_home` | `hero.homeForm.join('-')` | `"W-W-D-L-W-W"` |
| `form_away` | `hero.awayForm.join('-')` | `"D-W-D-W-W-L"` |
| `odd_1` | `markets["1X2"].odd` | Float (`1.30`) |
| `prob_home` | `markets["1X2"].prob1` | Float (% çıkarılır: `0.61`) |
| `correct_score` | `markets["1X2"].correctScore` | String (`"3-1"`) |
| `overall_stats` | `overallStats` (tümü) | JSON Objesi |
| `h2h_data` | `h2h` (tümü) | JSON Objesi |
| `last_matches` | `lastMatches` (tümü) | JSON Objesi |
| `markets_data` | `markets` (tümü) | JSON Objesi |
| `distance_data` | `distance` (tümü) | JSON Objesi |
