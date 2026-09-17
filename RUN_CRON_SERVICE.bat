@echo off
title BPA V4 - 7/24 OTOMATIK ZAMANLAYICI SERVISI (CRON DAEMON)
cd /d "%~dp0"
echo ====================================================================
echo   BPA V4 - 7/24 ARALIKSIZ ZAMANLAYICI SERVISI (CRON DAEMON)
echo ====================================================================

if not exist "%~dp0node_modules\puppeteer-extra" (
    echo.
    echo ===================================================
    echo   [ILK KURULUM] node_modules paketleri yukleniyor...
    echo   Lutfen bekleyin, npm install calisiyor...
    echo ===================================================
    call npm install
    if errorlevel 1 (
        echo [HATA] npm install basarisiz oldu!
        pause
        exit /b 1
    )
)

echo Sabah 06:00 ve Aksam 17:00 gorevleri otomatik calisacaktir.
echo config.json dosyasini degistirdiginizde saatler otomatik guncellenir.
echo.

:loop
echo [CRON SERVISI] Baslatiliyor: node cron_scheduler.js
node cron_scheduler.js
echo.
echo [UYARI] Servis beklenmedik sekilde kapandi. 5 saniye icinde yeniden baslatiliyor...
ping -n 6 127.0.0.1 >nul
goto loop
