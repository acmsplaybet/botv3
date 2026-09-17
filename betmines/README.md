# ⚡ BETMINES BOT (BPI V6 - NODE.JS PUPPETEER STEALTH)
> **Master Agent & Geliştirici Kılavuzu**  
> Bu dosya, `betmines/` projesinin mimarisini, çalışma mantığını, TR erişim/proxy yapılandırmasını ve geliştirme adımlarını içerir. Gelecekte projeye devam ederken bu dosyayı temel al.

---

## 📌 1. PROJENİN AMACI VE HİKAYESİ
Bu proje, önceden tarayıcıda Violentmonkey / Tampermonkey eklentisiyle (`betmines.js`) çalışan **BPI (BetPulse Intelligence) V6** botunun, tarayıcı eklentilerine ihtiyaç duymadan **bağımsız bir Node.js + Puppeteer Stealth** botuna dönüştürülmüş halidir.

### 🌟 Temel Hedefler:
1. **Violentmonkey Bağımsızlığı:** Tarayıcıyı el ile açıp eklenti yönetme ihtiyacını ortadan kaldırmak.
2. **Sürekli Açık Canlı Pencere (`headless: false`):** Chromium penceresi ekranda görünür kalır. Cloudflare Turnstile / Bot doğrulaması çıkarsa bot önce otomatik dener, çözemezse ekrandan kullanıcı manuel tıklayarak anında çözebilir.
3. **TR Erişim & Proxy Desteği:** Türkiye ISP'leri tarafından `betmines.com` için uygulanan SNI/DPI engeli (`ECONNRESET`), `config.js` içindeki proxy desteği veya sistem VPN'i üzerinden otomatik aşılır.
4. **Çift Modlu Otomasyon:**
   - **NIGHT (Full Senkron):** Dün, Bugün, Yarın, Yarından Sonra sekmelerini dolaşır, sayfayı smooth-scroll ile tarar ve tüm maçları API'ye iletir.
   - **LIVE (Canlı Radar):** Canlı maçları (00:00-03:00 arası Dün+Bugün, diğer saatlerde Bugün) 1-3 dakikalık aralıklarla tarar ve canlı skor/dakikaları API'ye iletir.
5. **Hedef API:** Kazınan veriler `https://realmobilebet.com/bpiv2/api/receiver.php` adresine POST edilir.

---

## 📁 2. MODÜLER DOSYA MİMARİSİ

```text
c:/xampp/htdocs/botv4/betmines/
  ├── README.md                 # Bu master rehber dosyası
  ├── config.js                 # Proxy, API URL, tarama aralıkları ve ayarlar
  ├── runner.js                 # Ana Otopilot Başlatıcı (node betmines/runner.js)
  ├── betmines.js               # Orijinal Violentmonkey userscript referansı
  │
  ├── core/
  │    ├── browser.js           # Puppeteer Stealth + Proxy + Kalıcı Profil + Cloudflare Bypass
  │    └── navigator.js         # Tarih sekmeleri (Dün/Bugün/Yarın), Live filtreleme ve Smart Scroll
  │
  ├── parsers/
  │    └── match_parser.js      # DOM'dan Lig, Takımlar, Skor, Dakika, Oran, Tahmin (%) ve Durum çıkarma
  │
  ├── sync/
  │    └── api_sender.js        # realmobilebet.com receiver.php'ye JSON POST ileticisi
  │
  ├── data/                     # Kalıcı Chromium profili ve Cloudflare çerezleri
  │    └── cf_cookies.json
  │
  └── tools/
       ├── test_connection.js   # Betmines bağlantı & proxy doğrulama testi
       └── test_single_scrape.js# Tek seferlik hızlı veri çekme testi
```

---

## ⚙️ 3. AYARLAR VE YAPILANDIRMA (`config.js`)

| Parametre | Varsayılan | Açıklama |
| :--- | :--- | :--- |
| `targetUrl` | `https://betmines.com/` | Betmines ana sayfası |
| `apiUrl` | `https://realmobilebet.com/bpiv2/api/receiver.php` | Verinin gideceği alıcı API |
| `apiKey` | `bpi_master_key` | API güvenlik anahtarı |
| `proxy` | `""` (veya `http://...` / `socks5://...`) | TR engeli için HTTP/SOCKS5 Proxy adresi |
| `headless` | `false` | Tarayıcının ekranda görünür kalması (`true` yapılırsa arka planda gizli çalışır) |
| `liveIntervalMs` | `60000` (1 dk) / `180000` (3 dk) | Canlı maç varsa 1 dk, yoksa 3 dk uyuma süresi |
| `nightIntervalMin` | `60` | Full senkron tekrar periyodu (dakika) |

---

## 🚀 4. ÇALIŞTIRMA VE TEST KOMUTLARI

### A) Bağlantı ve Proxy Testi:
```bash
node betmines/tools/test_connection.js
```

### B) Tek Seferlik Sayfa Kazıma Testi:
```bash
node betmines/tools/test_single_scrape.js
```

### C) 7/24 Otopilot Canlı Botu Başlatma:
```bash
node betmines/runner.js
```

---

## 🛡️ 5. CLOUDFLARE VE MANUEL MÜDAHALE
- `core/browser.js` içerisindeki `bypassCloudflareIfNeeded` fonksiyonu sayfadaki Turnstile checkbox'larını otomatik tespit edip tıklar.
- Eğer Cloudflare geçilemezse, `headless: false` modu sayesinde Chromium penceresi ekranda açık olduğundan ekrana tıklayarak insan doğrulamasını saniyeler içinde tamamlayabilirsin.
- Çözülen oturumun çerezleri `betmines/data/cf_cookies.json` içine saklanır, böylece sonraki döngülerde tekrar tekrar sormaz.

---

## 📝 6. GELECEKTE DEVAM EDERKEN NEREDEN BAŞLANMALI?
Agent'a döndüğünde şu komutla veya mesajla başlayabilirsin:
> *"Betmines botunu geliştirmeye devam edelim, proxy ayarlarını test edip canlıya alalım."*

Agent doğrudan bu `README.md` dosyasını okuyarak kaldığı yerden `runner.js`, `core/` ve `parsers/` üzerinden geliştirmeye devam edecektir.
