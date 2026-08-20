# BPA V3 / BOTV3 - ALTIN STANDART ÇALIŞAN YEDEK
Tarih: 2026-08-20 19:13:50

Bu klasör, Forebet botunun %100 eksiksiz (107KB+ altın JSON standardı), 1:1 Forebet Canlı Maç Merkezi (HTML Viewer) ve süper hızlı çalışan motorunun tam ve bağımsız yedeğidir.

## Klasör İçeriği:
- core/               -> Puppeteer Stealth tarayıcı motoru ve ağ optimizasyonu
- parsers/            -> 10 modülün tamamını sıfır sahte veriyle çeken parserlar:
                         parse_hero, parse_markets, parse_h2h_intro, parse_distance,
                         parse_standings, parse_injuries, parse_last_matches,
                         parse_overall_stats, parse_next_matches, parse_match_center
- viewer/             -> 1:1 Forebet Masaüstü Canlı Maç Merkezi (template_viewer.html, generate_viewer.js)
- scrape_match.js     -> Tek maç motoru (Promise.all paralel ayrıştırma)
- daily_pipeline.js   -> Günlük 4-sekmeli paralel toplu kazıma pipeline'ı
- server.js           -> Express Dashboard kontrol paneli ve on-demand viewer sunucusu
- public/             -> Modern Dark-Mode GUI Kontrol Paneli arayüzü
- tools/              -> 9 adet test ve denetim aracı

## Nasıl Çalıştırılır?
1. Tek maç testi:
   node scrape_match.js --url="https://www.forebet.com/en/football/matches/..."
2. GUI Kontrol Paneli:
   BPA_Agent_Launcher_GUI.bat veya node server.js (http://localhost:3050)
