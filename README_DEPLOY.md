# 🚀 BPA V4 / BOTV4 — Uzak Sunucu & PC Dağıtım Rehberi (DEPLOY GUIDE)

Bu paket, **Forebet Canlı Kazıma Motoru** ve **Canlı APEX API (`https://apex-api.playbettingtips.com/api/import.php`)** tam otomatik entegrasyonunu içerir.

---

## 📋 Gereksinimler

1. **İşletim Sistemi:** Windows 10 / 11 veya Windows Server (veya Linux / Ubuntu).
2. **Node.js:** Node.js v18+ veya v20+ (LTS önerilir: [nodejs.org](https://nodejs.org/)).
3. **Google Chrome:** Puppeteer için standart Google Chrome kurulu olmalıdır.

---

## ⚡ Hızlı Kurulum (2 Adım)

### Adım 1: Bağımlılıkları Yükleyin
Paket klasöründe bir komut satırı (CMD / PowerShell) açın ve çalıştırın:
```bash
npm install
```
*(Puppeteer Stealth ve gerekli hafif modüller otomatik olarak yüklenecektir).*

### Adım 2: Çalıştırma Yönteminizi Seçin

#### 💎 Yöntem A: Tek Tıkla Masaüstü Programı (.EXE) — EN KOLAY & TAVSİYE EDİLEN
1. [`Masaustune_Kisayol_Olustur.bat`](Masaustune_Kisayol_Olustur.bat) dosyasına çift tıklayın. Masaüstünüze **"BPA Control Center"** ikonu gelecektir.
2. Masaüstündeki ikona veya doğrudan [`BPA_Control_Center.exe`](BPA_Control_Center.exe) dosyasına çift tıklayın:
   - **Sıfır Siyah Konsol:** Arka planda siyah CMD pencereleri açılmaz, tamamen sessiz çalışır.
   - **Masaüstü App Penceresi:** Adres çubuğu ve sekme olmadan bağımsız bir masaüstü programı olarak açılır.
   - **System Tray İkonu:** Saatin yanına (sağ alta) simgesi yerleşir; sağ tıklayarak paneli açabilir, acil durdurma yapabilir veya çıkış yapabilirsiniz.
   - **Dahili Görev Yöneticisi:** Bot süreçlerini listeler, tek tıkla `🛑 ACİL FREN` ile tüm botu ve sekmeleri sonlandırır.
   - **Sistem Sağlık Radarı:** APEX canlı pingini, dosya bütünlüğünü ve Cloudflare çerezini test eder.

#### 🌟 Yöntem B: Tam Otomatik Windows Görev Zamanlayıcısı (7/24 Sıfır Pencere)
1. [`setup_windows_tasks.bat`](setup_windows_tasks.bat) dosyasına sağ tıklayın ve **"Yönetici Olarak Çalıştır"** seçin.
2. Windows işletim sistemine 2 adet arka plan görevi kaydedilecektir:
   - **Sabah 06:00 (Dünün Maçları):** Dün oynanan tüm maçların final skorlarını (`status: FT`) çeker, kuponları sonuçlandırmak üzere APEX API'ye aktarır.
   - **Akşam 17:00 (Yarının Bülteni):** Yarın oynanacak maçların oranlarını, tahminlerini ve istatistiklerini çeker, saat 21:00'deki VIP kupon üretimi için APEX API'ye aktarır.
3. **Pencere açık tutmanıza gerek yoktur.** Bilgisayar yeniden başlasa bile Windows saati geldiğinde otomatik çalıştırır.

#### 🖥️ Yöntem C: Standart Web Başlatıcı (.BAT)
- [`BPA_Agent_Launcher_GUI.bat`](BPA_Agent_Launcher_GUI.bat) dosyasını çalıştırın. Tarayıcınızda `http://localhost:3000` panelini açar.

---

## 🎯 Hızlı Manuel Test ve Kısayollar

- **Sabah Görevini Şimdi Test Et:** [`RUN_MORNING_0600.bat`](RUN_MORNING_0600.bat)
- **Akşam Görevini Şimdi Test Et:** [`RUN_EVENING_1700.bat`](RUN_EVENING_1700.bat)
- **APEX API Bağlantı Testi:**
  ```bash
  node tools/upload_to_apex.js --test
  ```
- **İstenen Tarihi APEX'e Gönder:**
  ```bash
  node tools/upload_to_apex.js --date=yesterday
  node tools/upload_to_apex.js --date=tomorrow
  node tools/upload_to_apex.js --file=data/predictions_2026-09-17.json
  ```

---

## 🔧 Yapılandırma (`config.json`)

Ayarları değiştirmek için `config.json` dosyasını düzenlemeniz yeterlidir. Değişiklikler anında algılanır ve Windows Görev Zamanlayıcısına yansıtılır:
```json
{
  "cron_yesterday": "06:00",
  "cron_tomorrow": "17:00",
  "concurrency": 4,
  "autoSyncApex": true,
  "apexImportUrl": "https://apex-api.playbettingtips.com/api/import.php",
  "apexSecret": "apex_secret_key_2026"
}
```

---

## 🛡️ Hata Kurtarma & Güvenlik
1. **Akıllı Devam Etme (Fast Resume):** Tarama herhangi bir sebeple yarıda kesilirse, yeniden başladığında çekilmiş maçları 0.1 saniyede yerel önbellekten tanır ve sıfır internet harcayarak doğrudan kaldığı maçtan devam eder.
2. **50'lik Paketler & 3x Retry:** APEX API'ye veriler 50'şer maçlık güvenli bloklar halinde gönderilir. Ağ hatası alınırsa 5 saniye arayla 3 kez denenir; başarısız olursa `data/sync_failed_<tarih>.json` tamponuna alınır.
3. **Yerel Arşiv:** Çekilen her günün verisi hem `data/predictions_YYYY-MM-DD.json` hem de `data/archive/YYYY-MM/` klasörüne yedeklenir.
