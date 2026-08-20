@echo off
chcp 65001 >nul
title BPA V3 - FOREBET LIVE SCRAPING & APEX SYNC CONTROL PANEL
color 0A

:MENU
cls
echo ===============================================================================
echo                BPA V3 — FOREBET KAZIMA VE APEX ENTEGRASYON KONTROL PANELİ
echo                           (v3.3.0-GOLDEN-MASTER RELEASE)
echo ===============================================================================
echo.
echo   [1] 🎯 BUGÜNÜN MAÇLARINI KAZI VE APEX'E GÖNDER (İlk 10 Maç Test)
echo   [2] 🚀 BUGÜNÜN TÜM MAÇLARINI KAZI VE APEX'E GÖNDER (Tam Bülten)
echo   [3] 📅 DÜNÜN BİTMİŞ MAÇLARINI KAZI (Sonuçlar, Penaltılar, AET - İlk 10 Maç)
echo   [4] 📅 DÜNÜN TÜM BİTMİŞ MAÇLARINI KAZI (Tam Arşiv)
echo   [5] 🔮 YARININ BÜLTENİNİ KAZI (İlk 10 Maç)
echo   [6] 🔗 TEK MAÇ KAZI (Özel Forebet URL'si Girerek)
echo   [7] 🌐 APEX API CANLI URL VE GİZLİ ANAHTAR AYARLA (Localhost / Hosting)
echo   [8] 🔬 MASTER SAĞLIK VE SIFIR-SAHTE VERİ TESTİ ÇALIŞTIR (9 Araç Testi)
echo   [9] 💻 LOCALHOST WEB GÖRÜNTÜLEYİCİ SUNUCUSUNU BAŞLAT (Port 3000)
echo   [0] 🚪 ÇIKIŞ
echo.
echo ===============================================================================
set /p SECIM="Lütfen bir işlem seçin (0-9): "

if "%SECIM%"=="1" goto BUGUN_10
if "%SECIM%"=="2" goto BUGUN_TUM
if "%SECIM%"=="3" goto DUN_10
if "%SECIM%"=="4" goto DUN_TUM
if "%SECIM%"=="5" goto YARIN_10
if "%SECIM%"=="6" goto TEK_MAC
if "%SECIM%"=="7" goto AYARLAR
if "%SECIM%"=="8" goto TEST_SUITE
if "%SECIM%"=="9" goto SUNUCU
if "%SECIM%"=="0" goto CIKIS

echo.
echo [HATA] Geçersiz seçim! Lütfen 0 ile 9 arasında bir sayı girin.
timeout /t 2 >nul
goto MENU

:BUGUN_10
cls
echo ===============================================================================
echo 🎯 BUGÜNÜN İLK 10 MAÇI KAZINIYOR VE APEX'E GÖNDERİLİYOR...
echo ===============================================================================
node daily_crawler.js --date=today --limit=10 --sync-apex=true
echo.
pause
goto MENU

:BUGUN_TUM
cls
echo ===============================================================================
echo 🚀 BUGÜNÜN TÜM MAÇLARI KAZINIYOR VE APEX'E GÖNDERİLİYOR...
echo ===============================================================================
node daily_crawler.js --date=today --sync-apex=true
echo.
pause
goto MENU

:DUN_10
cls
echo ===============================================================================
echo 📅 DÜNÜN BİTMİŞ MAÇLARI (İLK 10 MAÇ) KAZINIYOR VE SKORLAR GÜNCELLENİYOR...
echo ===============================================================================
node daily_crawler.js --date=yesterday --limit=10 --sync-apex=true
echo.
pause
goto MENU

:DUN_TUM
cls
echo ===============================================================================
echo 📅 DÜNÜN TÜM BİTMİŞ MAÇLARI KAZINIYOR VE SKORLAR GÜNCELLENİYOR...
echo ===============================================================================
node daily_crawler.js --date=yesterday --sync-apex=true
echo.
pause
goto MENU

:YARIN_10
cls
echo ===============================================================================
echo 🔮 YARININ BÜLTENİ (İLK 10 MAÇ) KAZINIYOR...
echo ===============================================================================
node daily_crawler.js --date=tomorrow --limit=10 --sync-apex=true
echo.
pause
goto MENU

:TEK_MAC
cls
echo ===============================================================================
echo 🔗 TEK MAÇ KAZIMA MODU
echo ===============================================================================
echo.
set /p TEK_URL="Forebet Maç URL'sini yapıştırın: "
if "%TEK_URL%"=="" (
    echo [HATA] URL boş bırakılamaz!
    pause
    goto MENU
)
echo.
echo Kazıma başlatılıyor: %TEK_URL%
node scrape_match.js --url="%TEK_URL%" --sync-apex=true
echo.
pause
goto MENU

:AYARLAR
cls
echo ===============================================================================
echo 🌐 APEX API BAĞLANTI VE HOSTING AYARLARI
echo ===============================================================================
echo Mevcut ayarlar config.json dosyasından okunuyor.
echo.
echo Örnek Localhost: http://localhost/apex-api/api/import.php
echo Örnek Canlı Hosting: https://api.sizinsiteniz.com/api/import.php
echo.
set /p YENI_URL="Yeni APEX Import URL girin (Boş bırakırsanız değişmez): "
set /p YENI_KEY="Yeni APEX Gizli Anahtar (Secret) girin (Boş bırakırsanız değişmez): "

node -e "
const fs = require('fs');
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync('config.json', 'utf8')); } catch(e){}
if ('%YENI_URL%'.trim() !== '' && !'%YENI_URL%'.startsWith('%%')) cfg.apexImportUrl = '%YENI_URL%'.trim();
if ('%YENI_KEY%'.trim() !== '' && !'%YENI_KEY%'.startsWith('%%')) cfg.apexSecret = '%YENI_KEY%'.trim();
fs.writeFileSync('config.json', JSON.stringify(cfg, null, 2), 'utf8');
console.log('✅ config.json başarıyla güncellendi:');
console.log(cfg);
"
echo.
pause
goto MENU

:TEST_SUITE
cls
echo ===============================================================================
echo 🔬 MASTER SAĞLIK VE TEST SUITE ÇALIŞTIRILIYOR...
echo ===============================================================================
node tools/run_all_tests.js
echo.
pause
goto MENU

:SUNUCU
cls
echo ===============================================================================
echo 💻 WEB KONTROL PANELİ VE GÖRÜNTÜLEYİCİ BAŞLATILIYOR...
echo ===============================================================================
echo.
echo 🌐 Tarayıcı otomatik açılıyor: http://localhost:3050
echo 🛑 Sunucuyu durdurmak için bu pencereyi kapatabilir veya Ctrl+C basabilirsiniz.
echo.
start http://localhost:3050
node server.js
pause
goto MENU

:CIKIS
cls
echo Görüşmek üzere! BPA V3 kapatılıyor.
timeout /t 2 >nul
exit
