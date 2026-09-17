# 📜 BOTV3 — Sürüm Değişiklik Günlüğü (CHANGELOG.md)

Tüm önemli değişiklikler, yeni modüller ve hata düzeltmeleri bu dosyada [Semantic Versioning](https://semver.org/) kurallarına göre tutulur.

## [4.0.6] — 2026-09-17
### 🕒 Windows Görev Zamanlayıcısı Otomatik Silme, Çift Kalkanlı Cron Koruması & Tam Sistem Yedeği
- **Windows Görev Zamanlayıcısı Otomatik Silme (`core/scheduler_manager.js`):**
  - Panelden veya `config.json` / `bpa_local_config.json` üzerinden zamanlayıcı kapatıldığında (`automation_active: false`), Windows Görev Zamanlayıcısı'nda kayıtlı `BPA_Bot_Morning` ve `BPA_Bot_Evening` görevleri anında `schtasks /delete` ile işletim sisteminden silinir.
  - Zamanlayıcı tekrar açıldığında (`automation_active: true`) görevler otomatik olarak oluşturulur ve belirlenen saatlere senkronize edilir.
  - Bağımsız CLI aracı `tools/remove_tasks_cli.js` ve güncellenen `remove_windows_tasks.bat` ile tek tıkla görev silme altyapısı sağlandı.
- **`--cron` Koruma Kalkanı (`daily_pipeline.js`, `RUN_EVENING_1700.bat`, `RUN_MORNING_0600.bat`):**
  - Windows bat betiklerine `--cron` bayrağı entegre edildi.
  - `daily_pipeline.js` başlatılırken `--cron` bayrağı varsa ve `automation_active === false` ise Chromium tarayıcı pencereleri açılmadan ve bellek harcanmadan anında (0.2 saniyede) bilgilendirme mesajıyla çıkış yapılır.
- **Git Deposu & .gitignore İyileştirmesi:**
  - `data/` yerel taranmış veri klasörü, geçici ekran görüntüleri ve sinyal dosyaları `.gitignore` ile izole edilerek temiz kaynak kod, araçlar ve başlatıcılar git'e hazır hale getirildi.

## [4.0.5] — 2026-09-16
### 🛡️ BPA Control Center v4.5: Kendi Kendini Onaran Watchdog, Mutex Zombi Kalkanı & Canlı Dağıtım Paketi Güncellemesi
- **Kendi Kendini Onaran Başlatıcı Mimarisi (`BPA_Control_Center.cs` & `BPA_Control_Center.exe`):**
  - Arka planda kilitli kalan veya zombi olan eski `BPA_Control_Center` süreçleri için akıllı sağlık denetimi eklendi.
  - Bota tekrar tıklandığında eğer port 3000 kapalıysa (Node.js düşmüşse), eski askıda kalmış süreçler otomatik temizlenir ve sunucu sıfırdan ayağa kaldırılır.
  - 5 saniyelik **Sağlık Bekçisi (Watchdog)** arka plan thread'i entegre edildi: Node.js herhangi bir sebeple kapandığında 5 saniye içinde kendi kendini yeniden başlatır.
  - Tarayıcı App penceresi (`OpenAppTab`), backend `HTTP 200` vermeden asla açılmaz; `ERR_CONNECTION_REFUSED` ekranı tamamen engellendi.
- **Canlı Dağıtım Paketi (`BPA_V4_APEX_DEPLOY.zip`):**
  - 7 Eylül tekil gün tarih aralığı düzeltmesi (`daily_pipeline.js`), yeni `BPA_Control_Center.exe`, Windows görev zamanlayıcıları ve canlı APEX API ayarlarıyla sıfırdan paketlendi.

## [4.0.4] — 2026-09-16
### 🐛 Kritik Düzeltme: Tarih Aralığı (Date Range) Tek Gün Kazıma URL Çakışması
- **Kök Neden Tespiti:**
  - `daily_pipeline.js` dosyasında `targetUrl` değişkeni başlatılırken günün varsayılan tarihiyle (`.../predictions-1x2/YYYY-MM-DD` - Bugün) dolduruluyordu.
  - Arayüzden tek bir gün için tarih aralığı girildiğinde (`07.09.2026 -> 07.09.2026`), `dates.length === 1` koşulu doğru dönüyor ve `daily_pipeline.js` satır 617'deki `(targetUrl && dates.length === 1)` mantığı nedeniyle hedeflenen geçmiş tarih yerine bugünün (16 Eylül) Forebet sayfası açılıyordu.
  - Bot 16 Eylül maçlarını kazıyıp `predictions_2026-09-07.json` adıyla diske kaydediyor ve APEX API'ye iletiyordu. APEX API ise maçların içindeki gerçek maç tarihini (`16/09/2026`) okuduğu için maçları 16 Eylül tablosuna kaydediyor, 7 Eylül panelde boş (0 maç) kalıyordu.
- **Çözüm:**
  - `daily_pipeline.js` içinde `explicitUrl` mimarisine geçildi. Yalnızca kullanıcı komut satırından açıkça `--url=...` parametresi geçtiğinde özel URL kullanılır; tarih aralığı veya tekil tarih taramalarında URL her zaman kesin olarak `https://www.forebet.com/en/football-predictions/predictions-1x2/${dStr}` formatında dinamik üretilir.
  - Böylece arayüzden veya cron'dan hangi tarih veya tarih aralığı verilirse verilsin her zaman tam doğru günün Forebet sayfasına gidilmesi garantilendi.

## [4.0.3] — 2026-09-16
### 🛡️ BPA Control Center v4.3: Temiz Başlangıç Kalkanı, Sistem Tepsisine Küçültme, Güvenli Kapatma & Zamanlayıcı (Cron) Toggle
- **Temiz Başlangıç & `ERR_CONNECTION_REFUSED` Kalkanı (`BPA_Control_Center.cs` & `BPA_Control_Center.exe`):**
  - EXE açıldığında arkada askıda kalan eski zombi süreçler ve port 3000'i bloke eden süreçler otomatik temizlenir.
  - `node bpa_desktop_agent.js` başlatıldıktan sonra `http://localhost:3000/api/status` adresinden geçerli `HTTP 200 OK` yanıtı alınana kadar (100ms aralıklarla) beklenir; pencere sunucu hazır olmadan asla açılmaz.
  - Böylece kullanıcının `localhost bağlanmayı reddetti` beyaz/siyah ekranıyla karşılaşması engellendi.
  - İzole Edge profil klasörü (`temp_profiles/bpa_app_profile`) ile ana Edge tarayıcısından bağımsız, kendi PID'sine sahip gerçek bir masaüstü penceresi garantilendi.
- **Sistem Tepsisine (System Tray) Küçültme (`_` Butonu & Tray Menüsü):**
  - Panel başlığına `🗕` (Tepsiye Küçült) butonu eklendi.
  - Tıklandığında pencere görev çubuğundan ve ekrandan gizlenip Windows saat yanındaki bildirim alanına (System Tray) alınır.
  - Windows bildirim balonu ile bilgi verilir; tepsi simgesine çift tıklandığında veya menüden tıklandığında pencere anında geri yüklenir (`SW_RESTORE` + `SetForegroundWindow`).
- **Onaylı ve Güvenli Sistem Kapatma (Zero-Zombie Full Shutdown):**
  - Kapatma butonuna (`X` veya Çıkış) basıldığında estetik onay modalı ("Tüm sistemi kapatmak istediğinize emin misiniz?") çıkarılır.
  - Onay verildiğinde `/api/shutdown` tetiklenir; tüm Chromium tarayıcı pencereleri, Node.js ana motoru ve scraper işçileri temizce kapatılır; arkada sıfır zombi süreç bırakılır.
- **Tek Tıkla Otomatik Zamanlayıcı (Cron) Aç/Kapat Desteği:**
  - Panel üst başlığına `🕒 Zamanlayıcı: AÇIK / KAPALI` durum butonu eklendi; tek tıkla zamanlayıcılar anında durdurulabilir veya açılabilir.
  - Ayarlar modalına `Günlük Otomatik Zamanlayıcılar (Cron)` switch'i entegre edildi.
  - Sistem Tepsisi (Tray) sağ tık menüsüne `⏰ Otomatik Zamanlayıcıyı Değiştir` kısayolu eklendi.
- **Canlı Bülten Senkronizasyonu & APEX Durum Çelişkisi Teşhisi:**
  - Dünün bülteninden 194 maçın Forebet'ten kazınarak APEX canlı API'sine başarıyla aktarılması.
  - Canlı oynanırken kazınmış maçların (`49 (Live)`) APEX panelinde "Bekleyenler: 0" iken tabloda "Bekliyor" rozetine düşmesine yol açan `master-bulletin.js` (Satır 421) ve `Importer.php` çelişkisinin kök neden tespiti ve APEX geliştiricisine iletilecek hazır teknik prompt hazırlandı.

## [4.0.2] — 2026-09-16
### 📅 5. Ana Navigasyon Sekmesi: Bülten & APEX Radarı, Günlük Tarih Matrisi & Maç İnceleme Çekmecesi
- **5. Ana Navigasyon Sekmesi Eklendi (`index.html`):**
  - Üst gezinme çubuğuna `📅 Bülten & APEX Radarı` sekmesi eklendi.
  - Tıklandığında anında `view-bulletin-tracker` görünümüne geçiş yapılır.
- **5 KPI Özet Göstergeleri:**
  - `Kayıtlı Gün (54 Gün)`, `Toplam Maç (20.364)`, `🟢 Biten Maç (17.614 FT)`, `⏳ Bekleyen Maç (2.750)`, `📡 APEX Eşitleme (%100)` sayaçları eklendi.
- **Günlük Bülten Tarih Matrisi Tablosu:**
  - `data/` ve `data/archive/` altındaki tüm bültenleri kronolojik olarak sıralar.
  - Bitiş Oranı renkli progress barı (`%100`, `%85`, vb.) ve APEX aktarım durum rozetleri (`✔ Eşitlendi`, `🔴 Aktarılmadı`) görüntüler.
- **Hızlı Satır İçi Aksiyonlar:**
  - `👁️ İncele`: Tarihin tüm maçlarını sayfa altındaki çekmecede anında açar.
  - `📡 APEX'e Aktar`: Forebet'e gitmeden doğrudan yerel JSON'u canlı APEX API'ye aktarır (Offline Sync).
  - `🔄 Güncelle`: Forebet'ten skor ve sonuçları zorla yenileyerek baştan çeker.
  - `📥 JSON`: `predictions_YYYY-MM-DD.json` dosyasını tarayıcıdan indirir.
- **Anlık Arama & Filtrelemeli Maç İnceleme Çekmecesi (Drawer):**
  - Takım adı, ülke veya lige göre harf harf anlık arama desteği.
  - `Tümü`, `🟢 Bitenler (FT)`, `⏳ Bekleyenler`, `⚠️ Gecikenler` hızlı filtre butonları.
  - Maç saati geçtiği halde skoru gelmeyen karşılaşmalar için otomatik `⚠️ GECİKTİ` alarmları.
  - Takım logoları, FT skorları, 1X2 tahmin ve oranları, ilk yarı (İY) skorları ve 1:1 Canlı Viewer butonları eklendi.
- **5 Dakikalık Akıllı Bellek Önbelleği (`bpa_desktop_agent.js`):**
  - 54 gün ve 20.364 maçlık JSON verisi RAM'de 300 saniye önbelleğe alınarak sekme geçişleri ve sayfa yenilemeleri <1 milisaniyeye indirildi.
- **Dağıtım Paketi Güncellendi:**
  - `BPA_V4_APEX_DEPLOY.zip` (0.29 MB) tüm yeniliklerle güncellendi.

## [4.0.1] — 2026-09-16
### 🎨 UI Responsive Ölçeklendirme, Boş Sekme (DOM) Onarımı & Biten Maçları Akıllı Yenileme
- **Mükerrer Tarayıcı Sekmesi Kapatıldı (`bpa_desktop_agent.js`):**
  - `BPA_Control_Center.exe` başlatıldığında hem native masaüstü penceresi hem de harici tarayıcıda `localhost:3000` sekmesinin açılmasına yol açan otomatik `exec('start http://localhost:${PORT}')` komutu kaldırıldı. Artık yalnızca bağımsız uygulama penceresi açılır.
- **Boş Sekmeler DOM Hiyerarşisi Onarımı (`index.html`):**
  - "Görev Yöneticisi & Acil Fren", "Sistem Sağlık Radarı" ve "Canlı Terminal & Loglar" sekmelerinin tıklandığında siyah/boş ekran vermesine neden olan `#view-dashboard` kapanış tagi eksikliği giderildi. Tüm sekmeler `<main>` altında bağımsız birinci sınıf görünümlere kavuşturuldu.
- **100% Zoom & Yüksek DPI Responsive Ölçeklendirme (`index.html`):**
  - Üst başlık şeridi (`.top-header`), canlı metrikler (`.header-metrics-strip`) ve kontrol butonları (`.controls-row`) esnek flex-wrap yapısına geçirildi.
  - Windows %125 ve %150 ekran ölçeklendirmelerinde butonların ve metriklerin sağa taşması engellendi.
  - `date-range-box` üzerindeki sağa itme (`margin-left: auto`) kaldırılarak butonların temiz ve hizalı satır atlaması sağlandı.
  - 1366px ve 1150px için responsive `@media` kuralları eklendi.
- **Biten Maçları Otomatik & Akıllı Yeniden Kazıma (`daily_pipeline.js`, `bpa_desktop_agent.js`):**
  - Dünün veya geçmiş günlerin maçları daha önce oynanmadan (skorsuz/Upcoming) çekilmiş olsa bile, önbellek kontrolünde `isPastOrToday && !hasFinalScore` kuralı uygulandı.
  - Skorsuz/bitmemiş maçlar asla atlanmaz; Forebet'ten güncel bitiş skorları (`FT`), ilk yarı skorları (`HT`), kartlar ve kornerlerle yeniden çekilerek önbelleğin ve `output/` dizininin üzerine yazılır.
- **Zorla Yenile / Üstüne Yaz Toggle Seçeneği (`chk-force-refresh` & `--force-refresh`):**
  - Arayüze "🔄 Zorla Yenile (Üstüne Yaz)" anahtarı eklendi. İşaretlendiğinde önbellek tamamen bypass edilir, dünün ya da seçilen aralıktaki tüm maçlar Forebet'ten sıfırdan çekilip güncellenir ve APEX API'ye aktarılır.
- **Dağıtım Paketi Güncellendi:**
  - `BPA_V4_APEX_DEPLOY.zip` (0.28 MB) tüm düzeltmelerle yeniden paketlendi.

## [4.0.0] — 2026-09-16
### 💎 BPA V4 Enterprise Desktop Control Center (.EXE), Görev Yöneticisi & Sistem Sağlık Radarı
- **Bağımsız Windows Masaüstü Programı (`BPA_Control_Center.exe` - 10.5 KB):**
  - C# ve Windows'un dahili `csc.exe` derleyicisi kullanılarak sıfır harici kütüphaneyle derlendi.
  - Siyah CMD pencereleri tamamen kaldırıldı (`CreateNoWindow = true`, `WindowStyle = Hidden`).
  - Edge/Chrome App Mode entegrasyonu ile çerçevesiz, sekmesiz, tam bir yerel masaüstü uygulaması penceresi (`1440x900`) olarak açılır.
  - Windows Sistem Tepsisine (System Tray) yerleşir: "Paneli Aç", "Görev Yöneticisi", "Sistem Sağlığı", "Acil Fren", "Çıkış" menüleri eklendi.
  - Tek oturum kalkanı (`BPA_V4_MASTER_CONTROL_CENTER_MUTEX`) ile mükerrer açılmalar engellendi.
  - `Masaustune_Kisayol_Olustur.bat` ile masaüstüne tek tıkla ikon oluşturma sağlandı.
- **Dahili Bot Görev Yöneticisi & Acil Fren (`core/task_monitor.js` & `/api/tasks`):**
  - Sistemde bota ve Puppeteer'a ait tüm `node.exe` ve `chrome.exe` süreçlerini anlık olarak PID, RAM tüketimi ve rollerine göre listeler.
  - Ana sunucu sürecini (`Port 3000`) korumalı tutar.
  - `🛑 ACİL FREN` butonu ile arkada unutulmuş tüm crawler ve Puppeteer sekmelerini tek tıkla temizler.
- **Sistem Sağlık ve Teşhis Radarı (`core/system_health.js` & `/api/system-health`):**
  - **14 Kritik Dosya Bütünlüğü:** Tüm parser, stealth, uploader ve konfigürasyon dosyalarını tarar (`%100 MÜKEMMEL`).
  - **Canlı APEX API Radarı:** `https://apex-api.playbettingtips.com/api/import.php` adresine anlık istek atarak milisaniye gecikme ve yetkilendirme doğrulaması yapar.
  - **Forebet Cloudflare Çerezi:** `cf_cookies_cache.json` yaşını ve token sayısını denetler.
  - **Windows Görev Zamanlayıcısı:** 06:00 ve 17:00 kayıtlarını izler ve arayüzden tek tıkla manuel çalıştırma imkanı sunar.
- **Entegre Canlı Matrix Terminal:**
  - Siyah konsol yerine arayüze entegre, JetBrains Mono fontlu karanlık mod akıcı log terminali.
  - `[Tümü]` `[Hatalar]` `[APEX]` `[Kazıma]` filtreleri, otomatik kaydırma ve `.txt` dışa aktarma eklendi.
- **Hafif Dağıtım Paketi:**
  - `BPA_V4_APEX_DEPLOY.zip` dosyası yalnızca **0.28 MB** boyutunda güncellendi.

## [3.5.0] — 2026-09-15
### 🌐 Canlı APEX API Entegrasyonu, Akıllı Arşivleme, Dinamik Zamanlayıcı & Dağıtım Paketi
- **Canlı APEX API HTTP Uploader (`core/apex_uploader.js`):**
  - Hedef endpoint: `https://apex-api.playbettingtips.com/api/import.php` (HTTPS POST, `X-Apex-Secret: apex_secret_key_2026`).
  - **50'şerli Paketleme (Chunks of 50):** Yüzlerce maç tek bir dev istek yerine 50'lik gruplar halinde sıralı (`sequential for...of` ve `await`) aktarılır.
  - **Otomatik Yeniden Deneme (Retry Logic):** Ağ hatası veya 5xx sunucu hatasında 5 saniye arayla 3 kez otomatik tekrar denenir; başarısızlık halinde veri kaybı olmaması için `data/sync_failed_<tarih>.json` yerel tamponuna alınır.
  - Canlı sunucuda 99 maçlık test paketi başarıyla gönderildi ve `HTTP 200 OK` yanıtı doğrulandı.
- **Yerel Aylık Arşivleme Mimarisi (`daily_pipeline.js`):**
  - Her kazınan bülten yerelde `data/predictions_YYYY-MM-DD.json` dosyasına yazıldığı gibi, otomatik olarak `data/archive/YYYY-MM/predictions_YYYY-MM-DD.json` dizinine arşivlenir. On binlerce klasör kirliliği önlenirken geçmiş veri güvenceye alınır.
- **Otomatik Zamanlayıcı & Dinamik Ayar Senkronizasyonu (`cron_scheduler.js`, `core/scheduler_manager.js`):**
  - **Sabah 06:00 Görevi:** Dünün tüm biten maçlarını (`status: FT`, final skorlar) kazıyıp kupon sonuçlandırma için APEX API'ye aktarır.
  - **Akşam 17:00 Görevi:** Yarının tüm bültenini (tahminler, oranlar, analizler) kazıyıp saat 21:00'deki VIP kupon üretimi için APEX API'ye aktarır.
  - **Dinamik Windows Task Scheduler Senkronizasyonu:** `config.json` veya Web UI üzerinden saatler güncellendiği an `syncWindowsTasks` fonksiyonu Windows Görev Zamanlayıcısındaki (`BPA_Bot_Morning` ve `BPA_Bot_Evening`) saatleri anında `schtasks /change /st` ile yeniden yapılandırır; yeniden başlatma gerektirmez.
- **Hafif ve Temiz Dağıtım Paketi (`BPA_V4_APEX_DEPLOY.zip` - 0.25 MB):**
  - `tools/create_deploy_package.js` geliştirildi. `node_modules/`, `output/`, devasa test JSON'ları ve loglar filtrelenerek sadece 250 KB'lık saf üretim paketi üretildi.
  - `README_DEPLOY.md` kapsamlı kurulum kılavuzu pakete eklendi.

## [3.4.4] — 2026-09-15
### ⚡ Akıllı Devam Etme (Fast Resume), Inactivity-Based Watchdog & Exit Code 1 Otomatik Kurtarma Kalkanı
- **Kaldığı Yerden Devam Etme & Sıfır Mükerrer Kazıma (`daily_pipeline.js`):**
  - Bot veya gün yeniden başlatıldığında, günün bültenindeki maçlar taranmadan önce `output/<slug>/match_data.json` dizinleri saniyenin onda biri sürede taranır.
  - Önceden başarıyla kazınmış olan maçlar anında önbellekten hafızaya (`results`) yüklenir ve sekme açmadan atlanır (`pendingQueue`).
  - Tarama örneğin 786. maçta kesildiyse, ilk 786 maç 0.1 saniyede yüklenir ve işçiler doğrudan 787. maçtan kazımaya başlar.
  - Günün tüm maçları zaten kazınmışsa günü 0.1 saniyede tamamlayıp doğrudan sıradaki tarihe geçer.
- **Süre Temelli Değil Hareketsizlik Temelli Watchdog (`bpa_desktop_agent.js`):**
  - 120 dakikalık sert süreç süresi sınırı (`maxProcessExecutionMinutes`) kaldırıldı. 5 günlük veya binlerce maçlık taramaların 2 saatten uzun sürdüğü için sebepsiz yere öldürülmesi (`Tarama Süreci 1 Koduyla Sona Erdi`) kökten çözüldü.
  - Watchdog artık gerçek hareketsizliği (`lastActivityTime`) ölçer. Bot log üretip maç kazıdığı sürece tarama 10-24 saat de sürse süreç asla öldürülmez. Yalnızca 15 dakika boyunca tek bir satır dahi log üretilmeyen gerçek donma durumlarında yeniden başlatma tetiklenir.
- **Exit Code 1 & Beklenmedik Kapanma Otomatik Kurtarma Kalkanı (`bpa_desktop_agent.js`):**
  - Kullanıcının manuel "Durdur" basmadığı tüm durumlarda (Windows bellek kesmesi, beklenmedik hata veya exit code 1), bot 5 saniye soğuma süresiyle son parametreleri (`mode`, `date`, `range`, `workers`) hatırlayarak otomatik olarak kaldığı yerden yeniden başlar.
- **Kesintisiz Konsol Döngüsü (`BPA_Agent_Launcher_GUI.bat`):**
  - Batch dosyası döngüsel yapıya kavuşturuldu; sunucu kapansa bile pencere kaybolmaz, otomatik olarak taze süreç başlatılır.

## [3.4.3] — 2026-09-11
### 🛡️ Ağ Kesintisi Dayanıklılığı, Cloudflare Turnstile OOPIF & CDP ProtocolError Zırhı
- **Cloudflare Turnstile Iframe `ProtocolError` Çözümü (`core/browser_engine.js`, `daily_crawler.js`):**
  - Sayfaya global `setExtraHTTPHeaders` uygulanması kaldırıldı. Cloudflare Turnstile'ın dinamik açtığı güvenlik çerçevelerine (OOPIF) Puppeteer'ın zorla CDP başlığı göndermeye çalışıp zaman aşımına uğraması (`Network.setExtraHTTPHeaders timed out`) kökünden engellendi.
  - Dil başlığı Chromium başlatma bayraklarındaki `--lang=en-US,en` ile yerel olarak sağlandı, `protocolTimeout: 180000` eklenerek CDP oturumları güçlendirildi.
- **Node.js v24 Unhandled Rejection Süreç Kalkanı:**
  - `core/browser_engine.js`, `daily_pipeline.js`, `scrape_match.js`, `bpa_desktop_agent.js` ve `daily_crawler.js` dosyalarına global `unhandledRejection` ve `uncaughtException` zırhı eklendi.
  - Puppeteer'ın iç `FrameManager` katmanından gelen yakalanmamış CDP veya hedef kapanma hatalarının Node.js sürecini `exit code 1` ile fatal crash etmesi kesin olarak engellendi.
- **Akıllı Ağ / İnternet Kesintisi Algılama & Otomatik Bekleme (`waitForInternetConnection`):**
  - `net::ERR_INTERNET_DISCONNECTED`, `net::ERR_NAME_NOT_RESOLVED`, `ERR_NETWORK_CHANGED` ve `ERR_CONNECTION_RESET` hataları tespit edildiğinde scraper deneme hakkını tüketmez veya maçı başarısız saymaz.
  - Ortak ağ kilidi devreye girer, işçiler beklemeye alınır ve her 3 saniyede bir DNS/ping testi yapılır. İnternet geri geldiği anda tarama sıfır kayıpla kaldığı maçtan devam eder.
- **Chromium Sekme Çökmesi Otomatik Kurtarma (`daily_pipeline.js`):**
  - İşçi döngüsünde sekmenin kapanması (`page.isClosed()`) veya `Target closed` durumunda işçi ölmez; anında temiz bir yeni sekme (`browser.newPage()`) oluşturup sıradaki maçı kazımayı sürdürür.

## [3.4.2] — 2026-09-11
### ⚡ Event Loop & Disk I/O Optimizasyonu (5 Dk Başlangıç Donması & Kilitlenme Çözüldü)
- **16.793 Maç Klasörünün Senkron Taranmasının Önlenmesi (`bpa_desktop_agent.js`):**
  - Sunucu ilk açılırken `output/` altındaki 16.793 klasörün ve içlerindeki 1.6 GB JSON verisinin `fs.readFileSync` ile senkron parse edilerek Node.js'i 5 dakika kilitlemesi sorunu tamamen giderildi.
  - Sadece en son eklenen 50 maçı okuyan hafif ve akıllı tarama algoritmasına geçildi. Başlatma süresi 5 dakikadan **1.2 saniyeye** indi.
- **Depolama Metrikleri Asenkron Önbellekleme (`cachedStorageMetrics`):**
  - Her saniye 40.000 dosyanın (16.793 output + 22.502 stealth profil dosyası) rekürsif `statSync` ile taranması durduruldu.
  - Boyutlar 60 saniyede bir arka planda asenkron güncelleniyor; yeni maç kazındıkça sayaç hafızada anında artırılıyor.
  - `/api/status` yanıt süresi 25+ saniyelik kilitlenmelerden **65 milisaniyeye** düşürüldü.
- **Tetikleme Uç Noktası & Buton Geri Bildirimi (`index.html`):**
  - "Tarih Aralığını Çek" butonu tıklandığında `await fetch(...)` ile sunucu yanıtı bekleniyor, buton anında spinner durumuna geçiyor.
  - Polling aralığı 2 saniyeye çıkarıldı ve `isDashboardUpdating` in-flight kilidi eklenerek tarayıcı ve sunucu üzerindeki yük sıfırlandı.
- **Tarih Aralığı Döngü Güvenliği (`daily_pipeline.js`):**
  - Tarih ayrıştırmalarında saat dilimi ve DST (yaz saati) kaymalarını önlemek için `T12:00:00` midday standardı getirildi.

## [3.4.1] — 2026-08-25
### ⏹️ Gelişmiş Görev Yaşam Döngüsü, Duraklat / Devam Et & Sistemi Kapat
- **Görevi İptal Et / Durdur Düzeltmesi (`bpa_desktop_agent.js`):**
  - Durdur butonuna basıldığında aktif süreç ve sinyal dosyaları temizleniyor; yeni tarih/görev verildiğinde eski görevin tekrarlanması sorunu tamamen çözüldü.
- **Canlı Duraklat / Devam Et (Pause / Resume):**
  - `pause_signal.txt` tabanlı sinyal döngüsü kuruldu. Tarama sırasında "Duraklat"a basıldığında işçiler mevcut maçı bitirip uykuya geçiyor; "Devam Et"e basıldığında kaldığı maçtan sıfır kayıpla devam ediyor.
- **Sistemi Kapat (Full Shutdown):**
  - Node.js sunucusunu, çalışan tüm scraper süreçlerini ve bot için açılmış tüm Chrome tarayıcılarını PowerShell üzerinden tek tıkla kapatan güvenli kapatma mekanizması eklendi.
- **Gecikmesiz Otomatik Tarayıcı Başlatma (`BPA_Agent_Launcher_GUI.bat`):**
  - Port açılmadan önce tarayıcının hata vermesi engellendi; port 3000 %100 açıldığı anda panel sayfası otomatik yükleniyor.

## [3.4.0] — 2026-08-25
### 🛡️ Kalıcı Profil, Oran Filtreleme & İnteraktif Cloudflare Kurtarma (Headless-to-Headful Escalation)
- **Oransız Maçları Eleme & Numerik Doğrulama:**
  - `daily_pipeline.js`, `core/daily_discovery.js` ve `daily_crawler.js` modüllerine sayısal oran filtresi (`odd > 1.0`) eklendi.
  - Oranı açılmamış amatör maçlar taranmadan eleniyor, terminal ve panelde kaç maçın elendiği net Türkçe loglarla gösteriliyor.
  - Forebet'in hem `<a href>` hem de `<tr onclick>` formatındaki maç linkleri yakalanıyor.
- **Kalıcı Profil & Otomatik Kurtarma (`core/browser_engine.js`):**
  - `data/stealth_profile` kalıcı tarayıcı profili mimarisine geçildi, çerez formatı (`loadCachedCookies`) CDP ile tam uyumlu hale getirildi.
  - **Akıllı İnteraktif Kurtarma (`triggerInteractiveChallenge`):** Arka plan taramasında Cloudflare takılması yaşanırsa bot pes etmez; kullanıcıya otomatik görsel bir Chrome penceresi açar ve sesli sinyal verir. Kullanıcı onayı geçtiği an çerezler kaydedilir, pencere kapanır ve arka plan taraması sıfır veri kaybıyla kaldığı yerden devam eder.
  - Tek tıkla yetkilendirme için `ONAYLA_VE_BASLAT.bat` ve `tools/auth_interactive.js` araçları eklendi.

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
