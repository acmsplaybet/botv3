@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul
title BPA V3 - FOREBET LIVE SCRAPING & APEX SYNC CONTROL PANEL
color 0A

:MENU
cls
echo ===============================================================================
echo                BPA V3 -- FOREBET KAZIMA VE APEX ENTEGRASYON KONTROL PANELI
echo                           (v3.3.0-GOLDEN-MASTER RELEASE)
echo ===============================================================================
echo.
echo   [1] BUGUNUN MACLARINI KAZI VE APEX'E GONDER (Ilk 10 Mac Test)
echo   [2] BUGUNUN TUM MACLARINI KAZI VE APEX'E GONDER (Tam Bulten)
echo   [3] DUNUN BITMIS MACLARINI KAZI (Sonuclar, Penaltilar, AET - Ilk 10 Mac)
echo   [4] DUNUN TUM BITMIS MACLARINI KAZI (Tam Arsiv)
echo   [5] YARININ BULTENINI KAZI (Ilk 10 Mac)
echo   [6] TEK MAC KAZI (Ozel Forebet URL'si Girerek)
echo   [7] APEX API CANLI URL VE GIZLI ANAHTAR AYARLA (Localhost / Hosting)
echo   [8] MASTER SAGLIK VE SIFIR-SAHTE VERI TESTI CALISTIR (9 Arac Testi)
echo   [9] WEB KONTROL PANELINI VE TARAYICIYI AC (http://localhost:3050)
echo   [0] CIKIS
echo.
echo ===============================================================================
set /p SECIM="Lutfen bir islem secin (0-9): "

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
echo [HATA] Gecersiz secim! Lutfen 0 ile 9 arasinda bir sayi girin.
timeout /t 2 >nul
goto MENU

:BUGUN_10
cls
echo ===============================================================================
echo BUGUNUN ILK 10 MACI KAZINIYOR VE APEX'E GONDERILIYOR...
echo ===============================================================================
node daily_crawler.js --date=today --limit=10 --sync-apex=true
echo.
pause
goto MENU

:BUGUN_TUM
cls
echo ===============================================================================
echo BUGUNUN TUM MACLARI KAZINIYOR VE APEX'E GONDERILIYOR...
echo ===============================================================================
node daily_crawler.js --date=today --sync-apex=true
echo.
pause
goto MENU

:DUN_10
cls
echo ===============================================================================
echo DUNUN BITMIS MACLARI (ILK 10 MAC) KAZINIYOR VE SKORLAR GUNCELLENIYOR...
echo ===============================================================================
node daily_crawler.js --date=yesterday --limit=10 --sync-apex=true
echo.
pause
goto MENU

:DUN_TUM
cls
echo ===============================================================================
echo DUNUN TUM BITMIS MACLARI KAZINIYOR VE SKORLAR GUNCELLENIYOR...
echo ===============================================================================
node daily_crawler.js --date=yesterday --sync-apex=true
echo.
pause
goto MENU

:YARIN_10
cls
echo ===============================================================================
echo YARININ BULTENI (ILK 10 MAC) KAZINIYOR...
echo ===============================================================================
node daily_crawler.js --date=tomorrow --limit=10 --sync-apex=true
echo.
pause
goto MENU

:TEK_MAC
cls
echo ===============================================================================
echo TEK MAC KAZIMA MODU
echo ===============================================================================
echo.
set /p TEK_URL="Forebet Mac URL'sini yapistirin: "
if "%TEK_URL%"=="" (
    echo [HATA] URL bos birakilamaz!
    pause
    goto MENU
)
echo.
echo Kazima baslatiliyor: %TEK_URL%
node scrape_match.js --url="%TEK_URL%" --sync-apex=true
echo.
pause
goto MENU

:AYARLAR
cls
echo ===============================================================================
echo APEX API BAGLANTI VE HOSTING AYARLARI
echo ===============================================================================
echo Mevcut ayarlar config.json dosyasindan okunuyor.
echo.
echo Ornek Localhost: http://localhost/apex-api/api/import.php
echo Ornek Canli Hosting: https://api.sizinsiteniz.com/api/import.php
echo.
set /p YENI_URL="Yeni APEX Import URL girin (Bos birakirsaniz degismez): "
set /p YENI_KEY="Yeni APEX Gizli Anahtar girin (Bos birakirsaniz degismez): "

node -e "const fs=require('fs');let c={};try{c=JSON.parse(fs.readFileSync('config.json','utf8'))}catch(e){}const u='%YENI_URL%'.trim();const k='%YENI_KEY%'.trim();if(u&&!u.startsWith('%%'))c.apexImportUrl=u;if(k&&!k.startsWith('%%'))c.apexSecret=k;fs.writeFileSync('config.json',JSON.stringify(c,null,2),'utf8');console.log('Guncel Config:',c);"
echo.
pause
goto MENU

:TEST_SUITE
cls
echo ===============================================================================
echo MASTER SAGLIK VE TEST SUITE CALISTIRILIYOR...
echo ===============================================================================
node tools/run_all_tests.js
echo.
pause
goto MENU

:SUNUCU
cls
echo ===============================================================================
echo WEB KONTROL PANELI BASLATILIYOR...
echo ===============================================================================
echo.
echo Tarayici aciliyor: http://localhost:3050
echo Sunucuyu durdurmak icin bu pencerede Ctrl+C basabilirsiniz.
echo.
start http://localhost:3050
node server.js
pause
goto MENU

:CIKIS
cls
echo Gorusmek uzere! BPA V3 kapatiliyor.
timeout /t 2 >nul
exit
