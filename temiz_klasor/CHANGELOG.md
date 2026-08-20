# 📜 BOTV3 — Sürüm Değişiklik Günlüğü (CHANGELOG.md)

Tüm önemli değişiklikler, yeni modüller ve hata düzeltmeleri bu dosyada [Semantic Versioning](https://semver.org/) kurallarına göre tutulur.

## [3.3.2] — 2026-08-20
### 🚀 Temiz Klasör Paketi, Canlı Log Akışı & Çoklu Sunucu Senkronizasyonu
- **Temiz Paket Oluşturuldu (`temiz_klasor/`):**
  - Tüm gereksiz önbellek, geçici profil ve artık dosyalardan arındırılmış, 11 skill, 10 parser, 9 test aracı, tüm maç geçmişi ve dokümanları içeren taşınabilir temiz proje klasörü hazırlandı.
- **Port 3000 & Port 3050 Çift Sunucu Uyumluluğu:**
  - `bpa_desktop_agent.js` ve `server.js` içine `outputDir` yapılandırması (`config.json`), canlı SSE log akışı ve `/api/recent-matches` çıktı tarama motoru entegre edildi.
- **`daily_pipeline.js` Bağımlılık Restorasyonu:**
  - `BPA_Agent_Launcher_GUI.bat` üzerinden tetiklenen `daily_pipeline.js` eksikliği giderildi, otomatik maraton ve günlük tarama süreçleri bağlandı.
- **Canlı Log Akışı & SSE Standardı:**
  - Web UI'de hem `EventSource.onmessage` hem de özel `addEventListener('log')` dinleyicileri aktif edilerek tüm tarayıcı ve sunucu varyasyonlarında anlık terminal akışı sağlandı.
- **Viewer & Kıyasla Dinamik Üretim:**
  - Her çekilen maç için `viewer.html` otomatik üretilmekte olup, eksik eski kayıtlar için de API seviyesinde anında dinamik oluşturma sağlandı.

## [3.3.1] — 2026-08-20
### ⚡ Full Master Rich Data Pipeline & Concurrency Reliability Fixes
- **Tam Veri Bütünlüğü ve Sıralı İcra Garantisi (`scrape_match.js` & `program/scrape_match.js`):**
  - Sayfa içi parserlar tek sekmede çakışmayı ve veri kaybını önlemek için güvenli sıralı icraya alındı; 10 modül (Hero, 9 Market, Extended Odds, Distance, H2H, Standings, Injuries, Last 6 Matches 4-blok, Overall Stats, Next Matches FDR 1-5, Match Center Olayları/Kadroları) eksiksiz 100KB+ şemaya aktarıldı.
  - `londrina-atl-tico-go-2442881` ve `besiktas-ey-pspor-2494866` maçları 12-14 saniyede sıfır sahte veriyle (zero-mock) tam doğrulandı.
- **1:1 HTML Viewer Kayıt Onarımı:**
  - `generateMatchViewer` dosya yolu hedeflemesi düzeltilerek `viewer.html` çıktısının her maç için otomatik üretilmesi sağlandı.
- **Server Worker Havuzu Düzeltmesi (`server.js` & `program/server.js`):**
  - Tarayıcı kapandıktan sonra tetiklenen mükerrer worker döngüsü temizlendi, eşzamanlı maraton kazıma kararlılığı güvenceye alındı.

## [3.3.0-GOLDEN-MASTER] — 2026-08-20
### 🏆 BPA V3 Golden Master Release (Tüm Modüller Tamamlandı)
- **Kapsamlı Veri Çıkarımı:**
  - 9 Tahmin Pazarı (1X2, U/O 2.5, HT 1X2, HT/FT, BTTS, Double Chance, Handicap, Corners, Cards).
  - Extended Odds (Büro oranları & handikap/oran hareketleri popup'ı).
  - Match Center Olayları (Goller, asistler, penaltılar `✔/✖`, kartlar `🟨/🟥`, ilk 11 kadroları, yedekler, değişiklikler, maç içi şut/topla oynama barları).
  - H2H, 4 Bloklu Son Maçlar Formu, 10 Kategorili Overall Stats, Straight Line Distance (`3900km`), Next Matches Fixture Difficulty (1-5 FDR & View all).
  - Oynanmamış maçlarda net skor koruması (`-` / `Upcoming`).
- **Otomasyon & Dağıtım Altyapısı:**
  - `run_bot.bat` interaktif terminal kontrol paneli eklendi.
  - Canlı hosting/staged APEX API URL ve Gizli Anahtar desteği (`config.json` / CLI parametresi).

## [3.2.9-PRO] — 2026-08-20
### 🎯 Distance & Upcoming Score Parsing Fixes
- **Straight Line Distance Seçici İyileştirmesi (`parsers/parse_distance.js`):**
  - Forebet'te H2H yüzdeler çubuğu olan `.st_dstc` yerine doğrudan gerçek mesafe modülü olan `.dist_cnt` hedeflendi.
  - `hasDistance: true`, `km: "3900km"`, şehirler ve stadyum bilgileri eksiksiz ayrıştırıldı.
- **Oynanmamış (Upcoming) Maçlarda Skor Alanına Oran Sızmasının Engellenmesi (`parsers/parse_hero.js`):**
  - Skor seçicisi yalnızca doğrulanmış `\d+ - \d+` formatındaki gerçek skor kutularıyla sınırlandırıldı (`evhdbte` ve gövde fallback'leri kaldırıldı).
  - Oynanmamış maçlarda `score: "-"`, `finalScore: "-"` ve `status: "Upcoming"` standardı sağlandı.

## [3.2.8-PRO] — 2026-08-20
### 🎯 Next Matches & Fixture Difficulty (1:1 Forebet FDR & View All Desteği)
- **Tüm Fikstür ve Zorluk Puanları (`parsers/parse_next_matches.js`):**
  - Forebet `.diff_blocks_container` yapısından ilk 6 maç ve `hidd_stat` içindeki tüm gelecek maçlar, lig ve tarih bilgisiyle çıkarıldı.
  - Zorluk seviyeleri (`Easy 1 ... Severe 5`) renk kodlarına göre 1-5 puan skalasında işlendi.
- **1:1 Forebet Kartı ve Skala Çubuğu (`viewer/template_viewer.html`):**
  - `LDU NEXT MATCHES DIFFICULTY MIR` başlığı, 5 renkli skala barı ve 2 sütunlu şık kart tasarımı yerleştirildi.
  - Ortalanmış `View all` butonuyla 6 maçtan 16 maça kadar dinamik açılma/kapanma sağlandı.

## [3.2.7-PRO] — 2026-08-20
### 🎯 Forebet DOM 1:1 Kronolojik Olay & Scoreboard Sıralaması (HT, FT, AET, PEN)
- **Doğrudan Olay Akışı Scoreboardları (`type: "scoreboard"`):**
  - Forebet'in `.match-events__scoreboard` satırları (HT, FT, AET, PEN) hiçbir yapay hesaplama yapılmaksızın Forebet DOM'unda geldiği sırayla `events` listesine eklendi.
- **Stenhousemuir vs Motherwell Doğrulaması:**
  - 85' oyuncu değişikliği ➡️ 90+3' sarı kart ➡️ **`FT 0-0`** ➡️ 91' uzatma oyuncu değişikliği ➡️ ... ➡️ 120' sarı kart ➡️ **`AET 1-0`** kusursuz sıralandı.
- **FFV Erfurt W vs Ingolstadt W Doğrulaması:**
  - 20' gol ➡️ **`HT 0-1`** ➡️ 67' kırmızı kart ➡️ 90+4' gol ➡️ **`FT 1-1`** ➡️ **`AET 1-1`** ➡️ Penaltı atışları birebir aynı sırayla aktarıldı.

## [3.2.6-PRO] — 2026-08-20
### 🎯 Penaltı Skoru (`Pen. 1-4`), Uzatma Skoru (`AET 1-0`), Nizami Rozetler & Modal Header
- **Net Penaltı ve Uzatma Skorları (`penScore: "1-4"`, `aetScore: "1-0"`):**
  - Forebet `.match_res_status` alanı regex ile taranarak genel "Yes" yerine net skor sayıları (`Pen. 1-4`, `AET 1-0`) JSON şemasına aktarıldı.
- **Hero Skor Satırı (1:1 Nizami Forebet):**
  - Üst üste yığılan 4 ayrı kırmızı kutu kaldırıldı. Forebet standartlarında tek bir satır (`Pen. 1-4 • FT • HT: 0-1`) haline getirildi.
- **Match Center Modal Başlığı:**
  - Modal üst kısmında penaltı/uzatma rozeti (`Pen. 1-4` / `AET 1-0`), ana skor (`1 - 1` / `0 - 0`) ve `Full time (HT 0-1)` 1:1 Forebet masaüstü düzenine bağlandı.
- **Penaltı Olayları & Zaman Çizelgesi (Timeline):**
  - Gol olan penaltılar `(pen.) ✔` (yeşil top), kaçan penaltılar `(pen.) ✖` (kırmızı çarpı) ile ayrıştırıldı.
  - Maç içi olaylar zaman çizelgesine `HT`, `FT`, `AET` ve `PEN` ara çubukları kronolojik olarak yerleştirildi.

## [3.2.5-PRO] — 2026-08-20
### 🎯 Double Chance Yüzdesi & Özel Maç Durumları (Pen., AET, Cancl.)
- **Double Chance Yüzdesi (1:1 Forebet):**
  - Forebet'in Double Chance pazarındaki `Prob. % 1X/2X/12` tek yüzdelik yapısı (`76%`) ve pick (`X2`) `parsers/parse_markets.js` ve `viewer/template_viewer.html` içinde tam 1:1 formatlandı.
- **Penaltılara Kalan Maçlar (Pen. FT):**
  - `.ladtm` içindeki "Pen." indikatörü algılanarak `status: "Pen. FT"` ve `penScore: "Yes"` olarak çıkarıldı (Örn: `FFV Erfurt W vs Ingolstadt W`).
- **Uzatmaya Giden Maçlar (AET FT):**
  - `.ladtm` içindeki "AET" indikatörü algılanarak `status: "AET FT"` ve `aetScore: "Yes"` olarak çıkarıldı (Örn: `Stenhousemuir FC vs Motherwell`).
- **İptal Edilen / Ertelenen Maçlar (Cancl. / Postp.):**
  - `.l_min` içindeki "Cancl." indikatörüyle `status: "Cancl."` ve `score: "-"` olarak bağlandı; tablodaki oranların skor sanılması engellendi (Örn: `PSK Dinskaya vs Pobeda`).

## [3.2.4-PRO] — 2026-08-20
### 🎯 Lig Bayrağı, Ülke/Lig/Raunt Tespiti, Hava Durumu & HT/Penaltı Skorları
- **Lig Bayrağı, Ülke ve Lig Adı:**
  - Forebet'in `getstag` parametreleri (`country`, `league`, `flagCode`, `leagueUrl`) ve `img.flsc` bayrakları dinamik olarak çözüldü (Örn: `Colombia`, `Primera A`, `https://www.forebet.com/images/fc/co.png`).
- **Raunt (Round) Tespiti:**
  - Sayfa başlıkları ve `.heading` elemanlarından maçın raunt/tur bilgisi çıkarıldı (Örn: `Round 30, Clausura`, `1/8-finals`).
- **Hava Durumu (`weather`):**
  - `.prwth .wnums` ve DOM elemanlarından sıcaklık bilgisi (`23°`, `27°`) çekilerek Hero ve market tablolarına bağlandı.
- **İlk Yarı (HT), Uzatma (AET) ve Penaltı Skorları:**
  - `.lscr_td .ht_scr` ve Match Center period verileriyle ilk yarı skorları (`HT 0-1`), uzatma (`AET`) ve penaltılar (`Pen. 4-3`) hem Hero kartına hem de tablodaki `Score` hücresine parantez içinde eklendi.
- **Hero Çift Skor Çakışması Giderildi:**
  - Forebet tahmini (`Pred: 1-1`) sarı rozetle, resmi maç skoru (`1 - 1 FT`) ise Match Center rozeti olarak Forebet 1:1 orijinal düzenine kavuşturuldu.

## [3.2.3-PRO] — 2026-08-20
### 🎯 Bitmiş Maç Tahmin Sonuçlandırması & Sadece 3 Markette Extended Odds Standardı
- **Bitmiş Maçlarda Tahminlerin Sonuçlandırılması (FT Win / Loss):**
  - Forebet DOM'unda `data-minute="FT"` ve `blink_me` sınıfının canlı maç sanılarak `pending`'de takılması sorunu çözüldü.
  - FT bitmiş tüm maçlarda 1X2 (`1`, `X`, `2`), Under/Over 2.5 (`Under`, `Over`), BTTS (`Yes`, `No`), HT (`1`, `X`, `2`), HT/FT (`X/X`, `1/1` vb.) ve Double Chance pazarları maçın resmi FT ve HT skoruna göre anında `win` (yeşil) veya `loss` (kırmızı) olarak kesin sonuçlandırıldı.
- **Sadece 3 Markette Açılan Büro Oranı (Extended Odds):**
  - Kullanıcı kuralı doğrultusunda açılan büro oranları (Extended Odds) kesin olarak sadece 3 pazara sınırlandırıldı:
    1. **1X2:** `1`, `X`, `2` açılan oranları.
    2. **Under/Over 2.5:** `under`, `over` açılan oranları.
    3. **BTTS (Both Teams To Score):** `yes`, `no` açılan oranları.
  - Diğer pazarlarda (`HT`, `HT_FT`, `Double Chance`, `Handicap`, `Corners`, `Cards`, `Scorers`) açılan barem bulunmadığı için `extendedOdds: null` yapıldı ve yalnızca tek normal `mainOdds` değeri aktarıldı.
- **Master Test Doğrulaması:**
  - `tools/run_all_tests.js` test paketi çalıştırılarak Cloudflare Stealth, Veri Kalitesi (%100.0) ve APEX REST Ingestion Sync (HTTP 200) testleri başarıyla doğrulandı.

## [3.2.2-PRO] — 2026-08-20
### 🎯 Hero Form Badges (6 Maç), Deplasman Logosu & Floating Odds Tooltip Düzeltmesi
- **6 Maçlık Hero Form Rozetleri:**
  - Forebet DOM'undaki `.prformcont` elemanları taranarak hem Ev Sahibi hem Deplasman için tam 6 maçlık form dizileri (`homeForm`: `W, W, D, W, D, W`, `awayForm`: `D, L, L, W, D, D`) eksiksiz çıkarıldı. Fallback sahte veri üretimi kaldırıldı.
- **Deplasman Logosu Filtrelemesi:**
  - Deplasman takımı logosu yerine hava durumu/bayrak resimlerinin seçilmesi önlendi; `.st_logo_box_img_container img` vb. gerçek takım logo kapsayıcıları filtrelenerek Red Bull Bragantino logosu (`icons/3861.png`) kusursuz bağlandı.
- **Forebet Hero Tahmin & Oran Kutusu (1:1 Floating Odds Dropdown):**
  - Forebet Hero kartı ortasına Forebet ana tahmin rozeti (`X`, `1`, `2`) ve tahmini skor/oran kutusu (`1 - 2`) eklendi.
  - Bu kutucuğa veya market tablolarındaki `Odds` butonlarına tıklandığında açılan `.odds-floating-tooltip` CSS stilleri, koyu z-index 999999 teması ve dinamik pozisyonlama mekanizması onarıldı.
- **Master Test Doğrulaması:**
  - `tools/run_all_tests.js` test paketi çalıştırılarak Cloudflare Stealth, Veri Kalitesi (%100.0) ve APEX REST Ingestion Sync (HTTP 200) testleri başarıyla doğrulandı.

## [3.2.1-PRO] — 2026-08-20
### 🛡️ Match Center İyileştirmeleri, Substitutions & Stats Bar Standardı
- **Atlético Mineiro vs RB Bragantino Match Center Doğrulaması:**
  - 60' ve 67' dakikalarındaki tüm değişiklikler (`Mateo Cassierra / Reinier`, `Alan Minda / Bernard`, `Henry Mosquera / Vinicinho`) başarıyla çekilerek hem `events` dizisine hem de Taktik Saha üzerindeki çıkış rozetlerine (`> 60'`, `> 67'`) aktarıldı.
- **Stats Bar 0-0 ve Yüzde Görseli:**
  - `template_viewer.html` içindeki `renderMcStats` fonksiyonunda her iki takımın değeri 0-0 olduğunda progress bar'ın yarı yarıya dolu görünmesi düzeltildi; toplam 0 iken boş nötr gri track görünmesi sağlandı.
- **Canlı Maç Dakika Zırhlama:**
  - `parse_hero.js` içinde canlı maç dakikası okunurken meydana gelebilecek çift kesme işareti (`61'' (Live)`) formatı `61' (Live)` olarak standartlaştırıldı.
- **Substitutions Tablosu Formatlaması:**
  - `renderMcLineups` fonksiyonunda dakika formatı (`60'`) iki sütunlu Ev/Deplasman ızgarasında çift tırnak tekrarsız temiz hale getirildi.
- **Uçtan Uca Çoklu Maç Doğrulaması:**
  - İki farklı maç (Atlético Mineiro vs RB Bragantino ve Beşiktaş vs Eyüpspor) kazınarak HTML Viewer üzerinde test edildi. Master Test Suite %100 PASS verdi.

## [3.2.0-PRO] — 2026-08-20
### ✨ 1:1 Taktik Futbol Sahası, Canlı Maç Güvenliği ve Kadro Değişiklikleri
- **1:1 Taktik Futbol Sahası (Tactical Pitch):**
  - Forebet'in saha çizgileri (orta saha yuvarlağı, ceza sahaları) ile donatılmış koyu gri taktik saha canvas'ı 1:1 inşa edildi.
  - Ev ve Deplasman Formasyon barları (`4-2-3-1`, `4-4-2`), logolar, takım kodları ve teknik direktörler entegre edildi.
  - Taktik saha üzerindeki oyuncular forma numarası, oyuncu ismi, gol (⚽), asist (`[A]`), sarı/kırmızı kart ve oyundan çıkış (`> 85'`) rozetleriyle render edildi.
- **Substitutions (Oyuna Giriş/Çıkış Tablosu):**
  - `▲ Yeşil Ok (Giren Oyuncu) / ▼ Kırmızı Ok (Çıkan Oyuncu) [Dakika]` eşleşmeleri ayrı bir tablo olarak çekildi ve renderlandı.
- **Substitutes (Yedek Kulübesi):**
  - Her iki takımın yedek oyuncuları eksiksiz 2 sütunlu kulübe listesi olarak eklendi.
- **Canlı Maç ve Tahmin Güvenliği:**
  - Oynanmakta olan canlı maçlarda dakika tespiti (`91'+5 (Live)`) sağlandı; maç resmi olarak FT bitmeden tahminlerin sonuçlandırılması engellenerek `pending` statüsünde kalması güvenceye alındı.
- **Stats Sekmesi CSS Onarımı:**
  - Stats sekmesindeki şut, pas, topla oynama ve korner çubukları iki renkli Forebet progress bar standardına kavuşturuldu.

## [3.1.0-PRO] — 2026-08-20
### ✨ Yeni Modüller ve Özellikler (Faz 2 & Faz 3)
- **Açılan Detaylı Oranlar (Faz 2 - Extended Odds & Trends across 9 Markets):**
  - `parsers/parse_markets.js` güncellendi; her tahmin pazarı satırındaki `.haodd` DOM bloklarından tüm açılan barem oranları yakalandı.
  - **1X2 Pazarı:** `1`, `X`, `2` açılan tüm oranlar ve `up`, `down`, `none` trend yönleri.
  - **Under/Over Pazarı:** `under`, `over` oranları.
  - **HT (İlk Yarı) Pazarı:** `1`, `X`, `2` oranları.
  - **BTTS (KG Var/Yok) Pazarı:** `yes`, `no` oranları.
  - **HTML Viewer Oran Popupları:** Tahmin tablolarındaki oran kutucuklarına tıklandığında açılan 1:1 Forebet siyah oran kutusu (`#oddsFloatingTooltip`) eklendi.
- **Bitmiş Maç Merkezi: Olaylar, Kadrolar ve İstatistikler (Faz 3 - Match Center):**
  - `parsers/parse_match_center.js` modülü yazıldı ve 10. adım olarak `scrape_match.js` motoruna bağlandı.
  - **Events (Olaylar):** Dakika dakika goller (atan, asist, penaltı, kendi kalesine, anlık skor), sarı ve kırmızı kartlar, oyuncu değişiklikleri ve penaltı atışları (`penalties: [ { player, scored, score } ]`).
  - **Line-ups (Kadrolar):** Stadyum, Kapasite, Hakem, Ev & Deplasman Dizilişleri (`4-4-2`, `4-2-3-1`), İlk 11 (Forma no, oyuncu adı) ve Yedekler listesi.
  - **Stats (İstatistikler):** Toplam şut, İsabetli şut, Ceza sahası içi/dışı şutlar, Topla oynama %, İsabetli paslar, Tehlikeli ataklar, Kornerler, Ofsaytlar, Disiplin kartları.
  - **1:1 HTML Viewer Match Center Modal:** Skora tıklandığında açılan 3 sekmeli (`Events`, `Line-ups`, `Stats`) canlı maç merkezi overlay ekranı (`#matchCenterModal`) yapıldı.
- **APEX API Veri İletimi:** Zenginleştirilmiş `matchCenter` ve `extendedOdds` nesneleri `raw_bot_json` ile APEX Ingester'a aktarıldı.

---

## [3.0.1-OPT] — 2026-08-20
### ⚡ Hızlandırma & Optimizasyon (Performance Tuning)
- **Sayfa İstek Filtreleme (`scrape_match.js`):** Tekil maç kazıyıcıya `setupPageInterception(page)` bağlandı. Ağır reklam ağları (Google Ads, Criteo, Taboola vb.) ve gereksiz medya istekleri engellenerek sayfa yüklenme süresi %40 hızlandırıldı.
- **DOM Reflow Darboğazları Giderildi (`parsers/parse_distance.js`, `parsers/parse_h2h_intro.js`):** Tüm sayfayı kapsayan binlerce `div` sorgusu (`querySelectorAll('div, section')`) kaldırılarak modül düzeyinde hedefli DOM sorgulamasına geçildi.
- **Dinamik Popup Bekleme Mekanizması (`parsers/parse_hero.js`):** Sabit 1.8 saniyelik statik `setTimeout` yerine `waitForSelector` tabanlı akıllı bekleme uygulandı.
- **Overall Stats Hızlandırması (`parsers/parse_overall_stats.js`):** Script tarama zaman aşımı 5.0 saniyeden 1.5 saniyeye optimize edildi.
- **Geçici Profil ve Bellek Temizliği (`core/browser_engine.js`, `core/daily_discovery.js`):** `closeBrowser(browser)` ile her işlem sonrası `temp_profiles/` altındaki profil klasörleri otomatik silinir hale getirildi; `discoverDailyMatches` sonundaki Chromium bellek sızıntısı giderildi.

### 🛡️ Hata Düzeltmeleri (Bug Fixes)
- **Zero-Mock İhlali Temizlendi (`parsers/parse_next_matches.js`):** Fikstür bulunamayan maçlara hardcoded sahte Türk takımı fikstürü ekleyen kod kaldırıldı; sıfır sahte veri kuralına tam uyum sağlandı.
- **H2H Takım Değişkeni Kapsamı (`parsers/parse_h2h_intro.js`):** `expAwayClean` tanımsızlık hatası giderildi, H2H maçlarında takım skor vurgulama mantığı güçlendirildi.
- **APEX API Senkronizasyon Uyumsuzluğu (`core/db_ingester.js`, `tools/test_apex_sync.js`):** Secret key `apex_secret_key_2026` ve endpoint `http://localhost/apex-api/api/import.php` olarak güncellendi. `match_data.json` nesnesi APEX Importer 19-tablo motoruna sıfır kayıpla (HTTP 200 - 30ms) bağlandı.
- **URL Slug & Çıktı Eşleşmesi (`scrape_match.js`):** Maç klasör slug'ları Forebet ID formatına tam uyumlu hale getirildi.

---

## [3.0.0-PRO] — 2026-08-19
### ✨ Eklendi (Added)
- **APEX Standartlarında Agent & Dokümantasyon Ekosistemi:**
  - Master Agent Rehberi: `AGENTS.md`
  - Cursor Kuralları: `.cursorrules`
  - Kalıcı Davranış & Prompt Şablonları: `.agents/rules/bot-behavior.md`, `.agents/rules/bot-prompt-templates.md`
  - 11 Yeni Modüler Agent Yeteneği (Skills):
    - `bot-forebet-scraper` (Temel kazıma & 9 market)
    - `bot-forebet-extended-odds` (Açılan büro oranları & handikap türevleri)
    - `bot-forebet-finished-match-stats` (Bitmiş maç skor tıklama, gol dakikaları, kartlar)
    - `bot-crawl-pipeline` (Günlük discovery & worker havuzu)
    - `bot-apex-sync` (APEX API REST iletim & JSON şema)
    - `bot-tools-suite` (CLI Teşhis ve Test araç seti kılavuzu)
    - `bot-data-quality-validator` (Veri kalitesi ve Zero-Mock doğrulama)
    - `bot-performance-tuning` (Puppeteer bellek & hız optimizasyonu)
    - `bot-viewer-renderer` (1:1 Forebet HTML Viewer)
    - `bot-testing-verification` (Test prosedürleri)
    - `bot-debug` (Cloudflare & Puppeteer sorun giderme)
  - 9 Bağımsız Teşhis ve Test Aracı (`tools/`):
    - `tools/run_all_tests.js` (Master test paketi)
    - `tools/test_cf_health.js` (Cloudflare & Stealth sağlık testi)
    - `tools/test_single_match.js` (Tek maç kazıma ve şema denetimi)
    - `tools/verify_data_quality.js` (Veri kalitesi ve Zero-Mock skorlama)
    - `tools/test_apex_sync.js` (APEX API REST iletim testi)
    - `tools/inspect_bot_json.js` (Maç JSON derinlemesine görsel inceleme)
    - `tools/test_daily_discovery.js` (Günlük maç keşif testi)
    - `tools/benchmark_scraper.js` (Hız ve RAM tüketimi benchmarkı)
    - `tools/clean_temp_files.js` (Geçici dosya ve profil temizleyici)
  - Proje Standartları: `PROJECT_STANDARDS.md`
  - Görev ve Çalışma Protokolü: `WORKFLOW.md`
  - Canlı Durum Panosu: `PROGRESS.md`
  - Geliştirici ve Yönetici Rehberleri: `GELISTIRICI.md`, `YONETICI.md`
  - Master Teknik Ek Doküman: `docs/BOT_FOREBET_ADDENDUM.md`
  - Yeni Kapsamlı `README.md`

### 🔧 Mevcut Altyapı (Faz 1)
- Puppeteer Stealth & Cloudflare Cookie Cache (`core/browser_engine.js`)
- 9 Ayrık DOM Parser Modülü (`parsers/` - Hero, Markets, H2H, Standings, Last Matches, Overall Stats, Distance, Next Matches, Injuries)
- 1:1 Forebet Masaüstü HTML Viewer Render Motoru (`viewer/template_viewer.html`, `viewer/generate_viewer.js`)
- Günlük Discovery & Tarih Aralığı Kazıma Motoru (`daily_crawler.js`, `date_range_crawler.js`, `core/crawl_pool.js`)
- Windows Tek Tıkla Başlatıcı BAT Scriptleri (`1_*.bat`, `2_*.bat`, `3_*.bat`, `4_*.bat`)
