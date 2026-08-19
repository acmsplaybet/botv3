---
name: bot-forebet-scraper
description: Puppeteer Stealth motoru, Forebet DOM seçicileri, 9 tahmin marketi, H2H, Son 6 maç ve Overall Stats kazıma kuralları
---

# BOTV3 — Forebet Master Scraper Skill

## 1. MİMARİ VE ÇALIŞMA PRENSİBİ
`botv3` Forebet maç sayfalarını (`https://www.forebet.com/en/football/matches/...`) Puppeteer Stealth motoru ile açar, Cloudflare engellerini aşar ve sayfadaki tüm bölümleri modüler parser fonksiyonları ile JSON şemasına normalize eder.

### Çıktı Dosyaları:
- `output/<match-slug>/match_data.json` → Saf ve filtrelenmemiş ham/normalize veri.
- `output/<match-slug>/viewer.html` → 1:1 Forebet Masaüstü görünümüne sahip bağımsız HTML dosyası.

---

## 2. MODÜLER PARSER HARİTASI
Her veri bloğu `parsers/` altındaki özel bir modül tarafından işlenir:

| Modül | Görev & Çıkarılan Alanlar | Kaynak DOM Seçicileri |
| :--- | :--- | :--- |
| `parsers/parse_hero.js` | Ev/Dep takım adları, logolar, lig, ülke, raunt, tarih/saat, stadyum, hava durumu, maç skoru/durumu, form dizileri | `.st_hteam`, `.st_ateam`, `.st_lgs`, `.st_date`, `.st_venue`, `.st_weather`, `.st_res`, `.st_hteam_form span` |
| `parsers/parse_markets.js` | 9 Tahmin Marketi: 1X2, U/O 2.5, HT, HT/FT, BTTS, Handicap, Scorers, Corners, Cards | `#tab_1x2`, `#tab_uo`, `#tab_ht`, `#tab_htft`, `#tab_bts`, `#tab_handicap`, `#tab_scorers`, `#tab_corners`, `#tab_cards` |
| `parsers/parse_h2h_intro.js` | Geçmiş karşılıklı maçlar (H2H), özet galibiyet/beraberlik yüzdeleri ve Forebet AI özet metni | `.h2h_table tr`, `.st_perc_stat`, `.match_intro_text` |
| `parsers/parse_standings.js` | Lig puan durumu tablosu, aktif takımların sarı vurgulanması (`highlight: true`) | `table.teamtablesp`, `table.standings` |
| `parsers/parse_last_matches.js` | 2x2 Grid Form Tabloları (Ev genel, Dep genel, Ev evinde, Dep deplasmanda) | `.schema_last_matches`, lig filtre sekmeleri |
| `parsers/parse_overall_stats.js` | `get_ovd` istatistik motoru verileri: Goller, dakikalara göre gol histogramı, şutlar, paslar, topla oynama, ataklar, disiplin | `.os_played_games_container`, `.os_goals_section1_main`, `.os_goals_by_tp_cont`, `.os_shots_parent`, `.os_passes_container`, `.os_aggressions_cont` |
| `parsers/parse_distance.js` | Takımların şehirleri ve aralarındaki kuş uçuşu mesafe (km) | `.st_dstc`, `.st_distance` |
| `parsers/parse_next_matches.js` | Takımların gelecek 3-5 fikstür maçı ve FDR zorluk dereceleri | `.next_matches_cont` |
| `parsers/parse_injuries.js` | Sakat ve cezalı oyuncu listeleri | `.injuries_wrap`, `.inj_player` |

---

## 3. SIFIR SAHTE VERİ (ZERO-MOCK) KURALI
1. Botun çekemediği veya maç sayfasında yer almayan alanlar için kesinlikle sahte/tahmini veri üretilmez.
2. Eksik alanlar için `null`, `""` veya `"-"` değeri verilir.
3. Form dizileri bulunamazsa `[]` boş dizi atanır.

---

## 4. GÜVENLİ ERİŞİM (UNDEFINED ZIRHI)
Tüm parser fonksiyonlarında ve yardımcı dosyalarda zincirleme erişimler güvenli yapılmalıdır:

```javascript
// Yanlış:
const homeProb = data.markets["1X2"].prob1; // 1X2 undefined ise çöker!

// Doğru:
const homeProb = data?.markets?.["1X2"]?.prob1 ?? "-";
const homeForm = Array.isArray(data?.hero?.homeForm) ? data.hero.homeForm : [];
```

---

## 5. TEST VE ÇALIŞTIRMA KOMUTU
Tekil bir maçın tüm bölümlerini denetlemek için:
```bash
node scrape_match.js --url="https://www.forebet.com/en/football/matches/besiktas-eyupspor-2494866"
```
Çıktı `output/besiktas-eyupspor-2494866/` dizininde incelenir.
